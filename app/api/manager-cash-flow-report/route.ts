import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { getVisibleManagerIds } from "@/lib/manager-scope";
import { prisma } from "@/lib/prisma";
import { fetchQuoteReserveRows } from "@/lib/desk-services/quote-reserve";
import { buildPeriodReport } from "@/lib/desk-services/period-report";

function parseMonthRange(monthParam: string | null): [Date, Date] {
  const match = monthParam?.match(/^(\d{4})-(\d{2})$/);
  const now = new Date();
  const year = match ? Number(match[1]) : now.getFullYear();
  const monthIndex = match ? Number(match[2]) - 1 : now.getMonth();
  return [new Date(year, monthIndex, 1), new Date(year, monthIndex + 1, 1)];
}

// Те же ярлыки, что PROFIT_CATEGORY_LABEL в create-payment-dialog.tsx —
// QuotePaymentAllocation.category не связана с CashCategory (своя, более
// узкая, enum-фиксированная линейка "услуг просчёта"), так что имя статьи
// для приходов приходится подставлять по этой же таблице соответствия, а
// не читать из БД, как для расходов ниже.
const PAYMENT_CATEGORY_LABEL: Record<string, string> = {
  goods: "Стоимость товара",
  china_delivery: "Доставка по Китаю",
  search_service: "Услуга поиска",
  custom_production: "Производство под заказ",
  buyout_commission: "Комиссия за выкуп",
  attached_services: "Доп. услуги",
};

