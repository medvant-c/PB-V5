// Pure calculation engine for the "Просчёт" (quote) calculator — no I/O, no
// Prisma, fully unit-testable in isolation. This computes a real number a
// manager reads out to a client, so every intermediate step is a named,
// returned field (not an internal variable that disappears) — the caller
// stores all of them, not just the final total, so a quote stays auditable
// after the fact even if tariffs change later.
//
// Deliberately NOT "server-only" — this same module is imported both by the
// API route (to compute what actually gets saved) and by the quote dialog
// client component (to show a live preview as the manager types), so the
// preview can never drift from what the server will actually compute.

interface DensityTierInput {
  categoryKey: string;
  minDensity: number;
  maxDensity: number | null;
  ratePerKgUsd: number;
}

interface VolumeTierInput {
  categoryKey: string;
  rateUsdPerCbm: number;
}

interface BuyoutCommissionTierInput {
  minAmountRub: number;
  maxAmountRub: number | null;
  commissionPercent: number;
}

type VolumeInputMode = "per_unit_dims" | "total_dims" | "manual_total" | "per_unit_volume";
type DeliveryPricingMode = "density" | "volume";

interface QuoteEngineInputs {
  quantity: number;
  priceCnyPerUnit: number;
  chinaDeliveryCny: number;
  weightPerUnitKg: number;

  volumeInputMode: VolumeInputMode;
  unitLengthCm?: number;
  unitWidthCm?: number;
  unitHeightCm?: number;
  totalLengthCm?: number;
  totalWidthCm?: number;
  totalHeightCm?: number;
  manualTotalVolumeM3?: number;
  unitVolumeM3?: number;

  deliveryPricingMode: DeliveryPricingMode;
  // Required for both modes now — "по объёму" looks up a per-category
  // $/m³ rate (VolumeTariff) the same way "по плотности" looks up a
  // per-category $/kg tier, instead of one flat rate for every category.
  cargoCategoryKey?: string;
  densityTiers: DensityTierInput[];
  volumeTariffs: VolumeTierInput[];

  searchServiceFeeRub: number;
  // Graduated by totalPriceRub (goods cost only, not China delivery) — see
  // BuyoutCommissionTariff in prisma/schema.prisma. Resolved inside
  // computeQuote (totalPriceRub isn't known until then) and echoed back on
  // QuoteEngineOutputs so the caller can snapshot which rate actually
  // applied, same pattern as cargoRateUsd.
  buyoutCommissionTiers: BuyoutCommissionTierInput[];
  cnyRateRub: number;
  usdRateRub: number;
  // Sum of any extra Panda Bridge services (from the price list) attached
  // to this quote — added straight into totalRub. Defaults to 0 so every
  // existing caller keeps working unchanged.
  attachedServicesTotalRub?: number;
  // "Производство под заказ" tier-priced service fee (see
  // TariffSettings.customProduction*Rub) — added straight into totalRub,
  // same shape as attachedServicesTotalRub but kept as its own field so it
  // stays a distinct, labeled line item rather than folding into "доп.
  // услуги". Defaults to 0 (normal off-the-shelf product). See PB-V5 chat
  // 2026-07-29.
  customProductionFeeRub?: number;
  // Manager-entered discount off the computed cargo delivery charge (e.g.
  // for a big client) — a flat USD amount, clamped to [0, raw cargo
  // charge] so it can waive cargo delivery entirely but never make it
  // negative. Defaults to 0 so every existing caller keeps working
  // unchanged.
  cargoDiscountUsd?: number;
  // Below this density (kg/m³), cargo always prices "по объёму" regardless
  // of deliveryPricingMode — owner-editable from Настройки (see
  // SystemSettings.lowDensityVolumeThresholdKgM3 in prisma/schema.prisma).
  // Optional, defaulting to the value that used to be a hardcoded constant
  // here, so a caller that doesn't pass it keeps working unchanged.
  lowDensityVolumeThresholdKgM3?: number;
  // Manager-entered manual $/кг or $/м³ rate — when set, this replaces the
  // DensityTariff/VolumeTariff catalog lookup entirely (a one-off
  // negotiated rate, or a category/density bracket with no catalog entry
  // yet). Still needs deliveryPricingMode/cargoCategoryKey to know which
  // basis (weight vs volume) it multiplies against — this only bypasses
  // the *rate* lookup, not the basis decision. See Quote.cargoRateUsdOverride
  // in prisma/schema.prisma.
  cargoRateUsdOverride?: number;
}

