import "server-only";
import { prisma } from "@/lib/prisma";
import { parseLocaleNumber } from "@/lib/number";
import type { ManagerSession } from "@/lib/manager-auth";
import type {
  DensityTierInput,
  VolumeTierInput,
  BuyoutCommissionTierInput,
  QuoteEngineInputs,
  QuoteEngineOutputs,
} from "@/lib/quote-engine";
import { DESTINATION_COUNTRIES, type DestinationCountry } from "@/lib/destination-countries";

// cargoCostUsd/cargoCostRub are owner-confidential (see Quote in
// prisma/schema.prisma) — every route that returns a Quote row to the
// client (list, detail, create, edit) must strip them for anyone but the
// owner. Centralized here since `prisma.quote.findMany`/`findUnique` never
// use a `select`, so every field rides along by default unless explicitly
// removed.
function stripCargoCostForNonOwner<T extends { cargoCostUsd: unknown; cargoCostRub: unknown }>(
  quote: T,
  session: ManagerSession,
): T | Omit<T, "cargoCostUsd" | "cargoCostRub"> {
  if (session.role === "owner") return quote;
  const { cargoCostUsd, cargoCostRub, ...rest } = quote;
  void cargoCostUsd;
  void cargoCostRub;
  return rest;
}

// Shared FormData parsing + validation for both creating (POST) and editing
// (PATCH) a quote — the two routes accept the exact same field set, so
// duplicating this a third time was the wrong call.

function requiredString(value: FormDataEntryValue | null): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function requiredNumber(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const num = parseLocaleNumber(value);
  return Number.isFinite(num) ? num : null;
}

function optionalNumber(value: FormDataEntryValue | null): number | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const num = parseLocaleNumber(value);
  return Number.isFinite(num) ? num : undefined;
}

interface ParsedQuoteFields {
  clientId: string;
  // Chosen at the very first step of the form — decides which
  // DensityTariff/VolumeTariff rows the route is even allowed to look a
  // rate up from (see manager-quotes POST/PATCH/recalculate). See
  // DestinationCountry in prisma/schema.prisma, PB-V5 chat 2026-08-02.
  destinationCountry: DestinationCountry;
  quoteType: "standard" | "expert" | "pro";
  productName: string;
  productLink: string | null;
  productDescription: string | null;
  color: string | null;
  dimensions: string | null;
  quantity: number;
  priceCnyPerUnit: number;
  chinaDeliveryCny: number;
  weightPerUnitKg: number;
  volumeInputMode: "per_unit_dims" | "total_dims" | "manual_total" | "per_unit_volume";
  unitLengthCm?: number;
  unitWidthCm?: number;
  unitHeightCm?: number;
  totalLengthCm?: number;
  totalWidthCm?: number;
  totalHeightCm?: number;
  manualTotalVolumeM3?: number;
  unitVolumeM3?: number;
  deliveryPricingMode: "density" | "volume";
  cargoCategoryKey?: string;
  cargoDiscountUsd?: number;
  // Manual $/кг or $/м³ rate — see Quote.cargoRateUsdOverride in
  // prisma/schema.prisma. undefined = no override, normal catalog lookup.
  cargoRateUsdOverride?: number;
  // Manual ¥→₽ rate for a special case — see Quote.cnyRateRubOverride in
  // prisma/schema.prisma. undefined = no override, normal TariffSettings
  // rate. Not part of QuoteRates/buildEngineInputs below: the route itself
  // resolves the final cnyRateRub to pass the engine (override ?? tariff
  // rate), same as it already resolves cnyRateRub from either
  // TariffSettings or a frozen snapshot depending on create vs edit.
  cnyRateRubOverride?: number;
  // Manual $→₽ rate for a special case — see Quote.usdRateRubOverride in
  // prisma/schema.prisma. undefined = no override, normal TariffSettings
  // rate (create) or frozen snapshot (edit). Same "not part of
  // QuoteRates/buildEngineInputs below" split as cnyRateRubOverride — the
  // route itself resolves the final usdRateRub to pass the engine.
  usdRateRubOverride?: number;
  // Manual commission-% override for the buyout — see
  // Quote.buyoutCommissionPercentOverride in prisma/schema.prisma. undefined
  // = no override, normal BuyoutCommissionTariff bracket lookup. Same
  // "not part of QuoteRates/buildEngineInputs" split as cnyRateRubOverride
  // above — the route resolves the final buyoutCommissionTiers to pass the
  // engine via buyoutCommissionTiersForQuote below.
  buyoutCommissionPercentOverride?: number;
  // "Производство под заказ" — see Quote.isCustomProduction in
  // prisma/schema.prisma. The route (not this parser) looks up the actual
  // fee from TariffSettings once this is known, same pattern as
  // searchServiceFeeRub.
  isCustomProduction: boolean;
  // "Только карго" — see Quote.isCargoOnly in prisma/schema.prisma.
  isCargoOnly: boolean;
}

