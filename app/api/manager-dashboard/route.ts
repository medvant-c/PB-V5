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
// Conversion is shown for information only — it used to also decide the
// premium rate, no longer does. Kept as a constant here only so the ring's
// color threshold has something to reference.
const CONVERSION_PREMIUM_THRESHOLD_PERCENT = 60;

// 2026-07-28 motivation policy (see PB-V5 chat) — replaces the earlier
// 10%/35%-of-services + 0%/10%-of-cargo scheme:
//   - Company lead: 10% each on Просчёт, Выкуп, Скидка поставщика.
//   - Self-sourced (свой клиент): 100% on Просчёт and Скидка, still only
//     10% on Выкуп ("остальное — по общей схеме").
//   - Курсовая разница never goes to the manager, only to Влад/учредители.
//   - Карго: company lead gets a flat $/кг or $/м³ (see TariffSettings.
//     managerCargoRateUsdPerKg/M3), NOT a % — self-sourced keeps the old
//     10%-of-cargo-revenue rule unchanged.
const NORMAL_RATE_PERCENT = 10;
const SELF_SOURCED_BOOSTED_RATE_PERCENT = 100;
const SELF_SOURCED_CARGO_BONUS_RATE_PERCENT = 10;
// Vlad (Партнёр) takes 10% off the top of every source, on every
// confirmed deal, regardless of lead source — computed once, company-wide,
// not per-manager.
const VLAD_SHARE_RATE_PERCENT = 10;

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
  densityKgM3: unknown;
  deliveryPricingMode: string;
  searchServiceFeeRub: unknown;
  buyoutCommissionRub: unknown;
  cnyRateUsed: unknown;
  usdRateUsed: unknown;
  // Real buyout economics — see actualize-cargo/confirm-buyout routes.
  buyoutFactConfirmed: boolean;
  actualBuyoutCny: unknown;
  actualBuyoutRateUsed: unknown;
  actualSupplierDiscountCny: unknown;
  buyoutSelfSourcedBoost: boolean | null;
  cargoBonusRatePercent: unknown;
  client: { selfSourcedConfirmed: boolean; createdByManagerId: string | null };
}

interface SourceProfits {
  proscetRub: number;
  buyoutRub: number;
  discountRub: number;
}

// Просчёт profit is just the search-service fee itself (0 if waived) — no
// cost is tracked against it, the fee IS the profit.
function proscetProfitRub(q: QuoteForStats): number {
  return Number(q.searchServiceFeeRub);
}

// Pre-confirmation estimate: goods cost assumed == quoted price (zero
// margin), cargo fully excluded (revenue AND cost), discount unknowable
// before a real buyout exists. "Выкуп" here is the residual — buyout
// commission plus whatever markup the estimate implies — after Просчёт is
// carved out, same trick quoteBreakdown() in clients-tab.tsx uses.
function estimatedSourceProfits(q: QuoteForStats): SourceProfits {
  const residual = Number(q.totalRub) - Number(q.totalPriceRub) - Number(q.chinaDeliveryRub) - Number(q.cargoDeliveryRub);
  const proscetRub = proscetProfitRub(q);
  return { proscetRub, buyoutRub: residual - proscetRub, discountRub: 0 };
}

// Post-confirmation: real goods cost (actualBuyoutCny × actualBuyoutRateUsed)
// replaces totalPriceRub, so a factory discount or favorable FX already
// folded into a smaller actualBuyoutCny shows up as real profit instead of
// vanishing into "100% pass-through cost." actualSupplierDiscountCny is a
// SEPARATE, additional discount reported alongside actualBuyoutCny (not
// already included in it) — carved OUT of the residual into its own line
// so it can get its own 100%-for-self-sourced rate, without double-counting
// the total (proscet + buyout + discount always reconciles to the same
// total the old single-bucket formula produced).
function factualSourceProfits(q: QuoteForStats): SourceProfits {
  const realBuyoutRub = Number(q.actualBuyoutCny) * Number(q.actualBuyoutRateUsed);
  const residual = Number(q.totalRub) - Number(q.chinaDeliveryRub) - Number(q.cargoDeliveryRub) - realBuyoutRub;
  const proscetRub = proscetProfitRub(q);
  const discountRub = Number(q.actualSupplierDiscountCny ?? 0) * Number(q.actualBuyoutRateUsed);
  return { proscetRub, buyoutRub: residual - proscetRub - discountRub, discountRub };
}

