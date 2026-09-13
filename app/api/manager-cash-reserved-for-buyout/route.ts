import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { canViewCash } from "@/lib/manager-scope";
import { prisma } from "@/lib/prisma";
import { fetchQuoteRealFinancials, emptyQuoteRealFinancials } from "@/lib/desk-services/quote-real-financials";

// Резерв под выкуп — по каждому ОТКРЫТОМУ просчёту (buyoutFactConfirmed:
// false), в порядке приоритета:
//   1. Есть QuoteGoodsOwedAmount (менеджер явно указал остаток к доплате
//      поставщику, см. app/api/manager-quotes/[id]/expense-order/route.ts)
//      — берём ровно это число, оно уже самое точное, что есть.
//   2. Оплата от клиента есть, а расхода на закупку — вообще ни одного —
//      план по закупке ещё не тронут, берём ПЛАН из просчёта
//      (Quote.totalPriceCny — "сумма закупа", не то, что клиент успел
//      заплатить), а не то, что успели получить.
//   3. И приход, и хотя бы один расход есть, отдельного остатка не
//      указано — сделка закрыта штатно. Разница "оплачено минус
//      потрачено" — это заработанная маржа/прибыль, а не зависшие деньги,
//      в резерв НЕ попадает.
// Раньше (до 2026-09-13) резерв считался как max(0, оплачено − потрачено)
// для любого открытого просчёта — это неверно путало обычную прибыль по
// сделке с реально непотраченными деньгами клиента. См. PB-V5 chat
// 2026-09-13.
export async function GET(req: NextRequest) {
  const session = await getManagerSessionFromRequest(req);
  if (!session || !(await canViewCash(session))) {
    return Response.json({ error: "Нет доступа к кассе." }, { status: 403 });
  }

  const openQuotes = await prisma.quote.findMany({
    // reserveDismissal: null — просчёты, вручную помеченные как "разобрано,
    // не настоящий резерв" (см. QuoteReserveDismissal), из отчёта исключены.
    where: { buyoutFactConfirmed: false, deletedAt: null, reserveDismissal: null },
    select: {
      id: true,
      displayId: true,
      productName: true,
      totalPriceCny: true,
      client: { select: { id: true, name: true, displayId: true } },
      paymentAllocations: {
        where: { category: "goods" },
        select: { amountRub: true, cashOrder: { select: { cnyToCurrencyRate: true } } },
      },
      goodsOwedAmount: { select: { amountCny: true } },
    },
  });

  const financials = await fetchQuoteRealFinancials(openQuotes.map((q) => q.id));

  let reservedCny = 0;
  const rows: {
    quoteId: string;
    quoteDisplayId: number;
    productName: string;
    clientId: string;
    clientName: string;
    clientDisplayId: number;
    paidCny: number;
    expenseCny: number;
    reservedCny: number;
  }[] = [];
  for (const q of openQuotes) {
    const goodsPaidCny = q.paymentAllocations.reduce((sum, a) => {
      const rate = Number(a.cashOrder.cnyToCurrencyRate) || 1;
      return sum + Number(a.amountRub) / rate;
    }, 0);
    if (goodsPaidCny <= 0) continue; // клиент ничего не платил — резервировать нечего

    const goodsExpenseCny = (financials.get(q.id) ?? emptyQuoteRealFinancials()).goodsExpenseCny;

    let reserved: number;
    if (q.goodsOwedAmount && Number(q.goodsOwedAmount.amountCny) > 0) {
      reserved = Number(q.goodsOwedAmount.amountCny);
    } else if (goodsExpenseCny === 0) {
      reserved = Number(q.totalPriceCny);
    } else {
      reserved = 0; // приход и расход есть, отдельного остатка не указано — сделка закрыта
    }

    reservedCny += reserved;
    if (reserved > 0) {
      rows.push({
        quoteId: q.id,
        quoteDisplayId: q.displayId,
        productName: q.productName,
        clientId: q.client.id,
        clientName: q.client.name,
        clientDisplayId: q.client.displayId,
        paidCny: goodsPaidCny,
        expenseCny: goodsExpenseCny,
        reservedCny: reserved,
      });
    }
  }
  rows.sort((a, b) => b.reservedCny - a.reservedCny);

  return Response.json({ reservedCny, rows });
}
