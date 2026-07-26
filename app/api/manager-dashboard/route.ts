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
// in progress gets bought" revenue projection.
const OPEN_STATUSES: QuoteStatus[] = QUOTE_STATUSES.filter(
  (s) => s !== "rejected" && s !== "handed_to_client",
);
// Premium rate depends on the manager's all-time conversion rate (handed
// to client / non-rejected, across every quote they've ever made — not
// just the current pipeline): 10% of profit at 60%+ conversion, 7% below
// it. Mirrored by the ConversionRing threshold in manager-dashboard.tsx —
// keep both in sync if this ever changes.
const CONVERSION_PREMIUM_THRESHOLD_PERCENT = 60;
const HIGH_CONVERSION_PREMIUM_RATE = 0.1;
const LOW_CONVERSION_PREMIUM_RATE = 0.07;

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
  // silently hide that margin from "profit."
  cargoCostRub: unknown;
  totalVolumeM3: unknown;
  totalWeightKg: unknown;
  searchServiceFeeRub: unknown;
  buyoutCommissionRub: unknown;
}

// Company profit on a quote — the client's full payment minus the real
// pass-through costs the company itself pays out (goods purchase, China
// delivery, and the *cost* portion of cargo delivery — not the full charge,
// see cargoCostRub above). What's left is Panda Bridge's own margin: the
// search fee, buyout commission, attached services, AND the cargo margin —
// the only thing a turnover-based premium should ever be a percentage of.
function profitRub(q: QuoteForStats): number {
  return (
    Number(q.totalRub) -
    Number(q.totalPriceRub) -
    Number(q.chinaDeliveryRub) -
    Number(q.cargoCostRub)
  );
}

// Cargo-specific slice of profitRub — cargoDeliveryRub (what the client
// paid for cargo, possibly discounted) minus cargoCostRub (what it really
// cost) — kept separate from the rest (search fee, buyout commission,
// services) so the owner can see the two income sources apart instead of
// one blended "profit" number.
function cargoProfitRub(q: QuoteForStats): number {
  return Number(q.cargoDeliveryRub) - Number(q.cargoCostRub);
}