// Курсовая разница — the spread between the rate the client was quoted
// (cnyRateUsed) and the real rate actually used to buy the goods
// (actualBuyoutRateUsed), applied to the real ¥ amount spent. Never goes to
// a manager's premium (see NORMAL_RATE_PERCENT usage below) — only feeds
// Влад's cut and the founders' split.
function fxProfitRub(q: QuoteForStats): number {
  return Number(q.actualBuyoutCny) * (Number(q.cnyRateUsed) - Number(q.actualBuyoutRateUsed));
}

// Cargo margin — cargoDeliveryRub (what the client pays, possibly
// discounted, and the actualized real figure once cargo's been
// actualized) minus cargoCostRub (real or estimated cost, same rule).
// Owner-only visibility, same as it's always been — this is NOT what a
// manager's cargo bonus is based on, just the owner's own accounting.
function cargoProfitRub(q: QuoteForStats): number {
  return Number(q.cargoDeliveryRub) - Number(q.cargoCostRub);
}

// Company-lead cargo bonus: flat $/кг or $/м³ (owner-editable in Тарифы),
// on whichever basis the quote actually prices cargo on — same "density
// mode AND density>=100 -> weight basis, else volume basis" rule as
// actualize-cargo route, so the bonus always matches how cargoDeliveryRub
// itself was computed.
function flatCargoBonusRub(q: QuoteForStats, rates: { usdPerKg: number; usdPerM3: number }): number {
  const basisIsDensity = q.deliveryPricingMode === "density" && Number(q.densityKgM3) >= 100;
  const usdRateUsed = Number(q.usdRateUsed);
  return basisIsDensity ? Number(q.totalWeightKg) * rates.usdPerKg * usdRateUsed : Number(q.totalVolumeM3) * rates.usdPerM3 * usdRateUsed;
}

function isSelfSourcedFor(q: QuoteForStats, managerId: string): boolean {
  return q.client.selfSourcedConfirmed && q.client.createdByManagerId === managerId;
}