interface QuoteEngineOutputs {
  priceRubPerUnit: number;
  totalPriceCny: number;
  totalPriceRub: number;
  chinaDeliveryRub: number;
  totalWeightKg: number;
  totalVolumeM3: number;
  densityKgM3: number;
  // Which basis the cargo rate actually ended up using — normally mirrors
  // the requested deliveryPricingMode, but density mode falls back to
  // volume below 100 kg/m³ (see computeQuote), so callers must read this
  // rather than trust the input mode when labeling the rate's unit ($/кг
  // vs $/м³).
  cargoPricingBasis: DeliveryPricingMode;
  cargoRateUsd: number;
  // Echoes back the actually-applied discount (after clamping) — the
  // caller persists this, not the raw input, so a typo'd huge discount
  // never silently produces a negative cargo charge.
  cargoDiscountUsd: number;
  cargoDeliveryUsd: number;
  cargoDeliveryRub: number;
  // Which bracket actually matched totalPriceRub — the caller persists
  // this (Quote.buyoutCommissionPercent), not just buyoutCommissionRub, so
  // an edited quote's breakdown still shows the % that was applied even
  // after the tariff table itself changes later.
  buyoutCommissionPercent: number;
  buyoutCommissionRub: number;
  totalRub: number;
}

// Below this density, every category prices the same way as "по объёму"
// (the flat volumeRateUsdPerCbm rate) instead of a category-specific $/kg
// tier — very light, bulky cargo doesn't fit the per-kg tables at all
// (explicit manager instruction, applies uniformly, no per-category
// exception). Fallback default when a caller doesn't pass
// inputs.lowDensityVolumeThresholdKgM3 — see SystemSettings in
// prisma/schema.prisma for the owner-editable version.
const DEFAULT_LOW_DENSITY_VOLUME_THRESHOLD_KG_M3 = 100;

// cm³ → m³. Same /1_000_000 conversion already used in calculators-tab.tsx's
// cargo-by-density calculator — kept consistent rather than reinvented.
function cmToM3(lengthCm: number, widthCm: number, heightCm: number): number {
  return (lengthCm * widthCm * heightCm) / 1_000_000;
}

function computeTotalVolumeM3(inputs: QuoteEngineInputs): number {
  switch (inputs.volumeInputMode) {
    case "per_unit_dims": {
      const { unitLengthCm, unitWidthCm, unitHeightCm, quantity } = inputs;
      if (!unitLengthCm || !unitWidthCm || !unitHeightCm) return 0;
      return cmToM3(unitLengthCm, unitWidthCm, unitHeightCm) * quantity;
    }
    case "total_dims": {
      const { totalLengthCm, totalWidthCm, totalHeightCm } = inputs;
      if (!totalLengthCm || !totalWidthCm || !totalHeightCm) return 0;
      return cmToM3(totalLengthCm, totalWidthCm, totalHeightCm);
    }
    case "manual_total":
      return inputs.manualTotalVolumeM3 ?? 0;
    case "per_unit_volume":
      return (inputs.unitVolumeM3 ?? 0) * inputs.quantity;
  }
}

// Finds the tier whose [minDensity, maxDensity) range contains `density`
// for the given category — maxDensity: null means "no upper bound" (the
// top tier). Returns null if the category has no matching tier at all
// (empty/misconfigured Тарифы table) so the caller can surface a clear
// error instead of silently pricing at $0.
function lookupDensityRate(tiers: DensityTierInput[], categoryKey: string, density: number): number | null {
  const match = tiers.find(
    (tier) =>
      tier.categoryKey === categoryKey &&
      density >= tier.minDensity &&
      (tier.maxDensity === null || density < tier.maxDensity),
  );
  return match?.ratePerKgUsd ?? null;
}

// No density range to match — one rate per category, flat.
function lookupVolumeRate(tariffs: VolumeTierInput[], categoryKey: string): number | null {
  const match = tariffs.find((tariff) => tariff.categoryKey === categoryKey);
  return match?.rateUsdPerCbm ?? null;
}

