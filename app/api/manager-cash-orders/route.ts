import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { canViewCash } from "@/lib/manager-scope";
import { prisma } from "@/lib/prisma";
import { syncQuotePaymentAllocationForCashOrder } from "@/lib/desk-services/cash-order-profit-sync";
import { computeAccountBalanceCny, computeAllAccountBalances } from "@/lib/desk-services/cash-balance";

// "YYYY-MM" -> [monthStart, monthEndExclusive]. Defaults to the current
// month when omitted/invalid.
function parseMonthRange(monthParam: string | null): [Date, Date] {
  const match = monthParam?.match(/^(\d{4})-(\d{2})$/);
  const now = new Date();
  const year = match ? Number(match[1]) : now.getFullYear();
  const monthIndex = match ? Number(match[2]) - 1 : now.getMonth();
  return [new Date(year, monthIndex, 1), new Date(year, monthIndex + 1, 1)];
}

interface OrderForSum {
  type: string;
  amountCny: unknown;
}

function sumByType(orders: OrderForSum[], type: "income" | "expense"): number {
  return orders.filter((o) => o.type === type).reduce((sum, o) => sum + Number(o.amountCny), 0);
}

// GET returns three things: `orders` (the table view, filtered by
// categoryId/type query params), `summary` (opening/income/expense/closing
// balance for the WHOLE month, independent of those filters — a filtered
// view must never make the balance look wrong), and `categoryBreakdown`
// (also whole-month, for the Excel "Свод" sheet and the summary cards).
export async function GET(req: NextRequest) {
  const session = await getManagerSessionFromRequest(req);
  if (!session || !(await canViewCash(session))) {
    return Response.json({ error: "Нет доступа к кассе." }, { status: 403 });
  }

  const [monthStart, monthEnd] = parseMonthRange(req.nextUrl.searchParams.get("month"));
  const categoryIdFilter = req.nextUrl.searchParams.get("categoryId");
  const typeFilter = req.nextUrl.searchParams.get("type");
  const clientIdFilter = req.nextUrl.searchParams.get("clientId");
  // Необязательный — сужает и таблицу, и summary/categoryBreakdown до ОДНОГО
  // счёта (см. CashAccount в prisma/schema.prisma); отдельная сводка по
  // балансам каждого счёта прямо сейчас живёт в /api/manager-cash-accounts,
  // не здесь.
  const accountIdFilter = req.nextUrl.searchParams.get("accountId");
  const accountScope = accountIdFilter ? { accountId: accountIdFilter } : {};

  // "Остаток на начало месяца" — якорь (у каждого счёта свой, см.
  // CashOpeningBalance.accountId) + история ДО monthStart. При одном
  // выбранном счёте — его собственный расчёт; для "всех счетов" — сумма
  // такого же расчёта по каждому счёту (у них могут быть разные даты
  // якоря, поэтому нельзя просто взять один общий якорь, как раньше, когда
  // счетов ещё не было). Переводы между счетами тоже учтены (см.
  // computeAccountBalanceCny) — на сумму по всем счетам перевод не влияет,
  // а на баланс отдельного счёта — вполне может.
  const openingBalanceCny = accountIdFilter
    ? await computeAccountBalanceCny(accountIdFilter, monthStart)
    : (await computeAllAccountBalances(monthStart)).totalBalanceCny;

  const monthOrders = await prisma.cashOrder.findMany({
    where: { date: { gte: monthStart, lt: monthEnd }, ...accountScope },
    include: {
      account: { select: { id: true, name: true } },
      category: true,
      client: { select: { id: true, name: true } },
      quote: { select: { id: true, displayId: true, productName: true } },
      createdByManager: { select: { name: true } },
    },
    orderBy: { date: "desc" },
  });

  const incomeCny = sumByType(monthOrders, "income");
  const expenseCny = sumByType(monthOrders, "expense");
  const closingBalanceCny = openingBalanceCny + incomeCny - expenseCny;

  const breakdownMap = new Map<string, { categoryId: string; name: string; type: string; totalCny: number }>();
  for (const order of monthOrders) {
    const key = order.categoryId;
    const entry = breakdownMap.get(key) ?? { categoryId: key, name: order.category.name, type: order.type, totalCny: 0 };
    entry.totalCny += Number(order.amountCny);
    breakdownMap.set(key, entry);
  }
  const categoryBreakdown = [...breakdownMap.values()].sort((a, b) => b.totalCny - a.totalCny);

  const orders = monthOrders.filter(
    (o) =>
      (!categoryIdFilter || o.categoryId === categoryIdFilter) &&
      (!typeFilter || o.type === typeFilter) &&
      (!clientIdFilter || o.clientId === clientIdFilter),
  );

  return Response.json({
    orders,
    summary: { openingBalanceCny, incomeCny, expenseCny, closingBalanceCny },
    categoryBreakdown,
  });
}

