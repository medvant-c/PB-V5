import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { canViewCash } from "@/lib/manager-scope";
import { prisma } from "@/lib/prisma";
import { fetchQuoteRealFinancials, emptyQuoteRealFinancials } from "@/lib/desk-services/quote-real-financials";

// Резерв под выкуп — деньги клиентов, уже полученные за товар по ОТКРЫТЫМ
// просчётам, но ещё реально не потраченные на закупку (max(0, оплачено −
// потрачено) по каждому такому просчёту, суммарно). НЕ то же самое, что
// QuoteGoodsOwedAmount (сколько должны поставщику) — это read-only
// компания-wide аннотация к остатку Кассы, не привязана к одному счёту и
// ничего не пишет в БД. См. план mellow-forging-kay.md, PB-V5 chat
// 2026-09-12.
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
      client: { select: { id: true, name: true, displayId: true } },
      paymentAllocations: {
        where: { category: "goods" },
        select: { amountRub: true, cashOrder: { select: { cnyToCurrencyRate: true } } },
      },
    },
  });

  const financials = await fetchQuoteRealFinancials(openQuotes.map((q) => q.id));

  let reservedCny = 0;
  // Построчная разбивка — только просчёты, где реально есть что показать
  // (резерв > 0), отсортировано по убыванию: то же самое max(0, оплачено −
  // потрачено), что уже суммируется в reservedCny выше, но без схлопывания
  // по клиентам, чтобы менеджер видел, по какому именно просчёту деньги ещё
  // не потрачены. См. PB-V5 chat 2026-09-13.
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
    const goodsExpenseCny = (financials.get(q.id) ?? emptyQuoteRealFinancials()).goodsExpenseCny;
    const reserved = Math.max(0, goodsPaidCny - goodsExpenseCny);
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
