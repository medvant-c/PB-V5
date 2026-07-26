import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { getVisibleManagerIds } from "@/lib/manager-scope";
import { prisma } from "@/lib/prisma";
import { QUOTE_STATUSES, type QuoteStatus } from "@/lib/quote-statuses";

// Statuses that imply the buyout has actually happened — client's money
// has already covered the goods, China delivery, buyout commission, and
// search-service fee, and the manager has bought the goods (moved the
// quote past "ждём оплату"). Cargo delivery to the client hasn't happened
// yet at this stage, so "выкуплено" below deliberately excludes it —
// that's what the separate "выдано клиенту" metric is for.
const BOUGHT_STATUSES: QuoteStatus[] = [
  "in_transit_to_warehouse",
  "delivered_to_warehouse",
  "sent_to_client",
  "handed_to_client",
];
// Still-open pipeline — everything except a dead end (rejected) or an
// already-completed deal (handed_to_client) — used for the "if everything
// in progress gets bought" revenue projection ("В работе").
const OPEN_STATUSES: QuoteStatus[] = QUOTE_STATUSES.filter((s) => s !== "rejected" && s !== "handed_to_client");
// Conversion is shown for information only now (see manager-dashboard.tsx)
// — it used to also decide the premium rate (7%/10%); the partner changed
// terms (2026-07) to a flat 10%, or 35% for a confirmed self-sourced
// client. Kept as a constant here only so the ring's color threshold has
// something to reference.
const CONVERSION_PREMIUM_THRESHOLD_PERCENT = 60;
const NORMAL_PREMIUM_RATE_PERCENT = 10;
const SELF_SOURCED_PREMIUM_RATE_PERCENT = 35;
const SELF_SOURCED_CARGO_BONUS_RATE_PERCENT = 10;

interface QuoteForStats {
  managerId: string;
  status: QuoteStatus;
  totalRub: unknown;
  totalPriceRub: unknown;
  chinaDeliveryRub: unknown;
  cargoDeliveryRub: unknown;
  // The real cargo cost snapshotted on the quote (Quote.cargoCostRub) —
  // NOT the same as cargoDeliveryRub, which is what the client pays and
  // already has the owner's cargo margin baked in. Using cargoDeliveryRub
  // here would count 100% of cargo revenue as a pass-through cost and
  // silently hide that margin from "profit." Reflects the actualized real
  // figure once cargo has been actualized, the original estimate before
  // that — same field, just overwritten in place by actualize-cargo.
  cargoCostRub: unknown;
  totalVolumeM3: unknown;
  totalWeightKg: unknown;
  searchServiceFeeRub: unknown;
  buyoutCommissionRub: unknown;
  // Real buyout economics — see actualize-cargo/confirm-buyout routes.
  buyoutFactConfirmed: boolean;
  actualBuyoutCny: unknown;
  actualBuyoutRateUsed: unknown;
  buyoutPremiumRatePercent: unknown;
  cargoBonusRatePercent: unknown;
  client: { selfSourcedConfirmed: boolean; createdByManagerId: string | null };
}

// Services-only profit assuming zero goods margin (goods cost == quoted
// price) — cargo fully excluded (revenue AND margin), unlike the old
// profitRub which folded cargo margin in. This is what the ESTIMATE
// treats as "услуги" profit before any buyout fact is confirmed: search
// fee + buyout commission + attached services, algebraically the residual
// once totalPriceRub/chinaDeliveryRub/cargoDeliveryRub are subtracted from
// totalRub (same trick quoteBreakdown() in clients-tab.tsx uses).
function computeEstimatedServicesProfitRub(q: QuoteForStats): number {
  return Number(q.totalRub) - Number(q.totalPriceRub) - Number(q.chinaDeliveryRub) - Number(q.cargoDeliveryRub);
}

// Once buyoutFactConfirmed, the real goods cost (actualBuyoutCny ×
// actualBuyoutRateUsed) replaces totalPriceRub in the same formula above —
// a factory discount or favorable FX at the real purchase moment becomes
// real, countable profit instead of vanishing into "100% pass-through
// cost" the way the estimate always assumed.
function computeFactualServicesProfitRub(q: QuoteForStats): number {
  const realBuyoutRub = Number(q.actualBuyoutCny) * Number(q.actualBuyoutRateUsed);
  return Number(q.totalRub) - Number(q.chinaDeliveryRub) - Number(q.cargoDeliveryRub) - realBuyoutRub;
}

