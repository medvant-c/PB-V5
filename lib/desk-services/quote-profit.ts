import "server-only";

// Pure per-quote profit math — extracted from app/api/manager-dashboard/
// route.ts so this exact formula has exactly one implementation, shared by
// the dashboard's aggregate numbers and the per-deal profit report
// (app/api/manager-profit-report/route.ts). Never change one without the
// other picking it up automatically.

interface QuoteProfitFields {
  totalRub: unknown;
  totalPriceRub: unknown;
  chinaDeliveryRub: unknown;
  cargoDeliveryRub: unknown;
  // The real cargo cost snapshotted on the quote (Quote.cargoCostRub) — NOT
  // cargoDeliveryRub, which is what the client pays and already has the
  // owner's cargo margin baked in.
  cargoCostRub: unknown;
  searchServiceFeeRub: unknown;
  customProductionFeeRub: unknown;
  cnyRateUsed: unknown;
  buyoutFactConfirmed: boolean;
  actualBuyoutCny: unknown;
  actualBuyoutRateUsed: unknown;
  actualSupplierDiscountCny: unknown;
  // Real extra costs billed to the client at actual shipment (see
  // actualize-cargo/route.ts) — pure pass-through, excluded from both
  // residual formulas below for the same reason chinaDeliveryRub/
  // cargoDeliveryRub already are. See Quote.packagingCostRub in
  // prisma/schema.prisma.
  packagingCostRub: unknown;
  insuranceCostRub: unknown;
  mskExpensesRub: unknown;
}

function extraShipmentCostsRub(q: QuoteProfitFields): number {
  return Number(q.packagingCostRub) + Number(q.insuranceCostRub) + Number(q.mskExpensesRub);
}

interface SourceProfits {
  proscetRub: number;
  buyoutRub: number;
  discountRub: number;
}

// Просчёт profit is the search-service fee (0 if waived) plus the
// "производство под заказ" fee, if any — same no-cost-tracked reasoning
// applies to both, so it rides along in the same bucket.
function proscetProfitRub(q: QuoteProfitFields): number {
  return Number(q.searchServiceFeeRub) + Number(q.customProductionFeeRub);
}

// Pre-confirmation estimate: goods cost assumed == quoted price (zero
// margin), cargo fully excluded (revenue AND cost), discount unknowable
// before a real buyout exists. "Выкуп" here is the residual — buyout
// commission plus whatever markup the estimate implies — after Просчёт is
// carved out.
function estimatedSourceProfits(q: QuoteProfitFields): SourceProfits {
  const residual =
    Number(q.totalRub) - Number(q.totalPriceRub) - Number(q.chinaDeliveryRub) - Number(q.cargoDeliveryRub) - extraShipmentCostsRub(q);
  const proscetRub = proscetProfitRub(q);
  return { proscetRub, buyoutRub: residual - proscetRub, discountRub: 0 };
}

// Post-confirmation: real goods cost (actualBuyoutCny × actualBuyoutRateUsed)
// replaces totalPriceRub, so a factory discount or favorable FX already
// folded into a smaller actualBuyoutCny shows up as real profit instead of
// vanishing into "100% pass-through cost." actualSupplierDiscountCny is a
// SEPARATE, additional discount reported alongside actualBuyoutCny, carved
// out of the residual into its own line.
function factualSourceProfits(q: QuoteProfitFields): SourceProfits {
  const realBuyoutRub = Number(q.actualBuyoutCny) * Number(q.actualBuyoutRateUsed);
  const residual =
    Number(q.totalRub) - Number(q.chinaDeliveryRub) - Number(q.cargoDeliveryRub) - realBuyoutRub - extraShipmentCostsRub(q);
  const proscetRub = proscetProfitRub(q);
  const discountRub = Number(q.actualSupplierDiscountCny ?? 0) * Number(q.actualBuyoutRateUsed);
  return { proscetRub, buyoutRub: residual - proscetRub - discountRub, discountRub };
}

// Курсовая разница — the spread between the rate the client was quoted
// (cnyRateUsed) and the real rate actually used to buy the goods
// (actualBuyoutRateUsed), applied to the real ¥ amount spent. Never goes to
// a manager's premium — only feeds Влад's cut and the founders' split.
function fxProfitRub(q: QuoteProfitFields): number {
  return Number(q.actualBuyoutCny) * (Number(q.cnyRateUsed) - Number(q.actualBuyoutRateUsed));
}

// Cargo margin — cargoDeliveryRub (what the client pays) minus cargoCostRub
// (real or estimated cost). Owner-only visibility, same as it's always been.
function cargoProfitRub(q: QuoteProfitFields): number {
  return Number(q.cargoDeliveryRub) - Number(q.cargoCostRub);
}