function summarize(quotes: QuoteForStats[]) {
  const statusCounts: Record<string, number> = {};
  for (const status of QUOTE_STATUSES) statusCounts[status] = 0;
  let boughtRub = 0;
  let handedRub = 0;
  let pipelineRub = 0;
  let pipelineProfitRub = 0;
  let pipelineCargoProfitRub = 0;
  // Gross components of pipelineRub — not owner-confidential (unlike cost/
  // margin figures), so returned to every role. Lets the "В работе" card's
  // hover breakdown show what it's actually made of instead of one opaque
  // sum. "Услуги и комиссии" isn't tracked separately here; it's the
  // residual (pipelineRub minus these three) so it always reconciles
  // exactly, same trick quoteBreakdown() in clients-tab.tsx already uses.
  let pipelineGoodsRub = 0;
  let pipelineChinaDeliveryRub = 0;
  let pipelineCargoRub = 0;
  // Physical totals (not ₽) behind the cargo income figure — "какой объём
  // в расчётах общий и вес" next to "Доход за карго" — and the two revenue
  // lines behind "Ожидаемый доход компании" ("сколько за услуги поиска и
  // сколько комиссия за выкуп"). None of these four are confidential on
  // their own (a manager already sees them per-quote); only the sections
  // that render them company-wide are owner-gated, client-side.
  let pipelineVolumeM3 = 0;
  let pipelineWeightKg = 0;
  let pipelineSearchFeeRub = 0;
  let pipelineBuyoutCommissionRub = 0;
  for (const q of quotes) {
    statusCounts[q.status] = (statusCounts[q.status] ?? 0) + 1;
    // "Выкуплено": everything except cargo delivery, which hasn't happened
    // yet at this stage even for a quote that's already at handed_to_client
    // (that quote also counts fully in handedRub below — the two metrics
    // overlap for handed_to_client by design, they answer different
    // questions: "money secured for the buyout" vs "fully delivered").
    if (BOUGHT_STATUSES.includes(q.status))
      boughtRub += Number(q.totalRub) - Number(q.cargoDeliveryRub);
    if (q.status === "handed_to_client") handedRub += Number(q.totalRub);
    if (OPEN_STATUSES.includes(q.status)) {
      pipelineRub += Number(q.totalRub);
      pipelineProfitRub += profitRub(q);
      pipelineCargoProfitRub += cargoProfitRub(q);
      pipelineGoodsRub += Number(q.totalPriceRub);
      pipelineChinaDeliveryRub += Number(q.chinaDeliveryRub);
      pipelineCargoRub += Number(q.cargoDeliveryRub);
      pipelineVolumeM3 += Number(q.totalVolumeM3);
      pipelineWeightKg += Number(q.totalWeightKg);
      pipelineSearchFeeRub += Number(q.searchServiceFeeRub);
      pipelineBuyoutCommissionRub += Number(q.buyoutCommissionRub);
    }
  }
  // All-time, not just the open pipeline above — this is every quote this
  // manager (or scope) has ever made, which is exactly the "средняя
  // конверсия за всю историю работы" the premium tier is supposed to track.
  // Counts at "выкуплено" (BOUGHT_STATUSES — client paid, we bought the
  // goods), not "выдан клиенту" — the sale itself converts at buyout;
  // everything after that is logistics, not a sales-funnel outcome. A quote
  // sitting in "В доставке на склад" is already a converted sale.
  const nonRejected = quotes.filter((q) => q.status !== "rejected").length;
  const convertedCount = quotes.filter((q) =>
    BOUGHT_STATUSES.includes(q.status),
  ).length;
  const conversionPercent =
    nonRejected > 0 ? Math.round((convertedCount / nonRejected) * 100) : 0;
  const premiumRatePercent =
    conversionPercent >= CONVERSION_PREMIUM_THRESHOLD_PERCENT ? 10 : 7;
  // Floored at 0 — a manager whose pipeline is currently net-negative (heavy
  // discounting, etc.) doesn't owe the company a negative premium.
  const premiumRate =
    premiumRatePercent === 10
      ? HIGH_CONVERSION_PREMIUM_RATE
      : LOW_CONVERSION_PREMIUM_RATE;
  const premiumRub = Math.max(0, pipelineProfitRub) * premiumRate;

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
    pipelineProfitRub,
    pipelineCargoProfitRub,
    premiumRub,
    premiumRatePercent,
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
    where:
      visibleManagerIds === "all"
        ? undefined
        : { managerId: { in: visibleManagerIds } },
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
    },
  });

  const overall = summarize(quotes);

  // Per-manager breakdown — meaningful for owner (sees everyone) and senior
  // (sees their team); a plain manager only ever sees themself here, so
  // it's omitted for them (the overall numbers above already are theirs).
  let perManager:
    | (ReturnType<typeof summarize> & {
        managerId: string;
        managerName: string;
      })[]
    | null = null;
  if (session.role === "owner" || session.role === "senior") {
    // Every manager in scope, including ones with zero quotes so far —
    // that's exactly what a "who isn't pulling their weight" view needs to
    // show, not just whoever happens to have a quote already.
    const managers = await prisma.manager.findMany({
      where:
        visibleManagerIds === "all"
          ? { role: { not: "owner" } }
          : { id: { in: visibleManagerIds } },
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

  // Company-wide expected income, owner-only: what's left of the pipeline's
  // profit (goods purchase, China delivery, and cargo delivery already
  // subtracted inside pipelineProfitRub) after every manager's own premium
  // is paid out too. Summed per-manager (not 10% of the company-wide total)
  // so a manager who's currently net-negative doesn't drag down — via a
  // floored-at-0 premium — what gets deducted for managers who are profitable.
  let expectedIncomeRub: number | null = null;
  // Owner-only breakdown of overall.pipelineProfitRub into its two sources —
  // "сколько доход за карго" (the margin baked into cargo rates) vs
  // everything else (search fee, buyout commission, attached services).
  // Not meaningful/shown to anyone but the owner: the cargo figure directly
  // implies the cargo margin config in Тарифы, which is owner-confidential.
  let cargoProfitRub: number | null = null;
  let otherProfitRub: number | null = null;
  // Alongside cargoProfitRub — "сколько объём в расчётах общий и вес" next
  // to the "Доход за карго" figure.
  let cargoVolumeM3: number | null = null;
  let cargoWeightKg: number | null = null;
  // Alongside expectedIncomeRub — "сколько за услуги поиска и сколько
  // комиссия за выкуп" next to "Ожидаемый доход компании".
  let searchFeeRub: number | null = null;
  let buyoutCommissionRub: number | null = null;
  if (session.role === "owner" && perManager) {
    const totalManagerPremiumsRub = perManager.reduce(
      (sum, m) => sum + m.premiumRub,
      0,
    );
    expectedIncomeRub = overall.pipelineProfitRub - totalManagerPremiumsRub;
    cargoProfitRub = overall.pipelineCargoProfitRub;
    otherProfitRub = overall.pipelineProfitRub - overall.pipelineCargoProfitRub;
    cargoVolumeM3 = overall.pipelineVolumeM3;
    cargoWeightKg = overall.pipelineWeightKg;
    searchFeeRub = overall.pipelineSearchFeeRub;
    buyoutCommissionRub = overall.pipelineBuyoutCommissionRub;
  }

  // pipelineCargoProfitRub itself never leaves the server for anyone but
  // the owner either — even as a raw field on `overall`/`perManager`, it's
  // the same owner-confidential cargo-margin signal as cargoProfitRub above,
  // just not yet subtracted out.
  const stripCargoProfit = <T extends { pipelineCargoProfitRub: number }>(
    row: T,
  ): Omit<T, "pipelineCargoProfitRub"> => {
    const copy = { ...row };
    delete (copy as Partial<T>).pipelineCargoProfitRub;
    return copy;
  };
  const responseOverall =
    session.role === "owner" ? overall : stripCargoProfit(overall);
  const responsePerManager =
    perManager && session.role !== "owner"
      ? perManager.map(stripCargoProfit)
      : perManager;

  return Response.json({
    overall: responseOverall,
    perManager: responsePerManager,
    expectedIncomeRub,
    cargoProfitRub,
    otherProfitRub,
    cargoVolumeM3,
    cargoWeightKg,
    searchFeeRub,
    buyoutCommissionRub,
  });
}
