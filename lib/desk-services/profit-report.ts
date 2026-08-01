import "server-only";
import { prisma } from "@/lib/prisma";
import { getSystemSettings } from "@/lib/system-settings";
import {
  cargoProfitRub,
  effectiveInvestorRatePercent,
  estimatedFxProfitRub,
  estimatedSourceProfits,
  factualSourceProfits,
  flatCargoBonusRub,
  fxProfitRub,
  investorCargoShareRub,
  isSelfSourcedFor,
  splitRemainderRub,
  type CnyProfitTiers,
  type InvestorConfig,
  type QuoteProfitFields,
} from "@/lib/desk-services/quote-profit";

// Shared by both app/api/manager-profit-report/route.ts (on-screen JSON) and
// app/api/manager-profit-report/pdf/route.ts (downloaded PDF) — kept out of
// either route.ts file since Next's App Router only allows recognized
// exports (GET/POST/etc.) from a route file, not arbitrary helpers.

// The full QuoteProfitFields shape plus everything flatCargoBonusRub and the
// manager-premium math need — same field set app/api/manager-dashboard/
// route.ts already fetches for its QuoteForStats.
const PROFIT_SELECT = {
  id: true,
  displayId: true,
  productName: true,
  status: true,
  createdAt: true,
  managerId: true,
  totalRub: true,
  totalPriceRub: true,
  // ¥-denominated — needed only for estimateCnyVolume (see
  // lib/desk-services/quote-profit.ts), distinct from the ₽ figures above.
  totalPriceCny: true,
  chinaDeliveryCny: true,
  chinaDeliveryRub: true,
  cargoDeliveryRub: true,
  cargoCostRub: true,
  searchServiceFeeRub: true,
  customProductionFeeRub: true,
  buyoutCommissionRub: true,
  cnyRateUsed: true,
  usdRateUsed: true,
  buyoutFactConfirmed: true,
  actualBuyoutCny: true,
  actualBuyoutRateUsed: true,
  actualSupplierDiscountCny: true,
  buyoutSelfSourcedBoost: true,
  cargoBonusRatePercent: true,
  totalWeightKg: true,
  totalVolumeM3: true,
  densityKgM3: true,
  deliveryPricingMode: true,
  manager: { select: { id: true, name: true } },
  client: {
    select: {
      id: true,
      name: true,
      company: true,
      selfSourcedConfirmed: true,
      createdByManagerId: true,
      vladShareRatePercentOverride: true,
    },
  },
} as const;

type ProfitQuote = NonNullable<Awaited<ReturnType<typeof fetchProfitQuotes>>>[number];

function fetchProfitQuotes(quoteIds: string[]) {
  return prisma.quote.findMany({ where: { id: { in: quoteIds } }, select: PROFIT_SELECT });
}

interface PremiumRates {
  normalRatePercent: number;
  selfSourcedProscetRatePercent: number;
  selfSourcedBuyoutDiscountRatePercent: number;
}

