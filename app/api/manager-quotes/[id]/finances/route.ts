import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { canAccessManagerQuote, canViewCash, canViewInvoices } from "@/lib/manager-scope";
import { prisma } from "@/lib/prisma";
import { loadCnyRateHistory, cnyRateRubAsOf, usdRateRubAsOf } from "@/lib/desk-services/historical-cny-rate";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// Вкладка «Финансы» на карточке просчёта — читает уже существующие данные
// (IssuedInvoice/CashOrder/QuotePaymentAllocation), ничего не пересчитывает
// и не создаёт. См. план mellow-forging-kay.md, PB-V5 chat 2026-08-23.
export async function GET(req: NextRequest, { params }: RouteParams) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  const { id } = await params;
  const quote = await prisma.quote.findUnique({ where: { id }, select: { id: true, displayId: true, managerId: true, deletedAt: true } });
  if (!quote || quote.deletedAt) {
    return Response.json({ error: "Просчёт не найден." }, { status: 404 });
  }
  if (!(await canAccessManagerQuote(session, quote.managerId))) {
    return Response.json({ error: "Нет доступа к этому просчёту." }, { status: 403 });
  }

  // Два раздела гейтятся независимо друг от друга — менеджер может иметь
  // доступ к счетам, но не к Кассе, или наоборот; не валим весь роут в 403
  // из-за одного недостающего права.
  const [showInvoices, showCash] = await Promise.all([canViewInvoices(session), canViewCash(session)]);

  const [invoiceRows, cashOrders] = await Promise.all([
    showInvoices
      ? prisma.issuedInvoice.findMany({
          where: { quotes: { some: { quoteId: id } } },
          orderBy: { createdAt: "desc" },
          include: {
            manager: { select: { id: true, name: true } },
            quotes: { select: { quote: { select: { id: true, displayId: true } } } },
          },
        })
      : [],
    showCash
      ? prisma.cashOrder.findMany({
          where: { OR: [{ quoteId: id }, { paymentAllocations: { some: { quoteId: id } } }] },
          include: {
            account: { select: { name: true } },
            category: { select: { name: true, type: true } },
            createdByManager: { select: { name: true } },
            paymentAllocations: { select: { id: true, quoteId: true, category: true, amountRub: true } },
          },
          orderBy: { date: "desc" },
        })
      : [],
  ]);

  const invoices = invoiceRows.map((inv) => ({
    id: inv.id,
    displayId: inv.displayId,
    type: inv.type,
    currency: inv.currency,
    amountTotal: inv.amountTotal.toString(),
    fileName: inv.fileName,
    note: inv.note,
    cancelled: inv.cancelled,
    cancelledAt: inv.cancelledAt,
    createdAt: inv.createdAt,
    manager: inv.manager,
    // Прочие просчёты, покрытые этим же счётом (пакетный/массовый счёт) —
    // без этого сумма счёта легко читается как "весь этот счёт про этот
    // просчёт", хотя на самом деле это может быть общий счёт на несколько.
    alsoCoversQuotes: inv.quotes.map((q) => q.quote).filter((q) => q.id !== id),
  }));

  // ¥/$-ордера переводим в ₽ только для сводки в шапке — курсом НА ДАТУ
  // ордера (не сегодняшним), та же логика, что уже в
  // lib/desk-services/quote-real-financials.ts — иначе сводка "плывёт"
  // при каждом обновлении Тарифов, ровно как профит-отчёт "плыл" до
  // фикса от 2026-08-17.
  const rateHistory = showCash ? await loadCnyRateHistory() : [];

  let incomeRub = 0;
  let expenseRub = 0;
  const cashMovements = cashOrders.map((order) => {
    const thisQuoteAllocs = order.paymentAllocations.filter((a) => a.quoteId === id);
    const otherQuoteIds = new Set(order.paymentAllocations.filter((a) => a.quoteId !== id).map((a) => a.quoteId));
    // Если по ордеру есть срез именно на этот просчёт — это и есть точная
    // сумма (всегда ₽, по контракту схемы QuotePaymentAllocation.amountRub),
    // сумма самого ордера при этом игнорируется целиком: ордер мог быть
    // массовым на несколько просчётов сразу, или одновременно иметь и
    // прямой quoteId, и аллокацию на тот же просчёт (когда менеджер вручную
    // привязал приходный ордер в обычной Кассе — см.
    // lib/desk-services/cash-order-profit-sync.ts). Без среза — это прямой
    // расходный ордер (напр. "Закупка товара"), берём сумму ордера как есть.
    const amountForQuote =
      thisQuoteAllocs.length > 0 ? thisQuoteAllocs.reduce((sum, a) => sum + Number(a.amountRub), 0) : Number(order.amount);
    const currencyForQuote = thisQuoteAllocs.length > 0 ? "rub" : order.currency;

    const rubEquivalent =
      currencyForQuote === "rub"
        ? amountForQuote
        : currencyForQuote === "cny"
          ? amountForQuote * (cnyRateRubAsOf(rateHistory, order.date) ?? 0)
          : amountForQuote * (usdRateRubAsOf(rateHistory, order.date) ?? 0);

    if (order.type === "income") incomeRub += rubEquivalent;
    else expenseRub += rubEquivalent;

    return {
      id: order.id,
      date: order.date,
      type: order.type,
      currencyForQuote,
      amountForQuote: amountForQuote.toString(),
      category: order.category,
      account: order.account,
      createdByManager: order.createdByManager,
      comment: order.comment,
      isBulkSplit: otherQuoteIds.size > 0,
      otherQuotesCount: otherQuoteIds.size,
      rubEquivalent,
    };
  });

  return Response.json({
    quote: { id: quote.id, displayId: quote.displayId },
    invoicesVisible: showInvoices,
    invoices,
    cashVisible: showCash,
    cashMovements,
    // amountTotal счетов сюда намеренно не входит — это выставленное, а не
    // полученное (см. схемный комментарий IssuedInvoice: "Deliberately NOT
    // a payment tracker").
    summary: { incomeRub, expenseRub, netRub: incomeRub - expenseRub },
  });
}
