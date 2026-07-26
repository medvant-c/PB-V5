import "server-only";
import { prisma } from "@/lib/prisma";
import type { ManagerSession } from "@/lib/manager-auth";
import type { DensityTierInput, VolumeTierInput, QuoteEngineInputs, QuoteEngineOutputs } from "@/lib/quote-engine";

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
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function optionalNumber(value: FormDataEntryValue | null): number | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
}

interface ParsedQuoteFields {
  clientId: string;
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
  volumeInputMode: "per_unit_dims" | "total_dims" | "manual_total";
  unitLengthCm?: number;
  unitWidthCm?: number;
  unitHeightCm?: number;
  totalLengthCm?: number;
  totalWidthCm?: number;
  totalHeightCm?: number;
  manualTotalVolumeM3?: number;
  deliveryPricingMode: "density" | "volume";
  cargoCategoryKey?: string;
  cargoDiscountUsd?: number;
}

function parseQuoteFormData(formData: FormData): { fields: ParsedQuoteFields } | { error: string } {
  const clientId = requiredString(formData.get("clientId"));
  const quoteType = requiredString(formData.get("quoteType"));
  const productName = requiredString(formData.get("productName"));
  const quantity = requiredNumber(formData.get("quantity"));
  const priceCnyPerUnit = requiredNumber(formData.get("priceCnyPerUnit"));
  const weightPerUnitKg = requiredNumber(formData.get("weightPerUnitKg"));
  const volumeInputMode = requiredString(formData.get("volumeInputMode"));
  const deliveryPricingMode = requiredString(formData.get("deliveryPricingMode"));

  if (!clientId) return { error: "Не выбран клиент." };
  if (quoteType !== "standard" && quoteType !== "expert" && quoteType !== "pro") {
    return { error: "Выберите тип просчёта." };
  }
  if (!productName) return { error: "Укажите название товара." };
  if (quantity === null || quantity <= 0) return { error: "Укажите количество." };
  if (priceCnyPerUnit === null || priceCnyPerUnit < 0) {
    return { error: "Укажите цену за единицу в юанях." };
  }
  if (weightPerUnitKg === null || weightPerUnitKg <= 0) {
    return { error: "Укажите вес за 1 шт." };
  }
  if (volumeInputMode !== "per_unit_dims" && volumeInputMode !== "total_dims" && volumeInputMode !== "manual_total") {
    return { error: "Некорректный способ расчёта объёма." };
  }
  if (deliveryPricingMode !== "density" && deliveryPricingMode !== "volume") {
    return { error: "Некорректный способ тарификации доставки." };
  }

  return {
    fields: {
      clientId,
      quoteType,
      productName,
      productLink: requiredString(formData.get("productLink")),
      productDescription: requiredString(formData.get("productDescription")),
      color: requiredString(formData.get("color")),
      dimensions: requiredString(formData.get("dimensions")),
      quantity,
      priceCnyPerUnit,
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
      deliveryPricingMode,
      cargoCategoryKey: requiredString(formData.get("cargoCategoryKey")) ?? undefined,
      cargoDiscountUsd: optionalNumber(formData.get("cargoDiscountUsd")),
    },
  };
}

interface QuoteRates {
  cnyRateRub: number;
  usdRateRub: number;
  buyoutCommissionPercent: number;
  searchServiceFeeRub: number;
  densityTiers: DensityTierInput[];
  volumeTariffs: VolumeTierInput[];
  attachedServicesTotalRub?: number;
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
    deliveryPricingMode: fields.deliveryPricingMode,
    cargoCategoryKey: fields.cargoCategoryKey,
    cargoDiscountUsd: fields.cargoDiscountUsd,
    densityTiers: rates.densityTiers,
    volumeTariffs: rates.volumeTariffs,
    searchServiceFeeRub: rates.searchServiceFeeRub,
    buyoutCommissionPercent: rates.buyoutCommissionPercent,
    cnyRateRub: rates.cnyRateRub,
    usdRateRub: rates.usdRateRub,
    attachedServicesTotalRub: rates.attachedServicesTotalRub,
  };
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

// A client's first 3 Standard-tier quotes are free (search-service fee
// waived) — a promo, not a discount, so it's flagged separately
// (Quote.searchFeeWaived) rather than just landing on a 0 fee that would be
// indistinguishable from a manual override. Decided once at creation; never
// re-evaluated on edit (see lib/desk-services/quote-request.ts callers).
const FREE_STANDARD_QUOTE_LIMIT = 3;

async function isFreeStandardQuoteEligible(clientId: string): Promise<boolean> {
  const priorStandardCount = await prisma.quote.count({ where: { clientId, quoteType: "standard" } });
  return priorStandardCount < FREE_STANDARD_QUOTE_LIMIT;
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

export {
  parseQuoteFormData,
  buildEngineInputs,
  isFreeStandardQuoteEligible,
  densityTiersToEngineInput,
  volumeTariffsToEngineInput,
  findDensityTierCost,
  findVolumeTariffCost,
  parseAttachedServices,
  stripCargoCostForNonOwner,
  FREE_STANDARD_QUOTE_LIMIT,
};
export type { ParsedQuoteFields, QuoteRates, QuoteEngineOutputs, AttachedServiceInput };
