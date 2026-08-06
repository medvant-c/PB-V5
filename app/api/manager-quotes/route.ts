import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { getVisibleManagerIds } from "@/lib/manager-scope";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";
import { nextQuoteDisplayId } from "@/lib/display-ids";
import { getSystemSettings } from "@/lib/system-settings";
import { computeQuote, computeCargoCost, computeQuoteWithAutoCnyTier, type CnyRateTiers } from "@/lib/quote-engine";
import {
  buildEngineInputs,
  buyoutCommissionTariffsToEngineInput,
  buyoutCommissionTiersForQuote,
  customProductionFeeForTier,
  densityTiersToEngineInput,
  findDensityTierCost,
  findVolumeTariffCost,
  isFreeStandardQuoteEligible,
  parseAttachedServices,
  parseQuoteFormData,
  stripCargoCostForNonOwner,
  volumeTariffsToEngineInput,
} from "@/lib/desk-services/quote-request";

const MAX_PHOTOS = 3;
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

// Scoped the same way as GET /api/manager-clients — a plain manager only
// sees their own quotes, a senior manager also sees their attached
// managers' quotes, the owner sees everyone's.
export async function GET(req: NextRequest) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  const visibleManagerIds = await getVisibleManagerIds(session);
  const clientId = req.nextUrl.searchParams.get("clientId");

  const quotes = await prisma.quote.findMany({
    where: {
      deletedAt: null,
      ...(clientId ? { clientId } : {}),
      ...(visibleManagerIds === "all" ? {} : { managerId: { in: visibleManagerIds } }),
    },
    orderBy: { createdAt: "desc" },
    include: {
      manager: { select: { id: true, name: true } },
      client: { select: { id: true, name: true, company: true } },
      // Sum of prior "Приходный ордер" partial payments already sitting in
      // the cash ledger for this quote — the client card's "Подтвердить
      // факт" mini-form shows this so the amount typed for "оплата от
      // клиента" isn't accidentally double-counted against those already-
      // recorded orders (confirm-buyout/route.ts itself now nets this out
      // server-side either way, this is just visibility). See PB-V5 chat
      // 2026-08-05.
      paymentAllocations: { select: { amountRub: true } },
    },
  });

  // First photo per quote, for a small thumbnail in the list — one batch
  // query instead of N, then picking the earliest-uploaded row per quote.
  const photos = await prisma.deskFile.findMany({
    where: { tab: "quotes", relatedId: { in: quotes.map((q) => q.id) } },
    orderBy: { uploadedAt: "asc" },
    select: { id: true, relatedId: true },
  });
  const firstPhotoByQuoteId = new Map<string, string>();
  for (const photo of photos) {
    if (photo.relatedId && !firstPhotoByQuoteId.has(photo.relatedId)) {
      firstPhotoByQuoteId.set(photo.relatedId, photo.id);
    }
  }
  const quotesWithPhoto = quotes.map((q) => ({
    ...stripCargoCostForNonOwner(q, session),
    firstPhotoId: firstPhotoByQuoteId.get(q.id) ?? null,
  }));

  return Response.json({ quotes: quotesWithPhoto });
}