// Same [min, max) range-matching rule as lookupDensityRate, just keyed by
// amount instead of category+density (there's no category dimension here —
// one bracket ladder for every quote).
function lookupBuyoutCommissionRate(tiers: BuyoutCommissionTierInput[], amountRub: number): number | null {
  const match = tiers.find(
    (tier) => amountRub >= tier.minAmountRub && (tier.maxAmountRub === null || amountRub < tier.maxAmountRub),
  );
  return match?.commissionPercent ?? null;
}

// Throws (rather than returning a partial/zeroed result) on a missing
// density-tariff lookup — a silent $0 cargo rate is a worse failure mode
// than a loud error the manager has to fix before quoting a real client.
function computeQuote(inputs: QuoteEngineInputs): QuoteEngineOutputs {
  // A zero/negative/NaN FX rate silently zeroes out (or NaNs) every ¥- and
  // $-priced field on the quote while leaving it looking superficially
  // saved and valid — this exact failure hit a real client quote (см. PB-V5
  // chat 2026-07-30, просчёт №57: cnyRateUsed ended up 0 with no override
  // set, source never conclusively identified). Loud and immediate beats
  // silently persisting a broken invoice, same reasoning as every other
  // throw in this function.
  if (!Number.isFinite(inputs.cnyRateRub) || inputs.cnyRateRub <= 0) {
    throw new Error("Курс юаня не задан или некорректен — проверьте вкладку «Тарифы» или ручной курс в просчёте.");
  }
  if (!Number.isFinite(inputs.usdRateRub) || inputs.usdRateRub <= 0) {
    throw new Error("Курс доллара не задан или некорректен — проверьте вкладку «Тарифы».");
  }
  const priceRubPerUnit = inputs.priceCnyPerUnit * inputs.cnyRateRub;
  const totalPriceCny = inputs.priceCnyPerUnit * inputs.quantity;
  const totalPriceRub = totalPriceCny * inputs.cnyRateRub;
  const chinaDeliveryRub = inputs.chinaDeliveryCny * inputs.cnyRateRub;

  const totalWeightKg = inputs.weightPerUnitKg * inputs.quantity;
  const totalVolumeM3 = computeTotalVolumeM3(inputs);
  const densityKgM3 = totalVolumeM3 > 0 ? totalWeightKg / totalVolumeM3 : 0;

  // Both branches need a category now — "по объёму" looks up a
  // category-specific $/m³ rate the same way "по плотности" looks up a
  // category-specific $/kg tier (see VolumeTariff in prisma/schema.prisma).
  if (!inputs.cargoCategoryKey) {
    throw new Error("Выберите категорию груза для расчёта доставки.");
  }

  let cargoRateUsd: number;
  let rawCargoDeliveryUsd: number;
  let cargoPricingBasis: DeliveryPricingMode;
  const lowDensityVolumeThresholdKgM3 = inputs.lowDensityVolumeThresholdKgM3 ?? DEFAULT_LOW_DENSITY_VOLUME_THRESHOLD_KG_M3;
  if (inputs.deliveryPricingMode === "density" && densityKgM3 >= lowDensityVolumeThresholdKgM3) {
    cargoPricingBasis = "density";
    // A manual rate bypasses the catalog lookup entirely but not the
    // basis decision above — a one-off negotiated $/кг rate still needs to
    // know it's $/кг, not $/м³. See Quote.cargoRateUsdOverride in
    // prisma/schema.prisma.
    if (inputs.cargoRateUsdOverride !== undefined) {
      cargoRateUsd = inputs.cargoRateUsdOverride;
    } else {
      const rate = lookupDensityRate(inputs.densityTiers, inputs.cargoCategoryKey, densityKgM3);
      if (rate === null) {
        throw new Error(
          `Нет тарифа для категории «${inputs.cargoCategoryKey}» при плотности ${densityKgM3.toFixed(1)} кг/м³ — добавьте тариф во вкладке «Тарифы».`,
        );
      }
      cargoRateUsd = rate;
    }
    rawCargoDeliveryUsd = totalWeightKg * cargoRateUsd;
  } else {
    // Either the manager picked "по объёму" outright, or density mode fell
    // back here because densityKgM3 < 100 — either way, priced by this
    // category's own $/m³ rate now, not one flat rate for everyone.
    cargoPricingBasis = "volume";
    if (inputs.cargoRateUsdOverride !== undefined) {
      cargoRateUsd = inputs.cargoRateUsdOverride;
    } else {
      const rate = lookupVolumeRate(inputs.volumeTariffs, inputs.cargoCategoryKey);
      if (rate === null) {
        throw new Error(
          `Нет тарифа по объёму для категории «${inputs.cargoCategoryKey}» — добавьте тариф во вкладке «Тарифы».`,
        );
      }
      cargoRateUsd = rate;
    }
    rawCargoDeliveryUsd = totalVolumeM3 * cargoRateUsd;
  }
  // Clamped so a mistyped huge discount can waive the charge entirely but
  // never flip it negative.
  const cargoDiscountUsd = Math.min(Math.max(inputs.cargoDiscountUsd ?? 0, 0), rawCargoDeliveryUsd);
  const cargoDeliveryUsd = rawCargoDeliveryUsd - cargoDiscountUsd;
  const cargoDeliveryRub = cargoDeliveryUsd * inputs.usdRateRub;

  // Graduated by totalPriceRub alone (goods cost, not China delivery) —
  // see BuyoutCommissionTariff. Throws rather than silently defaulting to
  // 0%, same "loud error beats a wrong number" rule as the density/volume
  // lookups above.
  const buyoutCommissionPercent = lookupBuyoutCommissionRate(inputs.buyoutCommissionTiers, totalPriceRub);
  if (buyoutCommissionPercent === null) {
    throw new Error(
      `Нет тарифа комиссии за выкуп для суммы закупа ${Math.round(totalPriceRub).toLocaleString("ru-RU")} ₽ — добавьте тариф во вкладке «Тарифы».`,
    );
  }
  const buyoutCommissionRub = (totalPriceRub + chinaDeliveryRub) * (buyoutCommissionPercent / 100);

  // Grand total the client pays: the goods themselves, China-domestic
  // delivery, our search-service fee, the buyout commission, international
  // cargo delivery, производство под заказ (if any), and any extra attached
  // services.
  const totalRub =
    totalPriceRub +
    chinaDeliveryRub +
    inputs.searchServiceFeeRub +
    buyoutCommissionRub +
    cargoDeliveryRub +
    (inputs.customProductionFeeRub ?? 0) +
    (inputs.attachedServicesTotalRub ?? 0);

  return {
    priceRubPerUnit,
    totalPriceCny,
    totalPriceRub,
    chinaDeliveryRub,
    totalWeightKg,
    totalVolumeM3,
    densityKgM3,
    cargoPricingBasis,
    cargoRateUsd,
    cargoDiscountUsd,
    cargoDeliveryUsd,
    cargoDeliveryRub,
    buyoutCommissionPercent,
    buyoutCommissionRub,
    totalRub,
  };
}