function parseQuoteFormData(formData: FormData): { fields: ParsedQuoteFields } | { error: string } {
  const clientId = requiredString(formData.get("clientId"));
  const quoteType = requiredString(formData.get("quoteType"));
  const productDescription = requiredString(formData.get("productDescription"));
  // Description is the only truly required field now — a draft quote
  // ("менеджер получил только описание от клиента, без названия и цифр от
  // поставщика") must be saveable with nothing else filled in. productName
  // falls back to a truncated productDescription instead of blocking
  // creation. See PB-V5 chat 2026-07-29.
  const productName = requiredString(formData.get("productName")) ?? productDescription?.slice(0, 60) ?? null;
  const quantity = requiredNumber(formData.get("quantity"));
  const priceCnyPerUnit = requiredNumber(formData.get("priceCnyPerUnit"));
  const weightPerUnitKg = requiredNumber(formData.get("weightPerUnitKg"));
  const volumeInputMode = requiredString(formData.get("volumeInputMode"));
  const deliveryPricingMode = requiredString(formData.get("deliveryPricingMode"));
  const destinationCountryRaw = requiredString(formData.get("destinationCountry"));
  const destinationCountry = DESTINATION_COUNTRIES.some((c) => c.value === destinationCountryRaw)
    ? (destinationCountryRaw as DestinationCountry)
    : "russia";
  // "Только карго" (see Quote.isCargoOnly) — the client never pays for the
  // goods themselves, so the manager may legitimately not know/care about
  // a ¥ price at all; required for every other quote type since a blank
  // price there would silently zero out a real charge. See PB-V5 chat
  // 2026-08-06.
  const isCargoOnly = formData.get("isCargoOnly") === "true";

  if (!clientId) return { error: "Не выбран клиент." };
  if (quoteType !== "standard" && quoteType !== "expert" && quoteType !== "pro") {
    return { error: "Выберите тип просчёта." };
  }
  if (!productDescription) return { error: "Укажите описание товара." };
  // Unreachable in practice (productName always derives from
  // productDescription above once that check passes) — kept only so
  // TypeScript narrows productName to `string` below.
  if (!productName) return { error: "Укажите описание товара." };
  if (quantity === null || quantity <= 0) return { error: "Укажите количество." };
  if (isCargoOnly ? priceCnyPerUnit !== null && priceCnyPerUnit < 0 : priceCnyPerUnit === null || priceCnyPerUnit < 0) {
    return { error: "Укажите цену за единицу в юанях." };
  }
  if (weightPerUnitKg === null || weightPerUnitKg <= 0) {
    return { error: "Укажите вес за 1 шт." };
  }
  if (
    volumeInputMode !== "per_unit_dims" &&
    volumeInputMode !== "total_dims" &&
    volumeInputMode !== "manual_total" &&
    volumeInputMode !== "per_unit_volume"
  ) {
    return { error: "Некорректный способ расчёта объёма." };
  }
  if (deliveryPricingMode !== "density" && deliveryPricingMode !== "volume") {
    return { error: "Некорректный способ тарификации доставки." };
  }

  return {
    fields: {
      clientId,
      destinationCountry,
      quoteType,
      productName,
      productLink: requiredString(formData.get("productLink")),
      productDescription,
      color: requiredString(formData.get("color")),
      dimensions: requiredString(formData.get("dimensions")),
      quantity,
      // isCargoOnly can leave this blank (see the isCargoOnly check above) —
      // defaults to 0 rather than staying null, since ParsedQuoteFields
      // requires a real number for the engine to compute totalPriceCny/Rub
      // from (harmlessly 0, since a cargo-only quote never bills it anyway).
      priceCnyPerUnit: priceCnyPerUnit ?? 0,
      chinaDeliveryCny: optionalNumber(formData.get("chinaDeliveryCny")) ?? 0,
      weightPerUnitKg,
      volumeInputMode,
      unitLengthCm: optionalNumber(formData.get("unitLengthCm")),
      unitWidthCm: optionalNumber(formData.get("unitWidthCm")),
      unitHeightCm: optionalNumber(formData.get("unitHeightCm")),
      totalLengthCm: optionalNumber(formData.get("totalLengthCm")),
      totalWidthCm: optionalNumber(formData.get("totalWidthCm")),
      totalHeightCm: optionalNumber(formData.get("totalHeightCm")),
      manualTotalVolumeM3: optionalNumber(formData.get("manualTotalVolumeM3")),
      unitVolumeM3: optionalNumber(formData.get("unitVolumeM3")),
      deliveryPricingMode,
      cargoCategoryKey: requiredString(formData.get("cargoCategoryKey")) ?? undefined,
      cargoDiscountUsd: optionalNumber(formData.get("cargoDiscountUsd")),
      cargoRateUsdOverride: optionalNumber(formData.get("cargoRateUsdOverride")),
      cnyRateRubOverride: optionalNumber(formData.get("cnyRateRubOverride")),
      usdRateRubOverride: optionalNumber(formData.get("usdRateRubOverride")),
      buyoutCommissionPercentOverride: optionalNumber(formData.get("buyoutCommissionPercentOverride")),
      isCustomProduction: formData.get("isCustomProduction") === "true",
      isCargoOnly: formData.get("isCargoOnly") === "true",
    },
  };
}