// Combined per-quote profit — proscet + buyout + discount + fx (factual
// only) + cargo margin. Deliberately NOT clamped here (a caller decides
// whether it needs the raw figure — e.g. to show a genuinely loss-making
// deal as negative — or the Math.max(0, ...)-clamped version used when
// feeding a shared profit pool, same convention as
// app/api/manager-dashboard/route.ts).
function totalQuoteProfitRub(q: QuoteProfitFields): number {
  const { proscetRub, buyoutRub, discountRub } = q.buyoutFactConfirmed ? factualSourceProfits(q) : estimatedSourceProfits(q);
  return proscetRub + buyoutRub + discountRub + (q.buyoutFactConfirmed ? fxProfitRub(q) : 0) + cargoProfitRub(q);
}

// Client.vladShareRatePercentOverride (still that name, see its own schema
// comment) lets the owner waive or reduce every "percent_of_profit"
// investor's cut for one specific client, uniformly, without touching
// their individual global rates.
function effectiveInvestorRatePercent(client: { vladShareRatePercentOverride: unknown }, defaultRatePercent: number): number {
  return client.vladShareRatePercentOverride !== null && client.vladShareRatePercentOverride !== undefined
    ? Number(client.vladShareRatePercentOverride)
    : defaultRatePercent;
}

function isSelfSourcedFor(
  client: { selfSourcedConfirmed: boolean; createdByManagerId: string | null },
  managerId: string,
): boolean {
  return client.selfSourcedConfirmed && client.createdByManagerId === managerId;
}

// Self-sourced-client cargo bonus: flat $/кг or $/м³ (owner-editable in
// Тарифы), on whichever basis the quote actually prices cargo on — same
// "density mode AND density>=100 -> weight basis, else volume basis" rule
// as the actualize-cargo route, so the bonus always matches how
// cargoDeliveryRub itself was computed.
function flatCargoBonusRub(
  q: { deliveryPricingMode: string; densityKgM3: unknown; totalWeightKg: unknown; totalVolumeM3: unknown; usdRateUsed: unknown },
  rates: { usdPerKg: number; usdPerM3: number },
): number {
  const basisIsDensity = q.deliveryPricingMode === "density" && Number(q.densityKgM3) >= 100;
  const usdRateUsed = Number(q.usdRateUsed);
  return basisIsDensity ? Number(q.totalWeightKg) * rates.usdPerKg * usdRateUsed : Number(q.totalVolumeM3) * rates.usdPerM3 * usdRateUsed;
}

// Four-tier bracket lookup by ¥ volume — same shape/threshold convention as
// pickCnyRateForTotal in lib/quote-engine.ts, kept as its own copy here
// (not imported) since that file is deliberately NOT server-only (shared
// with the client-side quote preview) and this is profit data that must
// never ship to the browser.
interface CnyProfitTiers {
  base: number;
  tier3000: number | null;
  tier10000: number | null;
  tier30000: number | null;
}

function pickCnyProfitForVolume(cnyVolume: number, tiers: CnyProfitTiers): number {
  if (cnyVolume >= 30000 && tiers.tier30000 !== null) return tiers.tier30000;
  if (cnyVolume >= 10000 && tiers.tier10000 !== null) return tiers.tier10000;
  if (cnyVolume >= 3000 && tiers.tier3000 !== null) return tiers.tier3000;
  return tiers.base;
}

interface CnyVolumeFields {
  totalPriceCny: unknown;
  chinaDeliveryCny: unknown;
  searchServiceFeeRub: unknown;
  buyoutCommissionRub: unknown;
  customProductionFeeRub: unknown;
  cnyRateUsed: unknown;
}

// Reconstructs the same ¥ "volume" figure computeQuoteWithAutoCnyTier used
// to pick this quote's own cnyRateUsed (see lib/quote-engine.ts) — from the
// quote's own stored/frozen numbers, not live tariffs, so this stays
// correct regardless of what today's tariffs look like later.
// attachedServicesTotalRub isn't a Quote column (lives on
// QuoteAttachedService rows), so it's passed in by the caller — one batched
// query per report, not one query per quote.
function estimateCnyVolume(q: CnyVolumeFields, attachedServicesTotalRub: number): number {
  const cnyRateUsed = Number(q.cnyRateUsed);
  return (
    Number(q.totalPriceCny) +
    Number(q.chinaDeliveryCny) +
    (Number(q.searchServiceFeeRub) + Number(q.buyoutCommissionRub) + Number(q.customProductionFeeRub) + attachedServicesTotalRub) /
      cnyRateUsed
  );
}