// «Отчёт о движении средств» — самообслуживание менеджера: по каждому
// своему клиенту видит, какие счета выставлялись (IssuedInvoice) и какие
// были реальные приходы/расходы по его просчётам, без доступа к чужим
// клиентам/просчётам (та же граница видимости, что уже используют
// /api/manager-dashboard и создание приходного/расходного ордера —
// getVisibleManagerIds: "all" для owner, команда для senior, только свои
// для manager/outsource_manager). Никаких owner-confidential цифр
// (премия, маржа) — только реальные суммы, ровно то, что менеджер и так
// видит по каждому просчёту в карточке клиента.
//
// Расход (закупка/доставка/карго) записывается через "Расходный ордер"
// (app/api/manager-quotes/[id]/expense-order) — CashOrder там СРАЗУ несёт
// quoteId, читаем напрямую. Приход (оплата клиента) идёт через
// "Приходный ордер" (app/api/manager-quotes/create-payment) — там ОДИН
// CashOrder может покрывать НЕСКОЛЬКО просчётов сразу, поэтому у самого
// CashOrder quoteId не проставлен: связь с просчётом и суммой по нему
// живёт в QuotePaymentAllocation (amountRub, не amountCny — конвертируем
// по курсу того же CashOrder, чтобы отчёт был весь в ¥, как остальная
// Касса). См. план «Самообслуживание менеджера», PB-V5 chat 2026-09-11.
export async function GET(req: NextRequest) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  const [monthStart, monthEnd] = parseMonthRange(req.nextUrl.searchParams.get("month"));
  const visibleManagerIds = await getVisibleManagerIds(session);
  const managerScope = visibleManagerIds === "all" ? {} : { managerId: { in: visibleManagerIds } };

  const quotes = await prisma.quote.findMany({
    where: { deletedAt: null, ...managerScope },
    select: { id: true, displayId: true, productName: true, clientId: true, client: { select: { id: true, name: true } } },
  });
  if (quotes.length === 0) {
    return Response.json({ clients: [] });
  }

  const quoteIds = quotes.map((q) => q.id);
  const clientIds = [...new Set(quotes.map((q) => q.clientId))];
  const quoteById = new Map(quotes.map((q) => [q.id, q]));

  const [invoices, expenseOrders, incomeAllocations] = await Promise.all([
    // IssuedInvoice привязан к клиенту напрямую (не к конкретному просчёту
    // одним полем — счёт может покрывать несколько просчётов), группируем
    // сразу по clientId.
    prisma.issuedInvoice.findMany({
      where: { clientId: { in: clientIds }, createdAt: { gte: monthStart, lt: monthEnd } },
      select: { id: true, displayId: true, type: true, currency: true, amountTotal: true, createdAt: true, cancelled: true, clientId: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.cashOrder.findMany({
      where: { type: "expense", quoteId: { in: quoteIds }, date: { gte: monthStart, lt: monthEnd } },
      select: { id: true, date: true, amountCny: true, comment: true, quoteId: true, category: { select: { name: true } } },
      orderBy: { date: "desc" },
    }),
    prisma.quotePaymentAllocation.findMany({
      where: { quoteId: { in: quoteIds }, cashOrder: { date: { gte: monthStart, lt: monthEnd } } },
      select: {
        id: true,
        quoteId: true,
        category: true,
        amountRub: true,
        cashOrder: { select: { date: true, comment: true, cnyToCurrencyRate: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const byClientId = new Map<
    string,
    {
      clientId: string;
      clientName: string;
      invoices: { id: string; displayId: number; type: string; currency: string; amountTotal: number; createdAt: string; cancelled: boolean }[];
      orders: {
        id: string;
        date: string;
        type: string;
        amountCny: number;
        comment: string;
        quoteDisplayId: number;
        productName: string;
        categoryName: string;
      }[];
      incomeCny: number;
      expenseCny: number;
      // Резерв под выкуп — сколько из incomeCny этого клиента ещё реально
      // не потрачено на закупку (та же формула, что и в Кассе, см.
      // lib/desk-services/quote-reserve.ts). Не зависит от выбранного
      // месяца — это "на сейчас" состояние по открытым просчётам клиента,
      // не сумма движений за период. Добавлено, чтобы рядовому менеджеру
      // не приходилось идти в Кассу, чтобы понять, почему "поступило" по
      // клиенту не равно уже заработанной прибыли. См. PB-V5 chat
      // 2026-09-13.
      reservedCny: number;
    }
  >();

  for (const q of quotes) {
    if (!byClientId.has(q.clientId)) {
      byClientId.set(q.clientId, {
        clientId: q.clientId,
        clientName: q.client.name,
        invoices: [],
        orders: [],
        incomeCny: 0,
        expenseCny: 0,
        reservedCny: 0,
      });
    }
  }

  const { rows: reserveRows } = await fetchQuoteReserveRows(managerScope);
  for (const row of reserveRows) {
    const bucket = byClientId.get(row.clientId);
    if (bucket) bucket.reservedCny += row.reservedCny;
  }

  // "Доход с выкупа за месяц" — ЭТО база расчёта премии менеджера, поэтому
  // должен быть ровно тем же числом, что дашборд уже показывает в "Выкуп:
  // поступило/потратили" (periodOverall, см. app/api/manager-dashboard/
  // route.ts) — тот же buildPeriodReport, по датам реальных событий, а не
  // сырой приход/расход за месяц минус резерв "на сейчас" (это было два
  // разных числа для одной и той же базы премии). См. PB-V5 chat
  // 2026-09-13.
  const realPeriod = await buildPeriodReport({ from: monthStart, to: monthEnd });
  const visibleFlows =
    visibleManagerIds === "all" ? realPeriod.managerFlows : realPeriod.managerFlows.filter((f) => visibleManagerIds.includes(f.managerId));
  const realBuyoutIncomeRub = visibleFlows.reduce((sum, f) => sum + f.buyoutIncomeRub, 0);
  const realBuyoutExpenseRub = visibleFlows.reduce((sum, f) => sum + f.buyoutExpenseRub, 0);
  const cnyRateRub = realPeriod.cnyRateRub ?? 1;
  const realBuyoutIncomeCny = realBuyoutIncomeRub / cnyRateRub;
  const realBuyoutExpenseCny = realBuyoutExpenseRub / cnyRateRub;

  for (const inv of invoices) {
    const bucket = byClientId.get(inv.clientId);
    if (!bucket) continue;
    bucket.invoices.push({
      id: inv.id,
      displayId: inv.displayId,
      type: inv.type,
      currency: inv.currency,
      amountTotal: Number(inv.amountTotal),
      createdAt: inv.createdAt.toISOString(),
      cancelled: inv.cancelled,
    });
  }

  for (const order of expenseOrders) {
    if (!order.quoteId) continue;
    const quote = quoteById.get(order.quoteId);
    if (!quote) continue;
    const bucket = byClientId.get(quote.clientId);
    if (!bucket) continue;
    const amountCny = Number(order.amountCny);
    bucket.orders.push({
      id: order.id,
      date: order.date.toISOString(),
      type: "expense",
      amountCny,
      comment: order.comment,
      quoteDisplayId: quote.displayId,
      productName: quote.productName,
      categoryName: order.category.name,
    });
    bucket.expenseCny += amountCny;
  }

  for (const alloc of incomeAllocations) {
    const quote = quoteById.get(alloc.quoteId);
    if (!quote) continue;
    const bucket = byClientId.get(quote.clientId);
    if (!bucket) continue;
    const rate = Number(alloc.cashOrder.cnyToCurrencyRate) || 1;
    const amountCny = Number(alloc.amountRub) / rate;
    bucket.orders.push({
      id: alloc.id,
      date: alloc.cashOrder.date.toISOString(),
      type: "income",
      amountCny,
      comment: alloc.cashOrder.comment,
      quoteDisplayId: quote.displayId,
      productName: quote.productName,
      categoryName: PAYMENT_CATEGORY_LABEL[alloc.category] ?? alloc.category,
    });
    bucket.incomeCny += amountCny;
  }

  const clients = [...byClientId.values()]
    .map((c) => ({ ...c, orders: c.orders.sort((a, b) => (a.date < b.date ? 1 : -1)), netCny: c.incomeCny - c.expenseCny }))
    // Резерв — состояние "на сейчас", а не движение за выбранный месяц,
    // поэтому клиент с резервом остаётся в списке, даже если в этом
    // месяце по нему не было ни счетов, ни ордеров.
    .filter((c) => c.invoices.length > 0 || c.orders.length > 0 || c.reservedCny > 0)
    .sort((a, b) => b.netCny - a.netCny);

  const reservedCny = clients.reduce((sum, c) => sum + c.reservedCny, 0);

  return Response.json({ clients, reservedCny, reserveRows, realBuyoutIncomeCny, realBuyoutExpenseCny });
}