// One quote's full breakdown — every line the aggregate dashboard totals
// are built from, just kept per-deal instead of summed away, plus this
// quote's own contribution to every percent_of_profit/flat_per_cargo_kg
// investor's cut and the manager's premium so the per-quote rows and the
// batch totals below always reconcile exactly. remainder_share investors
// aren't computed here — that split only makes sense on the aggregate
// remainder pool (see buildProfitReport below), not per-row.
function computeQuoteBreakdown(
  q: ProfitQuote,
  cargoRates: { usdPerKg: number; usdPerM3: number },
  premiumRates: PremiumRates,
  investors: InvestorConfig[],
  cnyProfitTiers: CnyProfitTiers,
  attachedServicesTotalRub: number,
) {
  const fields: QuoteProfitFields = q;
  const { proscetRub, buyoutRub, discountRub } = q.buyoutFactConfirmed ? factualSourceProfits(fields) : estimatedSourceProfits(fields);
  // Real spread once a buyout is confirmed; before that, the known
  // per-¥ margin from Тарифы (see estimatedFxProfitRub in
  // lib/desk-services/quote-profit.ts) instead of silently showing 0.
  const fx = q.buyoutFactConfirmed ? fxProfitRub(fields) : estimatedFxProfitRub(q, attachedServicesTotalRub, cnyProfitTiers);
  const cargo = cargoProfitRub(fields);
  const rawTotalRub = proscetRub + buyoutRub + discountRub + fx + cargo;
  const clampedTotalRub = Math.max(0, rawTotalRub);

  const investorShares = investors
    .filter((inv) => inv.shareType === "percent_of_profit" || inv.shareType === "flat_per_cargo_kg")
    .map((inv) => {
      const shareRub =
        inv.shareType === "percent_of_profit"
          ? clampedTotalRub * (effectiveInvestorRatePercent(q.client, Number(inv.ratePercent ?? 0)) / 100)
          : investorCargoShareRub(q.totalWeightKg, Number(inv.rateUsdPerKg ?? 0), q.usdRateUsed);
      return { id: inv.id, name: inv.name, shareType: inv.shareType, shareRub };
    });

  let managerPremiumRub: number;
  if (q.buyoutFactConfirmed) {
    const proscetRate = q.buyoutSelfSourcedBoost ? premiumRates.selfSourcedProscetRatePercent : premiumRates.normalRatePercent;
    const buyoutDiscountRate = q.buyoutSelfSourcedBoost
      ? premiumRates.selfSourcedBuyoutDiscountRatePercent
      : premiumRates.normalRatePercent;
    managerPremiumRub =
      Math.max(0, proscetRub) * (proscetRate / 100) + (Math.max(0, buyoutRub) + Math.max(0, discountRub)) * (buyoutDiscountRate / 100);
  } else {
    const isBoosted = isSelfSourcedFor(q.client, q.managerId);
    const proscetRate = isBoosted ? premiumRates.selfSourcedProscetRatePercent : premiumRates.normalRatePercent;
    const buyoutRate = isBoosted ? premiumRates.selfSourcedBuyoutDiscountRatePercent : premiumRates.normalRatePercent;
    managerPremiumRub = Math.max(0, proscetRub) * (proscetRate / 100) + Math.max(0, buyoutRub) * (buyoutRate / 100);
  }
  // Cargo bonus locks in only at handed_to_client (cargoBonusRatePercent
  // set) — before that it's a live "if this quote were self-sourced today"
  // estimate, same as the dashboard.
  const cargoBonusRub =
    q.cargoBonusRatePercent !== null
      ? Number(q.cargoBonusRatePercent) > 0
        ? flatCargoBonusRub(q, cargoRates)
        : 0
      : isSelfSourcedFor(q.client, q.managerId)
        ? flatCargoBonusRub(q, cargoRates)
        : 0;
  managerPremiumRub += cargoBonusRub;

  return {
    id: q.id,
    displayId: q.displayId,
    productName: q.productName,
    status: q.status,
    createdAt: q.createdAt,
    manager: q.manager,
    client: q.client,
    totalRub: Number(q.totalRub),
    confirmed: q.buyoutFactConfirmed,
    proscetRub,
    buyoutRub,
    discountRub,
    fxProfitRub: fx,
    cargoProfitRub: cargo,
    rawTotalRub,
    investorShares,
    managerPremiumRub,
  };
}

async function loadRatesAndQuotes(quoteIds: string[]) {
  const [tariffSettings, systemSettings, quotes, investorRows] = await Promise.all([
    prisma.tariffSettings.findFirst({ orderBy: { createdAt: "desc" } }),
    getSystemSettings(),
    fetchProfitQuotes(quoteIds),
    prisma.investor.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
  ]);
  const cargoRates = {
    usdPerKg: tariffSettings ? Number(tariffSettings.managerCargoRateUsdPerKg) : 0.3,
    usdPerM3: tariffSettings ? Number(tariffSettings.managerCargoRateUsdPerM3) : 5,
  };
  const premiumRates: PremiumRates = {
    normalRatePercent: Number(systemSettings.normalRatePercent),
    selfSourcedProscetRatePercent: Number(systemSettings.selfSourcedProscetRatePercent),
    selfSourcedBuyoutDiscountRatePercent: Number(systemSettings.selfSourcedBuyoutDiscountRatePercent),
  };
  const investors: InvestorConfig[] = investorRows.map((inv) => ({
    id: inv.id,
    name: inv.name,
    shareType: inv.shareType as InvestorConfig["shareType"],
    ratePercent: inv.ratePercent !== null ? Number(inv.ratePercent) : null,
    rateUsdPerKg: inv.rateUsdPerKg !== null ? Number(inv.rateUsdPerKg) : null,
  }));
  const cnyProfitTiers: CnyProfitTiers = {
    base: tariffSettings?.cnyProfitPerYuanRub !== undefined && tariffSettings?.cnyProfitPerYuanRub !== null ? Number(tariffSettings.cnyProfitPerYuanRub) : 0,
    tier3000:
      tariffSettings?.cnyProfitPerYuanRubTier3000 !== undefined && tariffSettings?.cnyProfitPerYuanRubTier3000 !== null
        ? Number(tariffSettings.cnyProfitPerYuanRubTier3000)
        : null,
    tier10000:
      tariffSettings?.cnyProfitPerYuanRubTier10000 !== undefined && tariffSettings?.cnyProfitPerYuanRubTier10000 !== null
        ? Number(tariffSettings.cnyProfitPerYuanRubTier10000)
        : null,
    tier30000:
      tariffSettings?.cnyProfitPerYuanRubTier30000 !== undefined && tariffSettings?.cnyProfitPerYuanRubTier30000 !== null
        ? Number(tariffSettings.cnyProfitPerYuanRubTier30000)
        : null,
  };

  // Needed only for estimateCnyVolume — one batched sum per quote instead
  // of a query per quote.
  const attachedServiceSums = await prisma.quoteAttachedService.groupBy({
    by: ["quoteId"],
    where: { quoteId: { in: quotes.map((q) => q.id) } },
    _sum: { priceRub: true },
  });
  const attachedServicesByQuoteId = new Map(attachedServiceSums.map((s) => [s.quoteId, Number(s._sum.priceRub ?? 0)]));

  return { quotes, cargoRates, premiumRates, investors, cnyProfitTiers, attachedServicesByQuoteId };
}