function summarize(quotes: QuoteForStats[], cargoRates: { usdPerKg: number; usdPerM3: number }) {
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

  // Потенциал/факт × Просчёт/Выкуп/Скидка/Карго — see PB-V5 chat
  // 2026-07-28. Профит по источникам returned so the UI can show a real
  // breakdown instead of one opaque "services" number; premium sums are
  // derived from these using the per-source rates.
  let potentialProscetRub = 0;
  let potentialBuyoutRub = 0;
  let potentialPremiumRub = 0;
  let factualProscetRub = 0;
  let factualBuyoutRub = 0;
  let factualDiscountRub = 0;
  let factualPremiumRub = 0;
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
      const { proscetRub, buyoutRub, discountRub } = factualSourceProfits(q);
      factualProscetRub += proscetRub;
      factualBuyoutRub += buyoutRub;
      factualDiscountRub += discountRub;
      // Locked at confirmation time (buyoutSelfSourcedBoost), never
      // recomputed live — see schema comment on that field.
      const boostedRate = q.buyoutSelfSourcedBoost ? SELF_SOURCED_BOOSTED_RATE_PERCENT : NORMAL_RATE_PERCENT;
      factualPremiumRub +=
        Math.max(0, proscetRub) * (boostedRate / 100) +
        Math.max(0, buyoutRub) * (NORMAL_RATE_PERCENT / 100) +
        Math.max(0, discountRub) * (boostedRate / 100);
    } else {
      const { proscetRub, buyoutRub } = estimatedSourceProfits(q);
      potentialProscetRub += proscetRub;
      potentialBuyoutRub += buyoutRub;
      const boostedRate = isSelfSourcedFor(q, q.managerId) ? SELF_SOURCED_BOOSTED_RATE_PERCENT : NORMAL_RATE_PERCENT;
      potentialPremiumRub += Math.max(0, proscetRub) * (boostedRate / 100) + Math.max(0, buyoutRub) * (NORMAL_RATE_PERCENT / 100);
    }

    // Карго — gated on cargoBonusRatePercent being locked in, which only
    // happens at the handed_to_client transition (see status/route.ts).
    // The stored value only ever distinguishes self-sourced (10) from
    // company-lead (0) — the RUB amount for company-lead is computed here
    // via the flat rate, not by treating 0 literally as "0 rub bonus".
    if (q.cargoBonusRatePercent !== null && q.cargoBonusRatePercent !== undefined) {
      factualCargoProfitRub += cargoProfitRub(q);
      factualCargoBonusRub +=
        Number(q.cargoBonusRatePercent) > 0
          ? Number(q.cargoDeliveryRub) * (Number(q.cargoBonusRatePercent) / 100)
          : flatCargoBonusRub(q, cargoRates);
    } else {
      potentialCargoProfitRub += cargoProfitRub(q);
      potentialCargoBonusRub += isSelfSourcedFor(q, q.managerId)
        ? Number(q.cargoDeliveryRub) * (SELF_SOURCED_CARGO_BONUS_RATE_PERCENT / 100)
        : flatCargoBonusRub(q, cargoRates);
    }
  }

  // All-time, not just the open pipeline above — this is every quote this
  // manager (or scope) has ever made. Purely informational — no longer
  // wired to the premium rate itself.
  const nonRejected = quotes.filter((q) => q.status !== "rejected").length;
  const convertedCount = quotes.filter((q) => BOUGHT_STATUSES.includes(q.status)).length;
  const conversionPercent = nonRejected > 0 ? Math.round((convertedCount / nonRejected) * 100) : 0;

  const estimatedPremiumRub = potentialPremiumRub + potentialCargoBonusRub;
  const totalFactualPremiumRub = factualPremiumRub + factualCargoBonusRub;

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
    potentialProscetRub,
    potentialBuyoutRub,
    factualProscetRub,
    factualBuyoutRub,
    factualDiscountRub,
    potentialCargoProfitRub,
    factualCargoProfitRub,
    potentialCargoBonusRub,
    factualCargoBonusRub,
    estimatedPremiumRub,
    factualPremiumRub: totalFactualPremiumRub,
    conversionPercent,
  };
}