interface CargoCostInputs {
  cargoPricingBasis: DeliveryPricingMode;
  // The undiscounted per-unit rate (QuoteEngineOutputs.cargoRateUsd) —
  // cost is computed against the sell rate before any manual discount, so
  // a discount eats into margin rather than silently changing what the
  // delivery "actually cost."
  cargoRateUsd: number;
  totalWeightKg: number;
  totalVolumeM3: number;
  cargoDensityMarginUsdPerKg: number;
  cargoVolumeMarginUsdPerCbm: number;
  usdRateRub: number;
}

interface CargoCostOutputs {
  cargoCostUsd: number;
  cargoCostRub: number;
}

// Deliberately NOT called from quote-dialog.tsx's live preview — the two
// margin inputs are owner-confidential (see TariffSettings in
// prisma/schema.prisma), and GET /api/manager-tariffs never sends them to a
// non-owner session. Only the server routes that already have the current
// TariffSettings row server-side (app/api/manager-quotes) call this.
function computeCargoCost(inputs: CargoCostInputs): CargoCostOutputs {
  const marginUsdPerUnit =
    inputs.cargoPricingBasis === "density" ? inputs.cargoDensityMarginUsdPerKg : inputs.cargoVolumeMarginUsdPerCbm;
  const quantityBasis = inputs.cargoPricingBasis === "density" ? inputs.totalWeightKg : inputs.totalVolumeM3;
  const cargoCostUsd = (inputs.cargoRateUsd - marginUsdPerUnit) * quantityBasis;
  const cargoCostRub = cargoCostUsd * inputs.usdRateRub;
  return { cargoCostUsd, cargoCostRub };
}