// The single entry point both routes call — guarantees the on-screen report
// and the downloaded PDF can never show different numbers for the same
// selection.
async function buildProfitReport(quoteIds: string[]) {
  const { quotes, cargoRates, premiumRates, investors, cnyProfitTiers, attachedServicesByQuoteId } = await loadRatesAndQuotes(quoteIds);
  const rows = quotes.map((q) =>
    computeQuoteBreakdown(q, cargoRates, premiumRates, investors, cnyProfitTiers, attachedServicesByQuoteId.get(q.id) ?? 0),
  );

  const totalRevenueRub = rows.reduce((sum, r) => sum + r.totalRub, 0);
  const totalProfitRub = rows.reduce((sum, r) => sum + r.rawTotalRub, 0);
  const profitPoolRub = rows.reduce((sum, r) => sum + Math.max(0, r.rawTotalRub), 0);
  const managerPremiumRub = rows.reduce((sum, r) => sum + r.managerPremiumRub, 0);

  // percent_of_profit + flat_per_cargo_kg — sum each investor's per-row
  // contribution across the whole selection.
  const investorShares: { id: string; name: string; shareType: string; shareRub: number }[] = [];
  let percentAndFlatSharesRub = 0;
  for (const inv of investors) {
    if (inv.shareType !== "percent_of_profit" && inv.shareType !== "flat_per_cargo_kg") continue;
    const shareRub = rows.reduce((sum, r) => sum + (r.investorShares.find((s) => s.id === inv.id)?.shareRub ?? 0), 0);
    percentAndFlatSharesRub += shareRub;
    investorShares.push({ id: inv.id, name: inv.name, shareType: inv.shareType, shareRub });
  }
  // remainder_share — splits whatever's left evenly, N-way (was a
  // hardcoded "/2" for Александр+Антон, now works for any count).
  const remainderInvestors = investors.filter((inv) => inv.shareType === "remainder_share");
  const remainderPoolRub = profitPoolRub - percentAndFlatSharesRub - managerPremiumRub;
  const perRemainderShareRub = splitRemainderRub(remainderPoolRub, remainderInvestors.length);
  for (const inv of remainderInvestors) {
    investorShares.push({ id: inv.id, name: inv.name, shareType: inv.shareType, shareRub: perRemainderShareRub });
  }

  // Per-source breakdown of totalProfitRub above — so "Прибыль компании"
  // doesn't stay one opaque number, same "show what it's made of" instinct
  // as pipelineGoodsRub/pipelineCargoRub etc. in app/api/manager-dashboard/
  // route.ts. Always reconciles exactly to totalProfitRub by construction
  // (each row's rawTotalRub is defined as the sum of these five fields).
  const totalProscetRub = rows.reduce((sum, r) => sum + r.proscetRub, 0);
  const totalBuyoutRub = rows.reduce((sum, r) => sum + r.buyoutRub, 0);
  const totalDiscountRub = rows.reduce((sum, r) => sum + r.discountRub, 0);
  const totalFxProfitRub = rows.reduce((sum, r) => sum + r.fxProfitRub, 0);
  const totalCargoProfitRub = rows.reduce((sum, r) => sum + r.cargoProfitRub, 0);

  // investorShares was only needed above to sum into the totals-level
  // investorShares array — the per-quote table doesn't display it (same as
  // managerPremiumRub never being shown per-row either), so it's dropped
  // here rather than shipped to the client unused.
  const publicRows = rows.map((row) => {
    const publicRow = { ...row };
    delete (publicRow as Partial<typeof row>).investorShares;
    return publicRow;
  });

  return {
    rows: publicRows,
    totals: {
      totalRevenueRub,
      totalProfitRub,
      totalProscetRub,
      totalBuyoutRub,
      totalDiscountRub,
      totalFxProfitRub,
      totalCargoProfitRub,
      profitPoolRub,
      managerPremiumRub,
      investorShares,
    },
  };
}

function parseQuoteIds(body: unknown): string[] | null {
  const { quoteIds } = (body as { quoteIds?: unknown }) ?? {};
  if (!Array.isArray(quoteIds) || quoteIds.length === 0 || !quoteIds.every((id) => typeof id === "string")) return null;
  return quoteIds;
}

export { buildProfitReport, parseQuoteIds };
export type { ProfitQuote };
