import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { canViewCash } from "@/lib/manager-scope";
import { prisma } from "@/lib/prisma";
import { buildProfitReport } from "@/lib/desk-services/profit-report";

// Feeds the "Расходный ордер" dialog's amount auto-suggestion — for a
// статья explicitly linked to an investor or "менеджер, закреплённый за
// клиентом" (see CashCategory.payoutTarget in prisma/schema.prisma), how
// much that recipient is currently owed for the selected client's
// CONFIRMED deals (buyoutFactConfirmed — the same gate the dashboard's
// "факт" numbers use, real realized profit only) — or, when a specific
// quoteId is also given (the dialog's optional "Просчёт" picker — see
// PB-V5 chat 2026-08-06), scoped to just that ONE deal instead of the
// client's whole history. Reuses buildProfitReport so this can never drift
// from what the profit report itself would show for the same quotes.
// Returns applicable:false for a статья with no payout target (e.g.
// "Закупка товара" — a real cost, not a profit-share payout) so the dialog
// knows not to touch the amount field at all.
//
// buildProfitReport's cargo margin only counts once cargoBonusRatePercent
// has locked in (handed_to_client — see computeQuoteShares in quote-
// profit.ts), so that part of the suggestion is already safe. The SERVICES
// portion (proscet+buyout+discount+fx) is still computed assuming the
// deal's full "services total" (totalRub minus cargoDeliveryRub) eventually
// gets collected — correct for "Отчёт о прибыли" (a forward-looking "how
// much WILL we earn" projection), but wrong to hand straight to a real cash
// payout: a quote can be buyoutFactConfirmed (the real goods purchase is
// known) while the client has only paid PART of that services total so
// far, and suggesting 100% of the expected share before that money has
// actually arrived is what silently pushed the kassa negative (see PB-V5
// chat 2026-08-06). Scaled down here by receivedFraction =
// actualClientPaymentRub / (totalRub - cargoDeliveryRub), blended across
// every quote in scope for the whole-client mode — conservative, not exact
// per-quote cash-flow accounting, but guarantees this suggestion never asks
// for more than what's proportionally already in hand. Skipped entirely
// (falls back to the unscaled amount) the moment ANY quote in scope has
// cargo already realized, since the combined manager/investor totals can't
// be split back into "from services" vs "from cargo" after the fact — safe
// because the common case this exists for (partially paid, cargo not yet
// delivered) never hits that branch.
export async function GET(req: NextRequest) {
  const session = await getManagerSessionFromRequest(req);
  if (!session || !(await canViewCash(session))) {
    return Response.json({ error: "Нет доступа к кассе." }, { status: 403 });
  }

  const categoryId = req.nextUrl.searchParams.get("categoryId");
  const clientId = req.nextUrl.searchParams.get("clientId");
  const quoteId = req.nextUrl.searchParams.get("quoteId");
  if (!categoryId || !clientId) {
    return Response.json({ error: "Укажите статью и клиента." }, { status: 400 });
  }

  const category = await prisma.cashCategory.findUnique({ where: { id: categoryId } });
  if (!category || category.type !== "expense" || !category.payoutTarget) {
    return Response.json({ applicable: false });
  }

  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) {
    return Response.json({ error: "Клиент не найден." }, { status: 404 });
  }

  const tariffSettings = await prisma.tariffSettings.findFirst({ orderBy: { createdAt: "desc" } });
  const cnyRateRub = tariffSettings ? Number(tariffSettings.cnyRateRub) : null;

  type ScopedQuote = {
    id: string;
    totalRub: unknown;
    cargoDeliveryRub: unknown;
    actualClientPaymentRub: unknown;
    cargoBonusRatePercent: unknown;
  };
  const scopedQuoteSelect = {
    id: true,
    totalRub: true,
    cargoDeliveryRub: true,
    actualClientPaymentRub: true,
    cargoBonusRatePercent: true,
  } as const;

  let confirmedQuotes: ScopedQuote[];
  if (quoteId) {
    const quote = await prisma.quote.findUnique({
      where: { id: quoteId },
      select: { ...scopedQuoteSelect, clientId: true, deletedAt: true, buyoutFactConfirmed: true },
    });
    if (!quote || quote.deletedAt || quote.clientId !== clientId) {
      return Response.json({ error: "Просчёт не найден у этого клиента." }, { status: 404 });
    }
    confirmedQuotes = quote.buyoutFactConfirmed ? [quote] : [];
  } else {
    confirmedQuotes = await prisma.quote.findMany({
      where: { clientId, deletedAt: null, buyoutFactConfirmed: true },
      select: scopedQuoteSelect,
    });
  }

  if (confirmedQuotes.length === 0) {
    return Response.json({
      applicable: true,
      amountRub: 0,
      amountCny: null,
      note: quoteId
        ? "У этого просчёта ещё нет подтверждённого факта выкупа."
        : "У клиента пока нет ни одной сделки с подтверждённым фактом выкупа.",
    });
  }

  const { totals } = await buildProfitReport(confirmedQuotes.map((q) => q.id));

  let amountRub = 0;
  if (category.payoutTarget === "assigned_manager") {
    amountRub = totals.managerPremiumRub;
  } else if (category.payoutTarget === "investor" && category.linkedInvestorId) {
    amountRub = totals.investorShares.find((s) => s.id === category.linkedInvestorId)?.shareRub ?? 0;
  }
  amountRub = Math.max(0, amountRub);

  const scopeNote = quoteId ? "по этому просчёту" : `по ${confirmedQuotes.length} подтверждённой сделке (сделкам) клиента`;

  // Skip the receivedFraction scaling entirely if any quote in scope has
  // cargo already realized — see the route-level comment above.
  const anyCargoRealized = confirmedQuotes.some((q) => q.cargoBonusRatePercent !== null);
  let partialNote = "";
  if (!anyCargoRealized) {
    // Blended across every quote in scope: services actually received /
    // services owed (totalRub minus cargoDeliveryRub, since cargo is billed
    // and paid on its own separate timeline), clamped to [0, 1].
    const servicesOwedRub = confirmedQuotes.reduce((sum, q) => sum + Math.max(0, Number(q.totalRub) - Number(q.cargoDeliveryRub)), 0);
    const servicesReceivedRub = confirmedQuotes.reduce((sum, q) => {
      const owed = Math.max(0, Number(q.totalRub) - Number(q.cargoDeliveryRub));
      return sum + Math.min(owed, Number(q.actualClientPaymentRub ?? 0));
    }, 0);
    const receivedFraction = servicesOwedRub > 0 ? Math.min(1, Math.max(0, servicesReceivedRub / servicesOwedRub)) : 0;
    amountRub *= receivedFraction;
    if (receivedFraction < 1) {
      partialNote = ` Клиент пока оплатил ${Math.round(receivedFraction * 100)}% от суммы — выплата уменьшена пропорционально.`;
    }
  }

  return Response.json({
    applicable: true,
    amountRub,
    amountCny: cnyRateRub && cnyRateRub > 0 ? amountRub / cnyRateRub : null,
    note: `Рассчитано ${scopeNote}.${partialNote}`,
  });
}