interface QuoteRates {
  cnyRateRub: number;
  usdRateRub: number;
  buyoutCommissionTiers: BuyoutCommissionTierInput[];
  searchServiceFeeRub: number;
  densityTiers: DensityTierInput[];
  volumeTariffs: VolumeTierInput[];
  attachedServicesTotalRub?: number;
  // Looked up by the route from TariffSettings.customProduction*Rub based
  // on the quote's tier — 0/undefined when fields.isCustomProduction is
  // false. See Quote.customProductionFeeRub in prisma/schema.prisma.
  customProductionFeeRub?: number;
  // From SystemSettings.lowDensityVolumeThresholdKgM3 — see
  // QuoteEngineInputs.lowDensityVolumeThresholdKgM3 in lib/quote-engine.ts.
  lowDensityVolumeThresholdKgM3?: number;
}

function buildEngineInputs(fields: ParsedQuoteFields, rates: QuoteRates): QuoteEngineInputs {
  return {
    quantity: fields.quantity,
    priceCnyPerUnit: fields.priceCnyPerUnit,
    chinaDeliveryCny: fields.chinaDeliveryCny,
    weightPerUnitKg: fields.weightPerUnitKg,
    volumeInputMode: fields.volumeInputMode,
    unitLengthCm: fields.unitLengthCm,
    unitWidthCm: fields.unitWidthCm,
    unitHeightCm: fields.unitHeightCm,
    totalLengthCm: fields.totalLengthCm,
    totalWidthCm: fields.totalWidthCm,
    totalHeightCm: fields.totalHeightCm,
    manualTotalVolumeM3: fields.manualTotalVolumeM3,
    unitVolumeM3: fields.unitVolumeM3,
    deliveryPricingMode: fields.deliveryPricingMode,
    cargoCategoryKey: fields.cargoCategoryKey,
    cargoDiscountUsd: fields.cargoDiscountUsd,
    cargoRateUsdOverride: fields.cargoRateUsdOverride,
    isCargoOnly: fields.isCargoOnly,
    densityTiers: rates.densityTiers,
    volumeTariffs: rates.volumeTariffs,
    searchServiceFeeRub: rates.searchServiceFeeRub,
    buyoutCommissionTiers: rates.buyoutCommissionTiers,
    cnyRateRub: rates.cnyRateRub,
    usdRateRub: rates.usdRateRub,
    attachedServicesTotalRub: rates.attachedServicesTotalRub,
    customProductionFeeRub: rates.customProductionFeeRub,
    lowDensityVolumeThresholdKgM3: rates.lowDensityVolumeThresholdKgM3,
  };
}