// Cargo margin — cargoDeliveryRub (what the client pays, possibly
// discounted, and the actualized real figure once cargo's been
// actualized) minus cargoCostRub (real or estimated cost, same rule).
// Owner-only visibility, same as it's always been — this is NOT what a
// manager's cargo bonus is based on (that's a flat % of revenue, see
// cargoBonusRub below), just the owner's own accounting.
function computeCargoProfitRub(q: QuoteForStats): number {
  return Number(q.cargoDeliveryRub) - Number(q.cargoCostRub);
}

function isSelfSourcedFor(q: QuoteForStats, managerId: string): boolean {
  return q.client.selfSourcedConfirmed && q.client.createdByManagerId === managerId;
}

function summarize(quotes: QuoteForStats[]) {
  const statusCounts: Record<string, number> = {};
  for (const status of QUOTE_STATUSES) statusCounts[status] = 0;
  let boughtRub = 0;
  let handedRub = 0;
  let pipelineRub = 0;
  // Gross components of pipelineRub — not owner-confidential (unlike cost/
  // margin figures), so returned to every role. Lets the "В работе" card's
  // hover breakdown show what it's actually made of instead of one opaque
  // sum. "Услуги и комиссии" isn't tracked separately here; it's the
  // residual (pipelineRub minus these three) so it always reconciles
  // exactly, same trick quoteBreakdown() in clients-tab.tsx already uses.
  let pipelineGoodsRub = 0;
  let pipelineChinaDeliveryRub = 0;
  let pipelineCargoRub = 0;
  let pipelineVolumeM3 = 0;
  let pipelineWeightKg = 0;
  let pipelineSearchFeeRub = 0;
  let pipelineBuyoutCommissionRub = 0;

  // The four buckets — see PB-V5 chat 2026-07-27: manager premium now
  // comes ONLY from services (10%, or 35% self-sourced), never from cargo
  // margin. Cargo's own potential/factual split still matters for the
  // OWNER's accurate profit tracking (cargoProfitRub below), separate from
  // the flat cargo-revenue bonus a self-sourced manager earns.
  let potentialServicesProfitRub = 0;
  let potentialServicesPremiumRub = 0;
  let factualServicesProfitRub = 0;
  let factualServicesPremiumRub = 0;
  let potentialCargoProfitRub = 0;
  let factualCargoProfitRub = 0;
  let potentialCargoBonusRub = 0;
  let factualCargoBonusRub = 0;

  for (const q of quotes) {
    statusCounts[q.status] = (statusCounts[q.status] ?? 0) + 1;
    // "Выкуплено": everything except cargo delivery, which hasn't happened
    // yet at this stage even for a quote that's already at handed_to_client
    // (that quote also counts fully in handedRub below — the two metrics
    // overlap for handed_to_client by design, they answer different
    // questions: "money secured for the buyout" vs "fully delivered").
    if (BOUGHT_STATUSES.includes(q.status)) boughtRub += Number(q.totalRub) - Number(q.cargoDeliveryRub);
    if (q.status === "handed_to_client") handedRub += Number(q.totalRub);
    if (OPEN_STATUSES.includes(q.status)) {
      pipelineRub += Number(q.totalRub);
      pipelineGoodsRub += Number(q.totalPriceRub);
      pipelineChinaDeliveryRub += Number(q.chinaDeliveryRub);
      pipelineCargoRub += Number(q.cargoDeliveryRub);
      pipelineVolumeM3 += Number(q.totalVolumeM3);
      pipelineWeightKg += Number(q.totalWeightKg);
      pipelineSearchFeeRub += Number(q.searchServiceFeeRub);
      pipelineBuyoutCommissionRub += Number(q.buyoutCommissionRub);
    }

    if (q.status === "rejected") continue; // dead deal — counts toward neither bucket, either side

    // Услуги — gated on buyoutFactConfirmed (a flag, independent of
    // Quote.status; see status/route.ts), not on any particular status.
    if (q.buyoutFactConfirmed) {
      const profit = computeFactualServicesProfitRub(q);
      const rate = Number(q.buyoutPremiumRatePercent ?? NORMAL_PREMIUM_RATE_PERCENT) / 100;
      factualServicesProfitRub += profit;
      factualServicesPremiumRub += Math.max(0, profit) * rate;
    } else {
      const profit = computeEstimatedServicesProfitRub(q);
      const rate = (isSelfSourcedFor(q, q.managerId) ? SELF_SOURCED_PREMIUM_RATE_PERCENT : NORMAL_PREMIUM_RATE_PERCENT) / 100;
      potentialServicesProfitRub += profit;
      potentialServicesPremiumRub += Math.max(0, profit) * rate;
    }

    // Карго — gated on cargoBonusRatePercent being locked in, which only
    // happens at the handed_to_client transition (see status/route.ts).
    if (q.cargoBonusRatePercent !== null && q.cargoBonusRatePercent !== undefined) {
      factualCargoProfitRub += computeCargoProfitRub(q);
      factualCargoBonusRub += Number(q.cargoDeliveryRub) * (Number(q.cargoBonusRatePercent) / 100);
    } else {
      potentialCargoProfitRub += computeCargoProfitRub(q);
      const bonusRate = isSelfSourcedFor(q, q.managerId) ? SELF_SOURCED_CARGO_BONUS_RATE_PERCENT : 0;
      potentialCargoBonusRub += Number(q.cargoDeliveryRub) * (bonusRate / 100);
    }
  }

  // All-time, not just the open pipeline above — this is every quote this
  // manager (or scope) has ever made. Purely informational now (see
  // NORMAL_PREMIUM_RATE_PERCENT above) — kept because it's still a
  // meaningful "how good is this manager's close rate" number, just no
  // longer wired to the premium rate itself.
  const nonRejected = quotes.filter((q) => q.status !== "rejected").length;
  const convertedCount = quotes.filter((q) => BOUGHT_STATUSES.includes(q.status)).length;
  const conversionPercent = nonRejected > 0 ? Math.round((convertedCount / nonRejected) * 100) : 0;

  const estimatedPremiumRub = potentialServicesPremiumRub + potentialCargoBonusRub;
  const factualPremiumRub = factualServicesPremiumRub + factualCargoBonusRub;

  return {
    statusCounts,
    totalQuotes: quotes.length,
    boughtRub,
    handedRub,
    pipelineRub,
    pipelineGoodsRub,
    pipelineChinaDeliveryRub,
    pipelineCargoRub,
    pipelineVolumeM3,
    pipelineWeightKg,
    pipelineSearchFeeRub,
    pipelineBuyoutCommissionRub,
    potentialServicesProfitRub,
    factualServicesProfitRub,
    potentialCargoProfitRub,
    factualCargoProfitRub,
    potentialCargoBonusRub,
    factualCargoBonusRub,
    estimatedPremiumRub,
    factualPremiumRub,
    conversionPercent,
  };
}

