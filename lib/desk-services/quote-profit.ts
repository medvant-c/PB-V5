import "server-only";
import { sumAlreadyPaidRubByCategory } from "@/lib/desk-services/buyout-invoice-calc";

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
  // "Только карго" (see Quote.isCargoOnly in prisma/schema.prisma) —
  // totalRub for this quote is cargoDeliveryRub alone, so totalPriceRub/
  // searchServiceFeeRub/buyoutCommissionRub etc. were entered for
  // record-keeping but never actually billed to the client. Both residual
  // formulas below gate on this and return zero proscet/buyout/discount —
  // the ONLY profit a cargo-only quote contributes is cargoProfitRub,
  // computed separately and unaffected by this flag.
  isCargoOnly: boolean;
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
  if (q.isCargoOnly) return { proscetRub: 0, buyoutRub: 0, discountRub: 0 };
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
  if (q.isCargoOnly) return { proscetRub: 0, buyoutRub: 0, discountRub: 0 };
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
  if (q.isCargoOnly) return 0;
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

// Бонус менеджера за карго по своему клиенту: плоская ставка $/кг или
// $/м³ (задаётся руководителем в Тарифы), на той же базе, на которой сама
// сделка считает карго — то же правило "density-режим И density>=100 ->
// база вес, иначе объём", что и в actualize-cargo, чтобы бонус всегда
// совпадал с тем, как посчитан cargoDeliveryRub.
//
// ratePercent — множитель к этой базовой ставке: 10 (стандарт, ставится
// автоматически при "выдано клиенту", см. status/route.ts) даёт бонус
// ровно по базовой ставке, 5 — половину, 20 — двойной, 0 — ничего.
// Раньше Quote.cargoBonusRatePercent использовался ТОЛЬКО как флаг "> 0"
// (см. PB-V5 chat 2026-08-06) — ручная правка руководителем через
// cargo-bonus-rate/route.ts визуально позволяла задать любой %, но реально
// ни на что не влияла, кроме 0. Теперь процент — реальный множитель.
function flatCargoBonusRub(
  q: { deliveryPricingMode: string; densityKgM3: unknown; totalWeightKg: unknown; totalVolumeM3: unknown; usdRateUsed: unknown },
  rates: { usdPerKg: number; usdPerM3: number },
  ratePercent = 10,
): number {
  const basisIsDensity = q.deliveryPricingMode === "density" && Number(q.densityKgM3) >= 100;
  const usdRateUsed = Number(q.usdRateUsed);
  const baseRub = basisIsDensity ? Number(q.totalWeightKg) * rates.usdPerKg * usdRateUsed : Number(q.totalVolumeM3) * rates.usdPerM3 * usdRateUsed;
  return baseRub * (ratePercent / 10);
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
  isCargoOnly: boolean;
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
  // Cargo-only quotes (see Quote.isCargoOnly) never actually convert ¥ for
  // a real purchase — totalPriceCny/searchServiceFeeRub/buyoutCommissionRub
  // are stored for record-keeping only, so estimating a курсовая разница
  // off them would invent profit that doesn't exist.
  if (q.isCargoOnly) return 0;
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

function isPremiumEligiblePaymentCategory(category: string): boolean {
  return PREMIUM_ELIGIBLE_PAYMENT_CATEGORIES.has(category);
}

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

// Same idea as sumAlreadyPaidPremium below, but for the underlying ₽ itself
// rather than the premium on it — a "Счёт на выкуп" partial payment against
// search_service/custom_production/buyout_commission/attached_services is
// already-realized profit (100% margin, no unknown cost-of-goods, per
// PREMIUM_ELIGIBLE_PAYMENT_CATEGORIES's own comment above) the moment the
// money arrives, not just once buyoutFactConfirmed later runs. goods/
// china_delivery are deliberately excluded — same reasoning as premium: their
// real margin isn't known until the actual purchase cost exists. Lets a
// not-yet-confirmed quote's dashboard "факт" bucket reflect a real payment
// (e.g. a client paying for "услуга поиска" up front) instead of showing 0
// profit until the whole buyout is confirmed. See PB-V5 chat 2026-08-05.
function sumAlreadyPaidProfitRub(allocations: { category: string; amountRub: unknown }[]): AlreadyPaidPremium {
  let proscetRub = 0;
  let buyoutRub = 0;
  for (const a of allocations) {
    if (!PREMIUM_ELIGIBLE_PAYMENT_CATEGORIES.has(a.category)) continue;
    if (isProscetPaymentCategory(a.category)) proscetRub += Number(a.amountRub);
    else buyoutRub += Number(a.amountRub);
  }
  return { proscetRub, buyoutRub };
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

// --- Реальная прибыль по факту денег в Кассе (не по введённым вручную
// цифрам с подтверждением, и не по полноте оплаты) — см. PB-V5 chat
// 2026-08-11. Заменяет factualSourceProfits/estimatedSourceProfits ТОЛЬКО
// для сделок, ещё не подтверждённых по старой схеме (buyoutFactConfirmed:
// false) — уже подтверждённые продолжают использовать прежнюю формулу без
// изменений (см. вызывающий код в app/api/manager-dashboard/route.ts и
// др.).
//
// Что решает "реализован ли блок" (показывать реальные цифры из Кассы,
// или план из просчёта) — СТАТУС сделки (см. BUYOUT_REALIZED_STATUSES/
// CARGO_REALIZED_STATUSES в lib/quote-statuses.ts), а НЕ полнота оплаты.
// Как только менеджер перевёл сделку в статус "в доставке на склад" (для
// Выкупа) или "отправлен клиенту" (для Карго) — это значит товар/карго
// реально куплены и уже в пути, поэтому отчёт показывает реальные, пусть
// ещё не полностью собранные (например, при частичной предоплате
// производства под заказ — остаток продолжит поступать позже) цифры из
// Кассы, а не ждёт полного покрытия счёта. Эти функции сами это решение
// не принимают — только считают приход/расход по тому, что реально
// проведено в Кассе; вызывающий код сам решает, какой из двух наборов
// (план/факт) показывать, исходя из статуса.
//
// Курсовая разница и "скидка поставщика" больше не считаются отдельными
// строками — они уже растворены в разнице "сколько реально пришло" минус
// "сколько реально потрачено" (расходный ордер записывается в той валюте
// и по тому курсу, по которому реально платили), и вся эта разница теперь
// участвует в премии менеджера наравне с остальной прибылью блока —
// явное решение, см. PB-V5 chat 2026-08-11 (раньше курсовая разница шла
// только Владу/инвесторам, доля менеджера была строго 0%).
interface RealBlockResult {
  incomeRub: number;
  expenseRub: number;
  profitRub: number;
}

interface RealBuyoutInputs {
  // QuotePaymentAllocation этого просчёта — тот же список, что уже
  // используют sumAlreadyPaidPremium/sumAlreadyPaidProfitRub выше.
  allocations: { category: string; amountRub: unknown }[];
  // Сумма реальных расходных CashOrder этого просчёта по статьям "Закупка
  // товара"/"Доставка по Китаю", уже переведённая в ₽ (см.
  // lib/desk-services/quote-real-financials.ts).
  expenseRub: number;
}

// Приход — те же 4 категории "Счёта на выкуп", что НЕ являются Просчётом
// (goods/china_delivery/buyout_commission/attached_services); search_
// service/custom_production сюда не входят — это отдельный, уже
// самодостаточный (100% маржа, без себестоимости) блок Просчёт, его эта
// функция не трогает.
function computeRealBuyoutProfit(q: RealBuyoutInputs): RealBlockResult {
  const alreadyPaid = sumAlreadyPaidRubByCategory(q.allocations);
  const incomeRub = alreadyPaid.goods + alreadyPaid.chinaDelivery + alreadyPaid.buyoutCommission + alreadyPaid.attachedServices;
  return { incomeRub, expenseRub: q.expenseRub, profitRub: incomeRub - q.expenseRub };
}

interface RealCargoInputs {
  // Сумма реальных приходных CashOrder этого просчёта по статье "Приход
  // карго" (карго и раньше выставлялось отдельным счётом от "Счёта на
  // выкуп" — см. buyout-invoice-calc.ts), уже в ₽.
  incomeRub: number;
  // Сумма реальных расходных CashOrder по статье "Расход по карго", уже в ₽.
  expenseRub: number;
}

function computeRealCargoProfit(q: RealCargoInputs): RealBlockResult {
  return { incomeRub: q.incomeRub, expenseRub: q.expenseRub, profitRub: q.incomeRub - q.expenseRub };
}

interface PlannedBuyoutInputs {
  totalPriceRub: unknown;
  chinaDeliveryRub: unknown;
  buyoutCommissionRub: unknown;
  isCargoOnly: boolean;
}

// План (до статуса "в доставке на склад") — сколько по плану заплатит
// клиент (весь "Счёт на выкуп") минус сколько по плану уйдёт на закупку и
// доставку. Расход по товару/доставке берём как их плановую цену МИНУС
// известную типовую наценку за ¥ (estimatedFxProfitRub, задаётся
// руководителем в Тарифы) — если наценка не задана (0), это то же самое,
// что и раньше: себестоимость по плану = цена по плану (маржа неизвестна
// до реальной закупки). buyoutCommissionRub/attachedServicesTotalRub —
// 100% маржа, без себестоимости, как и в факте. См. PB-V5 chat 2026-08-11.
function computePlannedBuyoutProfit(
  q: PlannedBuyoutInputs,
  attachedServicesTotalRub: number,
  estimatedFxProfitRub: number,
): RealBlockResult {
  if (q.isCargoOnly) return { incomeRub: 0, expenseRub: 0, profitRub: 0 };
  const incomeRub = Number(q.totalPriceRub) + Number(q.chinaDeliveryRub) + Number(q.buyoutCommissionRub) + attachedServicesTotalRub;
  const expenseRub = Number(q.totalPriceRub) + Number(q.chinaDeliveryRub) - estimatedFxProfitRub;
  return { incomeRub, expenseRub, profitRub: incomeRub - expenseRub };
}

interface PlannedCargoInputs {
  cargoDeliveryRub: unknown;
  cargoCostRub: unknown;
}

// План (до статуса "отправлен клиенту") — ставка покупателя (что клиент
// платит за карго) минус ставка закупки (себестоимость, снапшот на
// просчёте — см. Quote.cargoCostRub).
function computePlannedCargoProfit(q: PlannedCargoInputs): RealBlockResult {
  const incomeRub = Number(q.cargoDeliveryRub);
  const expenseRub = Number(q.cargoCostRub);
  return { incomeRub, expenseRub, profitRub: incomeRub - expenseRub };
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

// Splits ONE profit pool (services OR cargo — see computeQuoteShares below,
// the only caller) among percent_of_profit + remainder_share investors,
// after any fixed-$ cuts (flat_per_cargo_kg, or a self-sourced manager's
// flat cargo bonus — cargoDollarCutsRub, 0 for the services pool) have
// already come off the top. Every percent_of_profit investor gets their
// configured rate FLAT off (pool - fixed cuts) — never chained through each
// other or through managerPercentPremiumRub — so several percentage cuts of
// the same pool sum to exactly what they're configured to sum to (e.g.
// manager 10% + investor 10% + remainder 80% = 100% of the pool, not
// 10% + 9% + 81% from each cut compounding into the leftover of the
// previous one). See PB-V5 chat 2026-08-06 — this replaces a real bug
// where every %-based cut chained through the last, silently shorting
// every remainder_share investor.
function distributePoolRub(
  rawPoolRub: number,
  fixedDollarCutsRub: number,
  managerPercentPremiumRub: number,
  percentInvestors: { id: string; ratePercent: number }[],
  remainderInvestorIds: string[],
): { percentSharesById: Map<string, number>; remainderById: Map<string, number> } {
  const poolAfterFixedCuts = Math.max(0, rawPoolRub - fixedDollarCutsRub);
  const percentSharesById = new Map<string, number>();
  let percentSharesSumRub = 0;
  for (const inv of percentInvestors) {
    const shareRub = poolAfterFixedCuts * (inv.ratePercent / 100);
    percentSharesById.set(inv.id, shareRub);
    percentSharesSumRub += shareRub;
  }
  const remainderPoolRub = poolAfterFixedCuts - percentSharesSumRub - managerPercentPremiumRub;
  const perInvestorRub = splitRemainderRub(remainderPoolRub, remainderInvestorIds.length);
  const remainderById = new Map(remainderInvestorIds.map((id) => [id, perInvestorRub]));
  return { percentSharesById, remainderById };
}

interface QuoteShareResult {
  // managerServicesPremiumRub + managerCargoBonusRub — same combined shape
  // every existing caller already expected from factualManagerPremiumRub +
  // a separately-added flatCargoBonusRub.
  managerPremiumRub: number;
  investorSharesById: Map<string, number>;
}

// The one place "who gets how much of this quote" is decided — services
// profit (proscet+buyout+discount+fx) and cargo profit are two completely
// separate pools, each distributed independently via distributePoolRub
// above, then summed per investor:
//
//   Services pool — always active the moment there's any realized (or, pre-
//   confirmation, estimated) services profit. No fixed-$ cuts here; the
//   manager's own premium is itself percent-based (managerServicesPremiumRub,
//   from factualManagerPremiumRub/its estimated equivalent), so it's passed
//   in as managerPercentPremiumRub — treated exactly like another
//   percent_of_profit cut of the SAME base, not chained ahead of one.
//
//   Cargo pool — deliberately NOT distributed at all until cargoRealized
//   (cargoBonusRatePercent locked in at handed_to_client) — a quote can be
//   buyoutFactConfirmed (real goods cost known) while cargo hasn't shipped
//   yet, and that margin isn't real income until it does. Once realized,
//   flat_per_cargo_kg investors (Юра) and a self-sourced manager's flat
//   cargo bonus come off the top FIRST (both are fixed $/kg amounts, not
//   expressible as "% of pool"), and only what's left after those splits
//   among percent_of_profit/remainder_share investors — see PB-V5 chat
//   2026-08-06 for the exact wording this mirrors.
function computeQuoteShares(
  servicesProfitRub: number,
  managerServicesPremiumRub: number,
  cargoRealized: boolean,
  cargoProfitRub: number,
  managerCargoBonusRub: number,
  cargoWeightBasis: { totalWeightKg: unknown; usdRateUsed: unknown },
  investors: InvestorConfig[],
  client: { vladShareRatePercentOverride: unknown },
): QuoteShareResult {
  const percentInvestors = investors
    .filter((inv) => inv.shareType === "percent_of_profit")
    .map((inv) => ({ id: inv.id, ratePercent: effectiveInvestorRatePercent(client, Number(inv.ratePercent ?? 0)) }));
  const remainderInvestorIds = investors.filter((inv) => inv.shareType === "remainder_share").map((inv) => inv.id);

  const investorSharesById = new Map<string, number>();
  const addShare = (id: string, amountRub: number) => investorSharesById.set(id, (investorSharesById.get(id) ?? 0) + amountRub);

  const services = distributePoolRub(servicesProfitRub, 0, managerServicesPremiumRub, percentInvestors, remainderInvestorIds);
  for (const [id, amountRub] of services.percentSharesById) addShare(id, amountRub);
  for (const [id, amountRub] of services.remainderById) addShare(id, amountRub);

  let managerPremiumRub = managerServicesPremiumRub;
  if (cargoRealized) {
    let cargoFixedCutsRub = managerCargoBonusRub;
    for (const inv of investors) {
      if (inv.shareType !== "flat_per_cargo_kg") continue;
      const shareRub = investorCargoShareRub(cargoWeightBasis.totalWeightKg, Number(inv.rateUsdPerKg ?? 0), cargoWeightBasis.usdRateUsed);
      addShare(inv.id, shareRub);
      cargoFixedCutsRub += shareRub;
    }
    const cargo = distributePoolRub(cargoProfitRub, cargoFixedCutsRub, 0, percentInvestors, remainderInvestorIds);
    for (const [id, amountRub] of cargo.percentSharesById) addShare(id, amountRub);
    for (const [id, amountRub] of cargo.remainderById) addShare(id, amountRub);
  }
  managerPremiumRub += managerCargoBonusRub;

  return { managerPremiumRub, investorSharesById };
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
  isPremiumEligiblePaymentCategory,
  sumAlreadyPaidPremium,
  sumAlreadyPaidProfitRub,
  computePaymentAllocationPremiumRub,
  distributePoolRub,
  computeQuoteShares,
  computeRealBuyoutProfit,
  computeRealCargoProfit,
  computePlannedBuyoutProfit,
  computePlannedCargoProfit,
};
export type {
  QuoteProfitFields,
  SourceProfits,
  CnyProfitTiers,
  QuoteShareResult,
  CnyVolumeFields,
  InvestorShareType,
  InvestorConfig,
  ManagerPremiumRates,
  AlreadyPaidPremium,
  RealBlockResult,
  RealBuyoutInputs,
  RealCargoInputs,
  PlannedBuyoutInputs,
  PlannedCargoInputs,
};