export async function GET(req: NextRequest) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  const tariffSettings = await prisma.tariffSettings.findFirst({ orderBy: { createdAt: "desc" } });
  const cargoRates = {
    usdPerKg: tariffSettings ? Number(tariffSettings.managerCargoRateUsdPerKg) : 0.3,
    usdPerM3: tariffSettings ? Number(tariffSettings.managerCargoRateUsdPerM3) : 5,
  };

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
      densityKgM3: true,
      deliveryPricingMode: true,
      searchServiceFeeRub: true,
      buyoutCommissionRub: true,
      cnyRateUsed: true,
      usdRateUsed: true,
      buyoutFactConfirmed: true,
      actualBuyoutCny: true,
      actualBuyoutRateUsed: true,
      actualSupplierDiscountCny: true,
      buyoutSelfSourcedBoost: true,
      cargoBonusRatePercent: true,
      client: { select: { selfSourcedConfirmed: true, createdByManagerId: true } },
    },
  });

  const overall = summarize(quotes, cargoRates);

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
      ...summarize(byManager.get(m.id) ?? [], cargoRates),
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
  // Owner-only: the profit-by-source buckets, plus the physical cargo
  // totals and the two always-certain services-revenue lines (both already
  // shown per-quote to any manager, so not confidential on their own —
  // only the company-wide aggregate view is owner-gated).
  let potentialProscetRub: number | null = null;
  let potentialBuyoutRub: number | null = null;
  let factualProscetRub: number | null = null;
  let factualBuyoutRub: number | null = null;
  let factualDiscountRub: number | null = null;
  let potentialCargoProfitRub: number | null = null;
  let factualCargoProfitRub: number | null = null;
  let cargoVolumeM3: number | null = null;
  let cargoWeightKg: number | null = null;
  let searchFeeRub: number | null = null;
  let buyoutCommissionRub: number | null = null;
  // Влад's 10% cut (every confirmed source, every deal) and what's left for
  // the two founders after that plus every manager's premium — see PB-V5
  // chat 2026-07-28. Company-wide, not per-manager; negative per-quote
  // totals are clamped to 0 first, same convention as manager premiums,
  // so one loss-making deal never eats into shares already earned
  // elsewhere.
  let vladShareRub: number | null = null;
  let founderShareRub: number | null = null;
  if (session.role === "owner" && perManager) {
    const totalManagerPotentialPremiumsRub = perManager.reduce((sum, m) => sum + m.estimatedPremiumRub, 0);
    const totalManagerFactualPremiumsRub = perManager.reduce((sum, m) => sum + m.factualPremiumRub, 0);
    expectedIncomeRub =
      overall.potentialProscetRub + overall.potentialBuyoutRub + overall.potentialCargoProfitRub - totalManagerPotentialPremiumsRub;
    actualIncomeRub =
      overall.factualProscetRub +
      overall.factualBuyoutRub +
      overall.factualDiscountRub +
      overall.factualCargoProfitRub -
      totalManagerFactualPremiumsRub;
    potentialProscetRub = overall.potentialProscetRub;
    potentialBuyoutRub = overall.potentialBuyoutRub;
    factualProscetRub = overall.factualProscetRub;
    factualBuyoutRub = overall.factualBuyoutRub;
    factualDiscountRub = overall.factualDiscountRub;
    potentialCargoProfitRub = overall.potentialCargoProfitRub;
    factualCargoProfitRub = overall.factualCargoProfitRub;
    cargoVolumeM3 = overall.pipelineVolumeM3;
    cargoWeightKg = overall.pipelineWeightKg;
    searchFeeRub = overall.pipelineSearchFeeRub;
    buyoutCommissionRub = overall.pipelineBuyoutCommissionRub;

    const totalConfirmedProfitRub = quotes
      .filter((q) => q.buyoutFactConfirmed)
      .reduce((sum, q) => {
        const { proscetRub, buyoutRub, discountRub } = factualSourceProfits(q);
        const perQuoteTotal = proscetRub + buyoutRub + discountRub + fxProfitRub(q) + cargoProfitRub(q);
        return sum + Math.max(0, perQuoteTotal);
      }, 0);
    vladShareRub = totalConfirmedProfitRub * (VLAD_SHARE_RATE_PERCENT / 100);
    founderShareRub = (totalConfirmedProfitRub - vladShareRub - totalManagerFactualPremiumsRub) / 2;
  }

  // Owner-confidential cargo-margin signal — never leaves the server for
  // anyone but the owner, same as it's always been.
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
    potentialProscetRub,
    potentialBuyoutRub,
    factualProscetRub,
    factualBuyoutRub,
    factualDiscountRub,
    potentialCargoProfitRub,
    factualCargoProfitRub,
    cargoVolumeM3,
    cargoWeightKg,
    searchFeeRub,
    buyoutCommissionRub,
    vladShareRub,
    founderShareRub,
    conversionPremiumThresholdPercent: CONVERSION_PREMIUM_THRESHOLD_PERCENT,
  });
}