export async function GET(req: NextRequest) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  const visibleManagerIds = await getVisibleManagerIds(session);
  const quotes = await prisma.quote.findMany({
    where: visibleManagerIds === "all" ? undefined : { managerId: { in: visibleManagerIds } },
    select: {
      managerId: true,
      status: true,
      totalRub: true,
      totalPriceRub: true,
      chinaDeliveryRub: true,
      cargoDeliveryRub: true,
      cargoCostRub: true,
      totalVolumeM3: true,
      totalWeightKg: true,
      searchServiceFeeRub: true,
      buyoutCommissionRub: true,
      buyoutFactConfirmed: true,
      actualBuyoutCny: true,
      actualBuyoutRateUsed: true,
      buyoutPremiumRatePercent: true,
      cargoBonusRatePercent: true,
      client: { select: { selfSourcedConfirmed: true, createdByManagerId: true } },
    },
  });

  const overall = summarize(quotes);

  // Per-manager breakdown — meaningful for owner (sees everyone) and senior
  // (sees their team); a plain manager only ever sees themself here, so
  // it's omitted for them (the overall numbers above already are theirs).
  let perManager: (ReturnType<typeof summarize> & { managerId: string; managerName: string })[] | null = null;
  if (session.role === "owner" || session.role === "senior") {
    // Every manager in scope, including ones with zero quotes so far —
    // that's exactly what a "who isn't pulling their weight" view needs to
    // show, not just whoever happens to have a quote already.
    const managers = await prisma.manager.findMany({
      where: visibleManagerIds === "all" ? { role: { not: "owner" } } : { id: { in: visibleManagerIds } },
      select: { id: true, name: true },
    });
    const byManager = new Map<string, QuoteForStats[]>();
    for (const q of quotes) {
      const list = byManager.get(q.managerId) ?? [];
      list.push(q);
      byManager.set(q.managerId, list);
    }
    perManager = managers.map((m) => ({
      managerId: m.id,
      managerName: m.name,
      ...summarize(byManager.get(m.id) ?? []),
    }));
  }

  // Company-wide income, owner-only. Potential = if every open quote gets
  // bought/actualized/handed over as currently estimated, minus every
  // manager's own potential premium (summed per-manager, not "10% of the
  // company-wide total", so a manager who's currently net-negative doesn't
  // drag down what gets deducted for managers who are profitable).
  // Factual = the same, but only counting what's actually been confirmed —
  // no longer a projection.
  let expectedIncomeRub: number | null = null;
  let actualIncomeRub: number | null = null;
  // Owner-only: the four profit buckets themselves, plus the physical
  // cargo totals and the two always-certain services-revenue lines (both
  // already shown per-quote to any manager, so not confidential on their
  // own — only the company-wide aggregate view is owner-gated).
  let potentialServicesProfitRub: number | null = null;
  let factualServicesProfitRub: number | null = null;
  let potentialCargoProfitRub: number | null = null;
  let factualCargoProfitRub: number | null = null;
  let cargoVolumeM3: number | null = null;
  let cargoWeightKg: number | null = null;
  let searchFeeRub: number | null = null;
  let buyoutCommissionRub: number | null = null;
  if (session.role === "owner" && perManager) {
    const totalManagerPotentialPremiumsRub = perManager.reduce((sum, m) => sum + m.estimatedPremiumRub, 0);
    const totalManagerFactualPremiumsRub = perManager.reduce((sum, m) => sum + m.factualPremiumRub, 0);
    expectedIncomeRub =
      overall.potentialServicesProfitRub + overall.potentialCargoProfitRub - totalManagerPotentialPremiumsRub;
    actualIncomeRub = overall.factualServicesProfitRub + overall.factualCargoProfitRub - totalManagerFactualPremiumsRub;
    potentialServicesProfitRub = overall.potentialServicesProfitRub;
    factualServicesProfitRub = overall.factualServicesProfitRub;
    potentialCargoProfitRub = overall.potentialCargoProfitRub;
    factualCargoProfitRub = overall.factualCargoProfitRub;
    cargoVolumeM3 = overall.pipelineVolumeM3;
    cargoWeightKg = overall.pipelineWeightKg;
    searchFeeRub = overall.pipelineSearchFeeRub;
    buyoutCommissionRub = overall.pipelineBuyoutCommissionRub;
  }

  // potentialCargoProfitRub/factualCargoProfitRub never leave the server
  // for anyone but the owner — even as raw fields on `overall`/
  // `perManager`, they're the same owner-confidential cargo-margin signal
  // (implies the cargo margin config in Тарифы) as the top-level fields
  // above, just not yet subtracted out.
  const stripCargoProfit = <T extends { potentialCargoProfitRub: number; factualCargoProfitRub: number }>(
    row: T,
  ): Omit<T, "potentialCargoProfitRub" | "factualCargoProfitRub"> => {
    const copy = { ...row };
    delete (copy as Partial<T>).potentialCargoProfitRub;
    delete (copy as Partial<T>).factualCargoProfitRub;
    return copy;
  };
  const responseOverall = session.role === "owner" ? overall : stripCargoProfit(overall);
  const responsePerManager = perManager && session.role !== "owner" ? perManager.map(stripCargoProfit) : perManager;

  return Response.json({
    overall: responseOverall,
    perManager: responsePerManager,
    expectedIncomeRub,
    actualIncomeRub,
    potentialServicesProfitRub,
    factualServicesProfitRub,
    potentialCargoProfitRub,
    factualCargoProfitRub,
    cargoVolumeM3,
    cargoWeightKg,
    searchFeeRub,
    buyoutCommissionRub,
    conversionPremiumThresholdPercent: CONVERSION_PREMIUM_THRESHOLD_PERCENT,
  });
}
