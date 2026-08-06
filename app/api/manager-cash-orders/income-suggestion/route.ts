import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { canViewCash } from "@/lib/manager-scope";
import { prisma } from "@/lib/prisma";

// Feeds the "Приходный ордер" dialog's amount auto-suggestion once a
// specific quote is picked (see the dialog's "Просчёт" selector) — how much
// of that ONE quote's totalRub the client still hasn't paid. A suggestion,
// same trust level as expense-suggestion's — the owner can always type a
// different number.
//
// "Already received" for a quote has two possible sources, never both at
// once: once buyoutFactConfirmed, Quote.actualClientPaymentRub IS the full
// running total the client has paid (confirm-buyout's own reconciliation
// already folds in whatever was paid earlier via QuotePaymentAllocation —
// see that route's comment), so adding the allocations sum on top would
// double-count. Before confirmation, only the allocations sum exists yet.
// See PB-V5 chat 2026-08-06.
export async function GET(req: NextRequest) {
  const session = await getManagerSessionFromRequest(req);
  if (!session || !(await canViewCash(session))) {
    return Response.json({ error: "Нет доступа к кассе." }, { status: 403 });
  }

  const clientId = req.nextUrl.searchParams.get("clientId");
  const quoteId = req.nextUrl.searchParams.get("quoteId");
  if (!clientId || !quoteId) {
    return Response.json({ applicable: false });
  }

  const quote = await prisma.quote.findUnique({
    where: { id: quoteId },
    select: {
      id: true,
      clientId: true,
      deletedAt: true,
      totalRub: true,
      buyoutFactConfirmed: true,
      actualClientPaymentRub: true,
    },
  });
  if (!quote || quote.deletedAt || quote.clientId !== clientId) {
    return Response.json({ error: "Просчёт не найден у этого клиента." }, { status: 404 });
  }

  const tariffSettings = await prisma.tariffSettings.findFirst({ orderBy: { createdAt: "desc" } });
  const cnyRateRub = tariffSettings ? Number(tariffSettings.cnyRateRub) : null;

  let alreadyReceivedRub: number;
  if (quote.buyoutFactConfirmed) {
    alreadyReceivedRub = Number(quote.actualClientPaymentRub ?? 0);
  } else {
    const allocations = await prisma.quotePaymentAllocation.findMany({ where: { quoteId }, select: { amountRub: true } });
    alreadyReceivedRub = allocations.reduce((sum, a) => sum + Number(a.amountRub), 0);
  }

  const remainingRub = Math.max(0, Number(quote.totalRub) - alreadyReceivedRub);

  return Response.json({
    applicable: true,
    amountRub: remainingRub,
    amountCny: cnyRateRub && cnyRateRub > 0 ? remainingRub / cnyRateRub : null,
    note:
      alreadyReceivedRub > 0
        ? `Остаток по просчёту — уже получено ${Math.round(alreadyReceivedRub).toLocaleString("ru-RU")} ₽ из ${Math.round(Number(quote.totalRub)).toLocaleString("ru-RU")} ₽.`
        : "Полная сумма просчёта — оплат по нему ещё не было.",
  });
}