export async function POST(req: NextRequest) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return Response.json({ error: "Некорректный запрос." }, { status: 400 });
  }

  const parsed = parseQuoteFormData(formData);
  if ("error" in parsed) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }
  const { fields } = parsed;

  const client = await prisma.client.findUnique({ where: { id: fields.clientId } });
  if (!client) return Response.json({ error: "Клиент не найден." }, { status: 404 });

  const visibleManagerIds = await getVisibleManagerIds(session);
  if (
    visibleManagerIds !== "all" &&
    (!client.createdByManagerId || !visibleManagerIds.includes(client.createdByManagerId))
  ) {
    return Response.json({ error: "Этот клиент вне вашей зоны видимости." }, { status: 403 });
  }

  const tariffSettings = await prisma.tariffSettings.findFirst({ orderBy: { createdAt: "desc" } });
  if (!tariffSettings) {
    return Response.json({ error: "Тарифы не заданы — заполните вкладку «Тарифы»." }, { status: 400 });
  }

  const [densityTiers, volumeTariffs, buyoutCommissionTiers, systemSettings] = await Promise.all([
    prisma.densityTariff.findMany({ where: { destinationCountry: fields.destinationCountry } }),
    prisma.volumeTariff.findMany({ where: { destinationCountry: fields.destinationCountry } }),
    prisma.buyoutCommissionTariff.findMany(),
    getSystemSettings(),
  ]);

  const searchServiceFeeByType: Record<string, number> = {
    standard: Number(tariffSettings.standardPriceRub),
    expert: Number(tariffSettings.expertPriceRub),
    pro: Number(tariffSettings.proPriceRub),
  };

  const searchFeeWaived =
    fields.quoteType === "standard" &&
    (await isFreeStandardQuoteEligible(fields.clientId, systemSettings.freeStandardQuoteLimit));
  const attachedServices = parseAttachedServices(formData);
  const attachedServicesTotalRub = attachedServices.reduce((sum, s) => sum + s.priceRub, 0);
  const customProductionFeeRub = customProductionFeeForTier(tariffSettings, fields.quoteType, fields.isCustomProduction);

  // A manual override is usable immediately, same as cargoRateUsdOverride
  // below — confirmation only gates the sign-off, not the price itself.
  // Without one, a new quote doesn't just take today's flat cnyRateRub —
  // it picks whichever of the four volume tiers its own ¥ total actually
  // falls into (see computeQuoteWithAutoCnyTier in lib/quote-engine.ts).
  const cnyTiers: CnyRateTiers = {
    base: Number(tariffSettings.cnyRateRub),
    tier3000: tariffSettings.cnyRateRubTier3000 !== null ? Number(tariffSettings.cnyRateRubTier3000) : null,
    tier10000: tariffSettings.cnyRateRubTier10000 !== null ? Number(tariffSettings.cnyRateRubTier10000) : null,
    tier30000: tariffSettings.cnyRateRubTier30000 !== null ? Number(tariffSettings.cnyRateRubTier30000) : null,
  };

  const engineInputs = buildEngineInputs(fields, {
    cnyRateRub: fields.cnyRateRubOverride ?? cnyTiers.base,
    // A manual override is usable immediately, same as cnyRateRubOverride
    // above — confirmation only gates the sign-off.
    usdRateRub: fields.usdRateRubOverride ?? Number(tariffSettings.usdRateRub),
    // A manual override collapses today's live bracket ladder into one flat
    // rate — same "usable immediately, confirmation only gates the sign-off"
    // rule as cnyRateRubOverride/cargoRateUsdOverride. See
    // Quote.buyoutCommissionPercentOverride in prisma/schema.prisma.
    buyoutCommissionTiers: buyoutCommissionTiersForQuote(
      fields.buyoutCommissionPercentOverride,
      buyoutCommissionTariffsToEngineInput(buyoutCommissionTiers),
    ),
    searchServiceFeeRub: searchFeeWaived ? 0 : searchServiceFeeByType[fields.quoteType],
    densityTiers: densityTiersToEngineInput(densityTiers),
    volumeTariffs: volumeTariffsToEngineInput(volumeTariffs),
    lowDensityVolumeThresholdKgM3: Number(systemSettings.lowDensityVolumeThresholdKgM3),
    attachedServicesTotalRub,
    customProductionFeeRub,
  });

  let computed;
  let resolvedCnyRateRub: number;
  try {
    if (fields.cnyRateRubOverride !== undefined) {
      resolvedCnyRateRub = fields.cnyRateRubOverride;
      computed = computeQuote(engineInputs);
    } else {
      const { cnyRateRub: _placeholder, ...inputsWithoutRate } = engineInputs;
      void _placeholder;
      const result = computeQuoteWithAutoCnyTier(inputsWithoutRate, cnyTiers);
      computed = result.computed;
      resolvedCnyRateRub = result.cnyRateRub;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось рассчитать просчёт.";
    return Response.json({ error: message }, { status: 400 });
  }

  // Cost varies per category now (the owner edits it per row in Тарифы),
  // for both density tiers and volume tariffs — look up the specific
  // row this quote actually matched and derive an equivalent margin from
  // it (cargoRateUsd - that row's cost). Falls back to the global default
  // only if the row can't be found (shouldn't happen — computeQuote just
  // matched the exact same tiers/tariffs to get cargoRateUsd in the first
  // place).
  const cargoCategoryKey = fields.cargoCategoryKey;
  const densityMarginForThisQuote =
    computed.cargoPricingBasis === "density" && cargoCategoryKey
      ? (() => {
          const cost = findDensityTierCost(densityTiers, cargoCategoryKey, computed.densityKgM3);
          return cost !== null ? computed.cargoRateUsd - cost : Number(tariffSettings.cargoDensityMarginUsdPerKg);
        })()
      : Number(tariffSettings.cargoDensityMarginUsdPerKg);
  const volumeMarginForThisQuote =
    computed.cargoPricingBasis === "volume" && cargoCategoryKey
      ? (() => {
          const cost = findVolumeTariffCost(volumeTariffs, cargoCategoryKey);
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

  const quote = await prisma.quote.create({
    data: {
      displayId: await nextQuoteDisplayId(),
      clientId: fields.clientId,
      managerId: session.managerId,
      quoteType: fields.quoteType,
      searchServiceFeeRub: engineInputs.searchServiceFeeRub,
      searchFeeWaived,
      isCustomProduction: fields.isCustomProduction,
      customProductionFeeRub,
      isCargoOnly: fields.isCargoOnly,
      productName: fields.productName,
      productLink: fields.productLink,
      productDescription: fields.productDescription,
      color: fields.color,
      dimensions: fields.dimensions,
      quantity: fields.quantity,
      priceCnyPerUnit: fields.priceCnyPerUnit,
      priceRubPerUnit: computed.priceRubPerUnit,
      totalPriceCny: computed.totalPriceCny,
      totalPriceRub: computed.totalPriceRub,
      chinaDeliveryCny: engineInputs.chinaDeliveryCny,
      chinaDeliveryRub: computed.chinaDeliveryRub,
      weightPerUnitKg: fields.weightPerUnitKg,
      totalWeightKg: computed.totalWeightKg,
      volumeInputMode: fields.volumeInputMode,
      unitLengthCm: engineInputs.unitLengthCm,
      unitWidthCm: engineInputs.unitWidthCm,
      unitHeightCm: engineInputs.unitHeightCm,
      totalLengthCm: engineInputs.totalLengthCm,
      totalWidthCm: engineInputs.totalWidthCm,
      totalHeightCm: engineInputs.totalHeightCm,
      unitVolumeM3: engineInputs.unitVolumeM3,
      totalVolumeM3: computed.totalVolumeM3,
      densityKgM3: computed.densityKgM3,
      destinationCountry: fields.destinationCountry,
      deliveryPricingMode: fields.deliveryPricingMode,
      // Now required for both modes — "по объёму" prices per category too
      // (see VolumeTariff), not just "по плотности".
      cargoCategoryKey,
      cargoRateUsd: computed.cargoRateUsd,
      // A manual rate always starts unconfirmed — see
      // Quote.cargoRateOverrideConfirmed in prisma/schema.prisma, needs
      // owner/senior sign-off with the real supplier cost before it's
      // trusted for profit accounting.
      cargoRateUsdOverride: fields.cargoRateUsdOverride ?? null,
      cargoDiscountUsd: computed.cargoDiscountUsd,
      cargoDeliveryUsd: computed.cargoDeliveryUsd,
      cargoDeliveryRub: computed.cargoDeliveryRub,
      cargoCostUsd: cargoCost.cargoCostUsd,
      cargoCostRub: cargoCost.cargoCostRub,
      buyoutCommissionPercent: computed.buyoutCommissionPercent,
      buyoutCommissionRub: computed.buyoutCommissionRub,
      // A manual rate always starts unconfirmed — see
      // Quote.buyoutCommissionOverrideConfirmed in prisma/schema.prisma.
      buyoutCommissionPercentOverride: fields.buyoutCommissionPercentOverride ?? null,
      totalRub: computed.totalRub,
      cnyRateUsed: resolvedCnyRateRub,
      usdRateUsed: engineInputs.usdRateRub,
      // A manual rate always starts unconfirmed — see
      // Quote.cnyRateOverrideConfirmed in prisma/schema.prisma.
      cnyRateRubOverride: fields.cnyRateRubOverride ?? null,
      // A manual rate always starts unconfirmed — see
      // Quote.usdRateOverrideConfirmed in prisma/schema.prisma.
      usdRateRubOverride: fields.usdRateRubOverride ?? null,
    },
  });

  if (attachedServices.length > 0) {
    await prisma.quoteAttachedService.createMany({
      data: attachedServices.map((s) => ({
        quoteId: quote.id,
        serviceCatalogItemId: s.serviceCatalogItemId,
        name: s.name,
        priceRub: s.priceRub,
      })),
    });
  }

  // Photos are best-effort — a photo failing to save shouldn't lose the
  // (already-computed, already-saved) quote itself.
  for (let i = 0; i < MAX_PHOTOS; i++) {
    const photo = formData.get(`photo${i}`);
    if (!(photo instanceof File)) continue;
    if (!SUPPORTED_IMAGE_TYPES.has(photo.type) || photo.size > MAX_PHOTO_BYTES) continue;
    try {
      const buffer = Buffer.from(await photo.arrayBuffer());
      const stored = await storage.upload(buffer, photo.name);
      await prisma.deskFile.create({
        data: {
          tab: "quotes",
          relatedId: quote.id,
          storageKey: stored.key,
          originalName: photo.name,
          mimeType: photo.type,
          size: stored.size,
        },
      });
    } catch (error) {
      console.error("Manager quote: photo upload failed", error);
    }
  }

  return Response.json({ quote: stripCargoCostForNonOwner(quote, session) }, { status: 201 });
}