// Estimated (pre-confirmation) курсовая разница — a known, fixed margin per
// ¥ actually converted (owner-set in Тарифы, see
// TariffSettings.cnyProfitPerYuanRub* in prisma/schema.prisma), applied to
// this quote's own ¥ volume. fxProfitRub() above only knows the REAL spread
// once actualBuyoutCny/actualBuyoutRateUsed exist after a confirmed
// buyout — this is what to show before that, same "estimate now, replace
// with fact later" spirit as estimatedSourceProfits() vs
// factualSourceProfits(). See PB-V5 chat 2026-07-31.
function estimatedFxProfitRub(q: CnyVolumeFields, attachedServicesTotalRub: number, tiers: CnyProfitTiers): number {
  const cnyVolume = estimateCnyVolume(q, attachedServicesTotalRub);
  return cnyVolume * pickCnyProfitForVolume(cnyVolume, tiers);
}

interface ManagerPremiumRates {
  normalRatePercent: number;
  selfSourcedProscetRatePercent: number;
  selfSourcedBuyoutDiscountRatePercent: number;
}

// Which of the two premium buckets each "Счёт на выкуп" line-item category
// (see QuotePaymentCategory in prisma/schema.prisma) falls into — search_
// service/custom_production are exactly what proscetProfitRub() above is
// made of, so a payment against either one earns the Просчёт rate; every
// other category (goods/china_delivery/buyout_commission/attached_services)
// earns the Выкуп/Скидка rate, same split confirm-buyout already applies to
// the WHOLE quote at once. See QuotePaymentAllocation in
// prisma/schema.prisma.
const PROSCET_PAYMENT_CATEGORIES = new Set(["search_service", "custom_production"]);

function isProscetPaymentCategory(category: string): boolean {
  return PROSCET_PAYMENT_CATEGORIES.has(category);
}

// Which categories credit ANY premium at all when paid through a "Счёт на
// выкуп" partial payment, before confirm-buyout — search_service/
// custom_production/buyout_commission/attached_services are 100% margin
// with zero cost-of-goods the moment the quote is priced (proscetProfitRub
// above, and buyoutRub = buyoutCommissionRub + attachedServicesTotalRub
// pre-confirmation per estimatedSourceProfits — the goods/china_delivery
// terms cancel out of that residual entirely). goods and china_delivery
// deliberately credit ZERO premium here: their real profit (quoted price
// vs. what the factory purchase actually costs) isn't known until
// confirm-buyout runs with the real actualBuyoutCny — crediting premium on
// a QUOTED price now would risk paying out on a margin that doesn't
// materialize (or is smaller) once the real purchase happens. That markup,
// if any, still reaches the manager normally at confirm-buyout — this
// function only decides what's payable EARLY, at partial-payment time. See
// PB-V5 chat 2026-08-04.
const PREMIUM_ELIGIBLE_PAYMENT_CATEGORIES = new Set(["search_service", "custom_production", "buyout_commission", "attached_services"]);

// Premium for ONE payment allocation, frozen at creation time (see
// QuotePaymentAllocation.premiumRub's schema comment) — isBoosted is the
// client's self-sourced status looked up LIVE at that moment, never
// recomputed later, same "lock in at the real-money event" rule
// buyoutSelfSourcedBoost already follows.
function computePaymentAllocationPremiumRub(category: string, amountRub: number, isBoosted: boolean, rates: ManagerPremiumRates): number {
  if (!PREMIUM_ELIGIBLE_PAYMENT_CATEGORIES.has(category)) return 0;
  const rate = isProscetPaymentCategory(category)
    ? isBoosted
      ? rates.selfSourcedProscetRatePercent
      : rates.normalRatePercent
    : isBoosted
      ? rates.selfSourcedBuyoutDiscountRatePercent
      : rates.normalRatePercent;
  return amountRub * (rate / 100);
}

interface AlreadyPaidPremium {
  proscetRub: number;
  buyoutRub: number;
}

// Sums QuotePaymentAllocation.premiumRub (already frozen per-allocation at
// creation time — see that model's schema comment) into the same two
// buckets factualManagerPremiumRub below works in, so a quote that's had
// partial payments never gets premiumed twice: once when the payment was
// made, again when confirm-buyout later runs its own full-quote
// calculation. Zero allocations (the common case, nothing paid this way
// yet) naturally returns {0,0} — every caller below is then a no-op
// passthrough to the exact math that existed before this feature.
function sumAlreadyPaidPremium(allocations: { category: string; premiumRub: unknown }[]): AlreadyPaidPremium {
  let proscetRub = 0;
  let buyoutRub = 0;
  for (const a of allocations) {
    if (isProscetPaymentCategory(a.category)) proscetRub += Number(a.premiumRub);
    else buyoutRub += Number(a.premiumRub);
  }
  return { proscetRub, buyoutRub };
}

