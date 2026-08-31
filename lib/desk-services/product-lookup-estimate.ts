import "server-only";
import { prisma } from "@/lib/prisma";
import {
  computeQuoteWithAutoCnyTier,
  type QuoteEngineInputs,
  type QuoteEngineOutputs,
  type CnyRateTiers,
} from "@/lib/quote-engine";
import type { DestinationCountry } from "@/lib/destination-countries";

// Общий расчёт для вкладки «Автопоиск товаров» — переиспользует ровно те
// же формулы и тарифы, что настоящий просчёт (lib/quote-engine.ts), просто
// без создания записи Quote в базе (см. план «Автопоиск товаров», PB-V5
// chat 2026-08-31 — Quote требует 24 обязательных поля + реального
// клиента, не подходит для одноразовой прикидки). Используется и
// /api/product-lookup/calculate (превью), и /api/product-lookup/export-pdf
// (финальный файл) — формула считается ровно в одном месте.

interface ProductLookupInput {
  destinationCountry: DestinationCountry;
  quoteType: "standard" | "expert" | "pro";
  quantity: number;
  priceCnyPerUnit: number;
  chinaDeliveryCny: number;
  weightPerUnitKg: number;
  unitLengthCm: number;
  unitWidthCm: number;
  unitHeightCm: number;
  deliveryPricingMode: "density" | "volume";
  cargoCategoryKey: string;
}

interface ProductLookupResult {
  computed: QuoteEngineOutputs;
  cnyRateUsed: number;
  usdRateUsed: number;
  searchServiceFeeRub: number;
}

async function computeProductLookupEstimate(input: ProductLookupInput): Promise<ProductLookupResult> {
  const [tariffSettings, densityTariffs, volumeTariffs, buyoutCommissionTariffs] = await Promise.all([
    prisma.tariffSettings.findFirst({ orderBy: { createdAt: "desc" } }),
    prisma.densityTariff.findMany({ where: { destinationCountry: input.destinationCountry } }),
    prisma.volumeTariff.findMany({ where: { destinationCountry: input.destinationCountry } }),
    prisma.buyoutCommissionTariff.findMany({ orderBy: { minAmountRub: "asc" } }),
  ]);
  if (!tariffSettings) {
    throw new Error("Тарифы ещё не заданы в системе — заполните вкладку «Тарифы».");
  }

  const searchServiceFeeRub =
    input.quoteType === "standard"
      ? Number(tariffSettings.standardPriceRub)
      : input.quoteType === "expert"
        ? Number(tariffSettings.expertPriceRub)
        : Number(tariffSettings.proPriceRub);

  const cnyTiers: CnyRateTiers = {
    base: Number(tariffSettings.cnyRateRub),
    tier3000: tariffSettings.cnyRateRubTier3000 !== null ? Number(tariffSettings.cnyRateRubTier3000) : null,
    tier10000: tariffSettings.cnyRateRubTier10000 !== null ? Number(tariffSettings.cnyRateRubTier10000) : null,
    tier30000: tariffSettings.cnyRateRubTier30000 !== null ? Number(tariffSettings.cnyRateRubTier30000) : null,
  };

  const engineInputs: Omit<QuoteEngineInputs, "cnyRateRub"> = {
    quantity: input.quantity,
    priceCnyPerUnit: input.priceCnyPerUnit,
    chinaDeliveryCny: input.chinaDeliveryCny,
    weightPerUnitKg: input.weightPerUnitKg,
    volumeInputMode: "per_unit_dims",
    unitLengthCm: input.unitLengthCm,
    unitWidthCm: input.unitWidthCm,
    unitHeightCm: input.unitHeightCm,
    deliveryPricingMode: input.deliveryPricingMode,
    cargoCategoryKey: input.cargoCategoryKey,
    densityTiers: densityTariffs.map((t) => ({
      categoryKey: t.categoryKey,
      minDensity: Number(t.minDensity),
      maxDensity: t.maxDensity !== null ? Number(t.maxDensity) : null,
      ratePerKgUsd: Number(t.ratePerKgUsd),
    })),
    volumeTariffs: volumeTariffs.map((t) => ({
      categoryKey: t.categoryKey,
      rateUsdPerCbm: Number(t.rateUsdPerCbm),
    })),
    searchServiceFeeRub,
    buyoutCommissionTiers: buyoutCommissionTariffs.map((t) => ({
      minAmountRub: Number(t.minAmountRub),
      maxAmountRub: t.maxAmountRub !== null ? Number(t.maxAmountRub) : null,
      commissionPercent: Number(t.commissionPercent),
    })),
    usdRateRub: Number(tariffSettings.usdRateRub),
  };

  const { computed, cnyRateRub } = computeQuoteWithAutoCnyTier(engineInputs, cnyTiers);

  return {
    computed,
    cnyRateUsed: cnyRateRub,
    usdRateUsed: Number(tariffSettings.usdRateRub),
    searchServiceFeeRub,
  };
}

export { computeProductLookupEstimate };
export type { ProductLookupInput, ProductLookupResult };