// Shared by every route that needs the actual ₽ fee for a given tier when
// isCustomProduction is true — 0 otherwise. Kept here (not duplicated per
// route) since quote-type/route.ts, recalculate/route.ts, and the create/
// edit routes all need the exact same lookup.
function customProductionFeeForTier(
  tariffSettings: { customProductionStandardRub: unknown; customProductionExpertRub: unknown; customProductionProRub: unknown },
  quoteType: string,
  isCustomProduction: boolean,
): number {
  if (!isCustomProduction) return 0;
  return (
    {
      standard: Number(tariffSettings.customProductionStandardRub),
      expert: Number(tariffSettings.customProductionExpertRub),
      pro: Number(tariffSettings.customProductionProRub),
    }[quoteType] ?? 0
  );
}

interface AttachedServiceInput {
  serviceCatalogItemId?: string;
  name: string;
  priceRub: number;
}

// Parses the `services` FormData field (a JSON-encoded array) sent by
// quote-dialog.tsx — validated defensively since it's free-form JSON from
// the client, not typed form fields like the rest of parseQuoteFormData.
function parseAttachedServices(formData: FormData): AttachedServiceInput[] {
  const raw = formData.get("services");
  if (typeof raw !== "string" || !raw.trim()) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter(
      (item): item is { serviceCatalogItemId?: unknown; name?: unknown; priceRub?: unknown } =>
        typeof item === "object" && item !== null,
    )
    .map((item) => ({
      serviceCatalogItemId: typeof item.serviceCatalogItemId === "string" ? item.serviceCatalogItemId : undefined,
      name: typeof item.name === "string" ? item.name.trim() : "",
      priceRub: Number(item.priceRub),
    }))
    .filter((item) => item.name && Number.isFinite(item.priceRub) && item.priceRub >= 0);
}

// A client's first N Standard-tier quotes are free (search-service fee
// waived) — a promo, not a discount, so it's flagged separately
// (Quote.searchFeeWaived) rather than just landing on a 0 fee that would be
// indistinguishable from a manual override. Decided once at creation; never
// re-evaluated on edit (see lib/desk-services/quote-request.ts callers). N
// is owner-editable from Настройки (SystemSettings.freeStandardQuoteLimit)
// — the caller fetches it and passes it in; DEFAULT_FREE_STANDARD_QUOTE_LIMIT
// only covers a caller that doesn't.
const DEFAULT_FREE_STANDARD_QUOTE_LIMIT = 3;

async function isFreeStandardQuoteEligible(clientId: string, limit: number = DEFAULT_FREE_STANDARD_QUOTE_LIMIT): Promise<boolean> {
  const priorStandardCount = await prisma.quote.count({ where: { clientId, quoteType: "standard" } });
  return priorStandardCount < limit;
}

function densityTiersToEngineInput(
  tiers: { categoryKey: string; minDensity: unknown; maxDensity: unknown; ratePerKgUsd: unknown }[],
): DensityTierInput[] {
  return tiers.map((tier) => ({
    categoryKey: tier.categoryKey,
    minDensity: Number(tier.minDensity),
    maxDensity: tier.maxDensity === null ? null : Number(tier.maxDensity),
    ratePerKgUsd: Number(tier.ratePerKgUsd),
  }));
}

function volumeTariffsToEngineInput(tariffs: { categoryKey: string; rateUsdPerCbm: unknown }[]): VolumeTierInput[] {
  return tariffs.map((tariff) => ({
    categoryKey: tariff.categoryKey,
    rateUsdPerCbm: Number(tariff.rateUsdPerCbm),
  }));
}