// The manager's premium on ONE confirmed quote's Просчёт/Выкуп/Скидка —
// same formula the dashboard's aggregate factualPremiumRub and the profit
// report's per-row managerPremiumRub each computed independently before
// this was factored out (see PB-V5 chat 2026-08-01). Does NOT include the
// self-sourced cargo bonus (flatCargoBonusRub) — that's gated on
// cargoBonusRatePercent being locked in separately from
// buyoutFactConfirmed, so a caller that needs the FULL premium (cargo
// bonus included) adds flatCargoBonusRub() on top itself, same split every
// existing caller already used.
//
// alreadyPaidPremium (default {0,0}) — per-bucket premium already credited
// via QuotePaymentAllocation rows before this quote reached
// buyoutFactConfirmed (see sumAlreadyPaidPremium above). Takes the MAX of
// "full premium the standard formula says is owed" and "what's already
// been paid" per bucket, rather than adding them — a partial payment can
// never make the manager's total premium on this quote exceed what the
// full-quote formula would give on its own, it only changes WHEN each
// slice was actually credited.
function factualManagerPremiumRub(
  sourceProfits: SourceProfits,
  buyoutSelfSourcedBoost: boolean,
  rates: ManagerPremiumRates,
  alreadyPaidPremium: AlreadyPaidPremium = { proscetRub: 0, buyoutRub: 0 },
): number {
  const proscetRate = buyoutSelfSourcedBoost ? rates.selfSourcedProscetRatePercent : rates.normalRatePercent;
  const buyoutDiscountRate = buyoutSelfSourcedBoost ? rates.selfSourcedBuyoutDiscountRatePercent : rates.normalRatePercent;
  const fullProscetPremiumRub = Math.max(0, sourceProfits.proscetRub) * (proscetRate / 100);
  const fullBuyoutPremiumRub = (Math.max(0, sourceProfits.buyoutRub) + Math.max(0, sourceProfits.discountRub)) * (buyoutDiscountRate / 100);
  return (
    Math.max(fullProscetPremiumRub, alreadyPaidPremium.proscetRub) + Math.max(fullBuyoutPremiumRub, alreadyPaidPremium.buyoutRub)
  );
}

// A "flat_per_cargo_kg"-type investor (e.g. Юра) — flat $/kg on delivered
// cargo weight, on every cargo delivery regardless of self-sourced status
// (unlike a manager's own flatCargoBonusRub above, which is self-sourced-
// only and switches basis density/volume — this is always per-kg).
// totalWeightKg is the same field cargoProfitRub implicitly relies on: an
// estimate before cargo is actualized, the real delivered weight after —
// no separate estimated/factual formula needed here for the same reason
// cargoProfitRub itself doesn't need one. See PB-V5 chat 2026-07-31.
function investorCargoShareRub(totalWeightKg: unknown, rateUsdPerKg: number, usdRateUsed: unknown): number {
  return Number(totalWeightKg) * rateUsdPerKg * Number(usdRateUsed);
}

// A "remainder_share"-type investor (e.g. Александр/Антон) splits whatever
// is left after every percent_of_profit/flat_per_cargo_kg cut and every
// manager premium — evenly among however many active remainder_share
// investors there are (was a hardcoded "/2", now N-way). 0 investors of
// this type = nothing to split, not a divide-by-zero.
function splitRemainderRub(remainderPoolRub: number, remainderInvestorCount: number): number {
  return remainderInvestorCount > 0 ? remainderPoolRub / remainderInvestorCount : 0;
}

type InvestorShareType = "percent_of_profit" | "flat_per_cargo_kg" | "remainder_share";

interface InvestorConfig {
  id: string;
  name: string;
  shareType: InvestorShareType;
  ratePercent: number | null;
  rateUsdPerKg: number | null;
}

export {
  proscetProfitRub,
  estimatedSourceProfits,
  factualSourceProfits,
  fxProfitRub,
  cargoProfitRub,
  totalQuoteProfitRub,
  effectiveInvestorRatePercent,
  isSelfSourcedFor,
  factualManagerPremiumRub,
  flatCargoBonusRub,
  pickCnyProfitForVolume,
  estimateCnyVolume,
  estimatedFxProfitRub,
  investorCargoShareRub,
  splitRemainderRub,
  isProscetPaymentCategory,
  sumAlreadyPaidPremium,
  computePaymentAllocationPremiumRub,
};
export type {
  QuoteProfitFields,
  SourceProfits,
  CnyProfitTiers,
  CnyVolumeFields,
  InvestorShareType,
  InvestorConfig,
  ManagerPremiumRates,
  AlreadyPaidPremium,
};