// The four ¥→₽ rates the exchange group posts, by minimum ¥ volume — see
// TariffSettings.cnyRateRub/cnyRateRubTier3000/10000/30000 in
// prisma/schema.prisma. `base` (the "от 1000¥" tier) is always required;
// the other three are each independently optional (a manually-edited
// Тарифы save can leave them unset).
interface CnyRateTiers {
  base: number;
  tier3000: number | null;
  tier10000: number | null;
  tier30000: number | null;
}

// Which of the four tiers applies to a ¥ volume — highest qualifying
// tier wins, falling through to the next one down if that tier's rate
// isn't set, and finally to `base` (always available).
function pickCnyRateForTotal(cnyVolume: number, tiers: CnyRateTiers): number {
  if (cnyVolume >= 30000 && tiers.tier30000 !== null) return tiers.tier30000;
  if (cnyVolume >= 10000 && tiers.tier10000 !== null) return tiers.tier10000;
  if (cnyVolume >= 3000 && tiers.tier3000 !== null) return tiers.tier3000;
  return tiers.base;
}

// A NEW quote doesn't know which volume tier it should price at until its
// own ¥ total is known — but that total depends on quantity/price, not on
// the rate itself, so this isn't actually circular for the goods/China-
// delivery part. The one genuine wrinkle is buyoutCommissionRub, which IS
// rate-dependent (it's graduated by totalPriceRub) — resolved with a
// two-pass estimate: compute once at the base (от 1000¥) rate, use THAT
// result to estimate how many ¥ this deal is really worth (goods +
// China delivery, both already ¥, plus every ₽ fee the client pays —
// search/просчёт fee, buyout commission, производство под заказ, attached
// services — converted back to a ¥-equivalent at that same base rate;
// cargo is deliberately excluded, it's priced in USD and has nothing to
// do with ¥ purchasing volume), pick the tier that ¥ total actually lands
// in, then recompute once more at that rate if it differs from the base.
// A boundary-case commission-bracket shift from the ~1-2% difference
// between tiers is accepted as negligible rather than chased with true
// fixed-point iteration. Used for a brand-new quote and by /recalculate;
// an edited quote keeps its already-frozen rate untouched, same as every
// other frozen field on PATCH. See PB-V5 chat 2026-07-31.
function computeQuoteWithAutoCnyTier(
  inputsWithoutRate: Omit<QuoteEngineInputs, "cnyRateRub">,
  tiers: CnyRateTiers,
): { computed: QuoteEngineOutputs; cnyRateRub: number } {
  const provisional = computeQuote({ ...inputsWithoutRate, cnyRateRub: tiers.base });
  const cnyVolume =
    provisional.totalPriceCny +
    inputsWithoutRate.chinaDeliveryCny +
    (inputsWithoutRate.searchServiceFeeRub +
      provisional.buyoutCommissionRub +
      (inputsWithoutRate.customProductionFeeRub ?? 0) +
      (inputsWithoutRate.attachedServicesTotalRub ?? 0)) /
      tiers.base;
  const cnyRateRub = pickCnyRateForTotal(cnyVolume, tiers);
  if (cnyRateRub === tiers.base) return { computed: provisional, cnyRateRub };
  return { computed: computeQuote({ ...inputsWithoutRate, cnyRateRub }), cnyRateRub };
}

export {
  computeQuote,
  computeCargoCost,
  computeQuoteWithAutoCnyTier,
  pickCnyRateForTotal,
  lookupDensityRate,
  lookupVolumeRate,
  lookupBuyoutCommissionRate,
  computeTotalVolumeM3,
  cmToM3,
};
export type {
  QuoteEngineInputs,
  QuoteEngineOutputs,
  DensityTierInput,
  VolumeTierInput,
  BuyoutCommissionTierInput,
  VolumeInputMode,
  DeliveryPricingMode,
  CnyRateTiers,
};
