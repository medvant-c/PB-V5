import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { canAccessManagerQuote } from "@/lib/manager-scope";
import { prisma } from "@/lib/prisma";
import { computeQuote, computeCargoCost, type QuoteEngineInputs } from "@/lib/quote-engine";
import {
  buyoutCommissionTariffsToEngineInput,
  customProductionFeeForTier,
  densityTiersToEngineInput,
  findDensityTierCost,
  findVolumeTariffCost,
  stripCargoCostForNonOwner,
  volumeTariffsToEngineInput,
} from "@/lib/desk-services/quote-request";
import { getSystemSettings } from "@/lib/system-settings";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// Unlike PATCH (which freezes FX/buyout%/volume-rate — "edits never move
// money the client was already quoted"), this deliberately re-prices the
// quote against *today's* tariffs end to end: FX rates, buyout %, search
// fee, and every cargo rate. The quote's own product/shipment inputs
// (quantity, price, weight, dims, mode, category, discount) and its
// attached services stay exactly as entered — only the tariff-driven
// numbers move.
export async function POST(req: NextRequest, { params }: RouteParams) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  const { id } = await params;
  const existing = await prisma.quote.findUnique({ where: { id } });
  if (!existing) return Response.json({ error: "Просчёт не найден." }, { status: 404 });
  if (!(await canAccessManagerQuote(session, existing.managerId))) {
    return Response.json({ error: "Нет доступа к этому просчёту." }, { status: 403 });
  }

  const tariffSettings = await prisma.tariffSettings.findFirst({ orderBy: { createdAt: "desc" } });
  if (!tariffSettings) {
    return Response.json({ error: "Тарифы не заданы — заполните вкладку «Тарифы»." }, { status: 400 });
  }
  const [densityTiers, volumeTariffs, buyoutCommissionTiers, systemSettings] = await Promise.all([
    prisma.densityTariff.findMany(),
    prisma.volumeTariff.findMany(),
    prisma.buyoutCommissionTariff.findMany(),
    getSystemSettings(),
  ]);

  const searchServiceFeeRub = existing.searchFeeWaived
    ? 0
    : ({
        standard: Number(tariffSettings.standardPriceRub),
        expert: Number(tariffSettings.expertPriceRub),
        pro: Number(tariffSettings.proPriceRub),
      }[existing.quoteType] ?? 0);
  const customProductionFeeRub = customProductionFeeForTier(tariffSettings, existing.quoteType, existing.isCustomProduction);

  const attachedServices = await prisma.quoteAttachedService.findMany({ where: { quoteId: id } });
  const attachedServicesTotalRub = attachedServices.reduce((sum, s) => sum + Number(s.priceRub), 0);

  const engineInputs: QuoteEngineInputs = {
    quantity: existing.quantity,
    priceCnyPerUnit: Number(existing.priceCnyPerUnit),
    chinaDeliveryCny: Number(existing.chinaDeliveryCny),
    weightPerUnitKg: Number(existing.weightPerUnitKg),
    volumeInputMode: existing.volumeInputMode,
    unitLengthCm: existing.unitLengthCm !== null ? Number(existing.unitLengthCm) : undefined,
    unitWidthCm: existing.unitWidthCm !== null ? Number(existing.unitWidthCm) : undefined,
    unitHeightCm: existing.unitHeightCm !== null ? Number(existing.unitHeightCm) : undefined,
    totalLengthCm: existing.totalLengthCm !== null ? Number(existing.totalLengthCm) : undefined,
    totalWidthCm: existing.totalWidthCm !== null ? Number(existing.totalWidthCm) : undefined,
    totalHeightCm: existing.totalHeightCm !== null ? Number(existing.totalHeightCm) : undefined,
    manualTotalVolumeM3: existing.volumeInputMode === "manual_total" ? Number(existing.totalVolumeM3) : undefined,
    deliveryPricingMode: existing.deliveryPricingMode,
    cargoCategoryKey: existing.cargoCategoryKey ?? undefined,
    densityTiers: densityTiersToEngineInput(densityTiers),
    // Live, not reused — the whole point of this route is to price off
    // today's rate, not whatever was frozen at creation.
    volumeTariffs: volumeTariffsToEngineInput(volumeTariffs),
    searchServiceFeeRub,
    buyoutCommissionTiers: buyoutCommissionTariffsToEngineInput(buyoutCommissionTiers),
    cnyRateRub: Number(tariffSettings.cnyRateRub),
    usdRateRub: Number(tariffSettings.usdRateRub),
    lowDensityVolumeThresholdKgM3: Number(systemSettings.lowDensityVolumeThresholdKgM3),
    attachedServicesTotalRub,
    customProductionFeeRub,
    cargoDiscountUsd: Number(existing.cargoDiscountUsd),
  };

  let computed;
  try {
    computed = computeQuote(engineInputs);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось пересчитать просчёт.";
    return Response.json({ error: message }, { status: 400 });
  }

  const densityMarginForThisQuote =
    computed.cargoPricingBasis === "density" && existing.cargoCategoryKey
      ? (() => {
          const cost = findDensityTierCost(densityTiers, existing.cargoCategoryKey!, computed.densityKgM3);
          return cost !== null ? computed.cargoRateUsd - cost : Number(tariffSettings.cargoDensityMarginUsdPerKg);
        })()
      : Number(tariffSettings.cargoDensityMarginUsdPerKg);
  const volumeMarginForThisQuote =
    computed.cargoPricingBasis === "volume" && existing.cargoCategoryKey
      ? (() => {
          const cost = findVolumeTariffCost(volumeTariffs, existing.cargoCategoryKey!);
          return cost !== null ? computed.cargoRateUsd - cost : Number(tariffSettings.cargoVolumeMarginUsdPerCbm);
        })()
      : Number(tariffSettings.cargoVolumeMarginUsdPerCbm);

  const cargoCost = computeCargoCost({
    cargoPricingBasis: computed.cargoPricingBasis,
    cargoRateUsd: computed.cargoRateUsd,
    totalWeightKg: computed.totalWeightKg,
    totalVolumeM3: computed.totalVolumeM3,
    cargoDensityMarginUsdPerKg: densityMarginForThisQuote,
    cargoVolumeMarginUsdPerCbm: volumeMarginForThisQuote,
    usdRateRub: engineInputs.usdRateRub,
  });

  const quote = await prisma.quote.update({
    where: { id },
    data: {
      searchServiceFeeRub,
      customProductionFeeRub,
      priceRubPerUnit: computed.priceRubPerUnit,
      totalPriceCny: computed.totalPriceCny,
      totalPriceRub: computed.totalPriceRub,
      chinaDeliveryRub: computed.chinaDeliveryRub,
      totalWeightKg: computed.totalWeightKg,
      totalVolumeM3: computed.totalVolumeM3,
      densityKgM3: computed.densityKgM3,
      cargoRateUsd: computed.cargoRateUsd,
      cargoDiscountUsd: computed.cargoDiscountUsd,
      cargoDeliveryUsd: computed.cargoDeliveryUsd,
      cargoDeliveryRub: computed.cargoDeliveryRub,
      cargoCostUsd: cargoCost.cargoCostUsd,
      cargoCostRub: cargoCost.cargoCostRub,
      buyoutCommissionPercent: computed.buyoutCommissionPercent,
      buyoutCommissionRub: computed.buyoutCommissionRub,
      totalRub: computed.totalRub,
      cnyRateUsed: engineInputs.cnyRateRub,
      usdRateUsed: engineInputs.usdRateRub,
    },
  });

  return Response.json({ quote: stripCargoCostForNonOwner(quote, session) });
}