export async function POST(req: NextRequest) {
  const session = await getManagerSessionFromRequest(req);
  if (!session || !(await canViewCash(session))) {
    return Response.json({ error: "Нет доступа к кассе." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Некорректный запрос." }, { status: 400 });
  }
  const { type, date, accountId, categoryId, clientId, quoteId, currency, amount, cnyToCurrencyRate, comment } =
    (body as {
      type?: unknown;
      date?: unknown;
      accountId?: unknown;
      categoryId?: unknown;
      clientId?: unknown;
      quoteId?: unknown;
      currency?: unknown;
      amount?: unknown;
      cnyToCurrencyRate?: unknown;
      comment?: unknown;
    }) ?? {};

  if (type !== "income" && type !== "expense") {
    return Response.json({ error: "Некорректный тип ордера." }, { status: 400 });
  }
  const parsedDate = typeof date === "string" ? new Date(date) : null;
  if (!parsedDate || Number.isNaN(parsedDate.getTime())) {
    return Response.json({ error: "Укажите дату." }, { status: 400 });
  }
  if (typeof accountId !== "string" || !accountId) {
    return Response.json({ error: "Укажите счёт." }, { status: 400 });
  }
  const account = await prisma.cashAccount.findUnique({ where: { id: accountId } });
  if (!account) {
    return Response.json({ error: "Счёт не найден." }, { status: 400 });
  }
  if (typeof categoryId !== "string" || !categoryId) {
    return Response.json({ error: "Укажите статью." }, { status: 400 });
  }
  const category = await prisma.cashCategory.findUnique({ where: { id: categoryId } });
  if (!category || category.type !== type) {
    return Response.json({ error: "Статья не соответствует типу ордера." }, { status: 400 });
  }
  if (currency !== "cny" && currency !== "usd" && currency !== "rub") {
    return Response.json({ error: "Некорректная валюта." }, { status: 400 });
  }
  const amountNum = Number(amount);
  if (!Number.isFinite(amountNum) || amountNum <= 0) {
    return Response.json({ error: "Укажите сумму." }, { status: 400 });
  }
  const rateNum = currency === "cny" ? 1 : Number(cnyToCurrencyRate);
  if (!Number.isFinite(rateNum) || rateNum <= 0) {
    return Response.json({ error: "Укажите курс." }, { status: 400 });
  }

  // clientId is optional either way — most expense orders (Саша / Влад /
  // менеджер / общие закупки) still have no client, but a "выкуп за товар"
  // expense order needs one to actually be attributable, so it's allowed on
  // both types rather than income-only.
  let resolvedClientId: string | null = null;
  if (typeof clientId === "string" && clientId) {
    const client = await prisma.client.findUnique({ where: { id: clientId } });
    if (!client) return Response.json({ error: "Клиент не найден." }, { status: 400 });
    resolvedClientId = clientId;
  }

  // Optional — a specific deal this ledger entry is for. Must belong to the
  // selected client (a quote without a client attached makes no sense, same
  // reasoning as the buyout invoice/create-payment routes never accepting a
  // quote/client mismatch).
  let resolvedQuoteId: string | null = null;
  if (typeof quoteId === "string" && quoteId) {
    const quote = await prisma.quote.findUnique({ where: { id: quoteId }, select: { id: true, deletedAt: true, clientId: true } });
    if (!quote || quote.deletedAt) return Response.json({ error: "Просчёт не найден." }, { status: 400 });
    if (!resolvedClientId || quote.clientId !== resolvedClientId) {
      return Response.json({ error: "Просчёт должен принадлежать выбранному клиенту." }, { status: 400 });
    }
    resolvedQuoteId = quoteId;
  }

  // Приход, привязанный к конкретному Просчёту, по статье с
  // CashCategory.linkedProfitCategory — засчитывается в прибыль сразу же
  // (та же сила, что у «Счёта на выкуп»), но только руководителю/старшему
  // менеджеру (то же доверие, что и create-payment/route.ts — реальные
  // деньги + мгновенное начисление премии) и только в ₽ (см. комментарий
  // в cash-order-profit-sync.ts, почему не конвертируем из ¥/$).
  const shouldCreditProfit =
    type === "income" &&
    resolvedQuoteId !== null &&
    category.linkedProfitCategory !== null &&
    currency === "rub" &&
    (session.role === "owner" || session.role === "senior");

  let orderId: string;
  try {
    orderId = await prisma.$transaction(async (tx) => {
      const created = await tx.cashOrder.create({
        data: {
          type,
          date: parsedDate,
          accountId,
          categoryId,
          clientId: resolvedClientId,
          quoteId: resolvedQuoteId,
          currency,
          amount: amountNum,
          cnyToCurrencyRate: rateNum,
          // rateNum = how many units of `currency` equal 1 ¥, so converting
          // FROM currency TO ¥ divides — see the schema comment on
          // CashOrder.cnyToCurrencyRate for why this direction was chosen.
          amountCny: amountNum / rateNum,
          comment: typeof comment === "string" ? comment.trim() : "",
          createdByManagerId: session.managerId,
        },
      });
      if (shouldCreditProfit) {
        const result = await syncQuotePaymentAllocationForCashOrder(tx, {
          cashOrderId: created.id,
          quoteId: resolvedQuoteId!,
          linkedProfitCategory: category.linkedProfitCategory!,
          amountRub: amountNum,
          createdByManagerId: session.managerId,
        });
        if (!result.ok) throw new Error(result.error);
      }
      return created.id;
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось сохранить ордер.";
    return Response.json({ error: message }, { status: 400 });
  }

  const order = await prisma.cashOrder.findUnique({
    where: { id: orderId },
    include: {
      account: { select: { id: true, name: true } },
      category: true,
      client: { select: { id: true, name: true } },
      quote: { select: { id: true, displayId: true, productName: true } },
      createdByManager: { select: { name: true } },
    },
  });

  return Response.json({ order }, { status: 201 });
}