function buyoutCommissionTariffsToEngineInput(
  tiers: { minAmountRub: unknown; maxAmountRub: unknown; commissionPercent: unknown }[],
): BuyoutCommissionTierInput[] {
  return tiers.map((tier) => ({
    minAmountRub: Number(tier.minAmountRub),
    maxAmountRub: tier.maxAmountRub === null ? null : Number(tier.maxAmountRub),
    commissionPercent: Number(tier.commissionPercent),
  }));
}

// A manual commission override collapses the whole bracket ladder into a
// single flat rate spanning every amount — the same "one bracket spanning
// the whole range" trick the PATCH route already used to freeze
// buyoutCommissionPercent on an edit, just generalized so every route that
// builds buyoutCommissionTiers (POST, PATCH, recalculate) shares one
// implementation instead of three copies. undefined = no override, pass
// the real tier ladder through unchanged.
function buyoutCommissionTiersForQuote(
  overridePercent: number | undefined,
  liveTiers: BuyoutCommissionTierInput[],
): BuyoutCommissionTierInput[] {
  if (overridePercent === undefined) return liveTiers;
  return [{ minAmountRub: 0, maxAmountRub: null, commissionPercent: overridePercent }];
}

// Same category-matching rule as lookupVolumeRate in lib/quote-engine.ts,
// but returns costUsdPerCbm instead — server-only for the same
// confidentiality reason as findDensityTierCost below.
function findVolumeTariffCost(tariffs: { categoryKey: string; costUsdPerCbm: unknown }[], categoryKey: string): number | null {
  const match = tariffs.find((tariff) => tariff.categoryKey === categoryKey);
  return match ? Number(match.costUsdPerCbm) : null;
}

// Same tier-matching rule as lookupDensityRate in lib/quote-engine.ts, but
// returns costPerKgUsd instead of ratePerKgUsd — kept as a separate,
// server-only function (this file already has "server-only" at the top)
// rather than generalizing lookupDensityRate itself, since that one is
// also imported by quote-dialog.tsx's client-side preview and cost must
// never reach the client (it's owner-confidential).
function findDensityTierCost(
  tiers: { categoryKey: string; minDensity: unknown; maxDensity: unknown; costPerKgUsd: unknown }[],
  categoryKey: string,
  density: number,
): number | null {
  const match = tiers.find(
    (tier) =>
      tier.categoryKey === categoryKey &&
      density >= Number(tier.minDensity) &&
      (tier.maxDensity === null || density < Number(tier.maxDensity)),
  );
  return match ? Number(match.costPerKgUsd) : null;
}

// Fields to null out when a buyout-fact confirmation is reverted — shared
// by the status-change route (moving a quote's status back out of the
// post-buyout set) and the confirmations-archive revert endpoint (owner/
// senior manually undoing a mistaken confirmation, so it can be redone
// with corrected numbers via the normal pending-queue form instead of a
// separate edit UI — see PB-V5 chat 2026-07-30). Does NOT delete the
// linked CashOrder itself — callers do that separately since it needs its
// own existence check immediately before the delete.
const BUYOUT_REVERT_DATA = {
  actualBuyoutCny: null,
  actualBuyoutRateUsed: null,
  actualSupplierDiscountCny: null,
  buyoutFactConfirmed: false,
  buyoutConfirmedByManagerId: null,
  buyoutConfirmedAt: null,
  buyoutPremiumRatePercent: null,
  buyoutSelfSourcedBoost: null,
  actualClientPaymentRub: null,
  actualClientPaymentRateUsed: null,
  clientPaymentCashOrderId: null,
} as const;

export {
  parseQuoteFormData,
  buildEngineInputs,
  isFreeStandardQuoteEligible,
  densityTiersToEngineInput,
  volumeTariffsToEngineInput,
  buyoutCommissionTariffsToEngineInput,
  buyoutCommissionTiersForQuote,
  BUYOUT_REVERT_DATA,
  findDensityTierCost,
  findVolumeTariffCost,
  parseAttachedServices,
  stripCargoCostForNonOwner,
  customProductionFeeForTier,
};
export type { ParsedQuoteFields, QuoteRates, QuoteEngineOutputs, AttachedServiceInput };
