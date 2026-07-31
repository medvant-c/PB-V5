import "server-only";
import { prisma } from "@/lib/prisma";
import { getSystemSettings } from "@/lib/system-settings";
import {
  cargoProfitRub,
  effectiveVladRatePercent,
  estimatedSourceProfits,
  factualSourceProfits,
  flatCargoBonusRub,
  fxProfitRub,
  isSelfSourcedFor,
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
// quote's own contribution to Влад's cut and the manager's premium so the
// per-quote rows and the batch totals below always reconcile exactly.
function computeQuoteBreakdown(
  q: ProfitQuote,
  cargoRates: { usdPerKg: number; usdPerM3: number },
  premiumRates: PremiumRates,
  vladShareRatePercent: number,
) {
  const fields: QuoteProfitFields = q;
  const { proscetRub, buyoutRub, discountRub } = q.buyoutFactConfirmed ? factualSourceProfits(fields) : estimatedSourceProfits(fields);
  const fx = q.buyoutFactConfirmed ? fxProfitRub(fields) : 0;
  const cargo = cargoProfitRub(fields);
  const rawTotalRub = proscetRub + buyoutRub + discountRub + fx + cargo;
  const clampedTotalRub = Math.max(0, rawTotalRub);

  const vladRatePercent = effectiveVladRatePercent(q.client, vladShareRatePercent);
  const vladShareRub = clampedTotalRub * (vladRatePercent / 100);

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
    vladShareRub,
    managerPremiumRub,
  };
}

async function loadRatesAndQuotes(quoteIds: string[]) {
  const [tariffSettings, systemSettings, quotes] = await Promise.all([
    prisma.tariffSettings.findFirst({ orderBy: { createdAt: "desc" } }),
    getSystemSettings(),
    fetchProfitQuotes(quoteIds),
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
  const vladShareRatePercent = Number(systemSettings.vladShareRatePercent);
  return { quotes, cargoRates, premiumRates, vladShareRatePercent };
}

// The single entry point both routes call — guarantees the on-screen report
// and the downloaded PDF can never show different numbers for the same
// selection.
async function buildProfitReport(quoteIds: string[]) {
  const { quotes, cargoRates, premiumRates, vladShareRatePercent } = await loadRatesAndQuotes(quoteIds);
  const rows = quotes.map((q) => computeQuoteBreakdown(q, cargoRates, premiumRates, vladShareRatePercent));

  const totalRevenueRub = rows.reduce((sum, r) => sum + r.totalRub, 0);
  const totalProfitRub = rows.reduce((sum, r) => sum + r.rawTotalRub, 0);
  const profitPoolRub = rows.reduce((sum, r) => sum + Math.max(0, r.rawTotalRub), 0);
  const vladShareRub = rows.reduce((sum, r) => sum + r.vladShareRub, 0);
  const managerPremiumRub = rows.reduce((sum, r) => sum + r.managerPremiumRub, 0);
  // Same 50/50 split as app/api/manager-dashboard/route.ts's founderShareRub
  // — this value IS one founder's share already (Александр's or Антон's),
  // not the combined pool.
  const founderShareRub = (profitPoolRub - vladShareRub - managerPremiumRub) / 2;

  return {
    rows,
    totals: { totalRevenueRub, totalProfitRub, profitPoolRub, vladShareRub, managerPremiumRub, founderShareRub },
  };
}

function parseQuoteIds(body: unknown): string[] | null {
  const { quoteIds } = (body as { quoteIds?: unknown }) ?? {};
  if (!Array.isArray(quoteIds) || quoteIds.length === 0 || !quoteIds.every((id) => typeof id === "string")) return null;
  return quoteIds;
}

export { buildProfitReport, parseQuoteIds };
export type { ProfitQuote };
