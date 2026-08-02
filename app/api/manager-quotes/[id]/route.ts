import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { canAccessManagerQuote } from "@/lib/manager-scope";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";
import { computeQuote, computeCargoCost } from "@/lib/quote-engine";
import {
  buildEngineInputs,
  buyoutCommissionTiersForQuote,
  customProductionFeeForTier,
  densityTiersToEngineInput,
  findDensityTierCost,
  findVolumeTariffCost,
  parseAttachedServices,
  parseQuoteFormData,
  stripCargoCostForNonOwner,
  volumeTariffsToEngineInput,
} from "@/lib/desk-services/quote-request";
import { getSystemSettings } from "@/lib/system-settings";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const MAX_PHOTOS = 3;
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export async function GET(req: NextRequest, { params }: RouteParams) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  const { id } = await params;
  const quote = await prisma.quote.findUnique({
    where: { id },
    include: { client: true, manager: { select: { name: true } } },
  });
  if (!quote) {
    return Response.json({ error: "Просчёт не найден." }, { status: 404 });
  }
  if (!(await canAccessManagerQuote(session, quote.managerId))) {
    return Response.json({ error: "Нет доступа к этому просчёту." }, { status: 403 });
  }

  const photos = await prisma.deskFile.findMany({
    where: { tab: "quotes", relatedId: quote.id },
    orderBy: { uploadedAt: "asc" },
  });

  const attachedServices = await prisma.quoteAttachedService.findMany({
    where: { quoteId: quote.id },
    orderBy: { createdAt: "asc" },
  });

  return Response.json({ quote: stripCargoCostForNonOwner(quote, session), photos, attachedServices });
}

// Edits never move money the client was already quoted: FX rates and the
// buyout % stay frozen from the original snapshot. Cargo rate is always
// re-derived against the *current* DensityTariff/VolumeTariff tables (those
// aren't versioned like TariffSettings) for whichever category is selected
// — both density and volume pricing work identically here now. The
// search-service fee is re-priced from the current tariff for whichever
// tier is selected, UNLESS this quote was a free-promo quote
// (searchFeeWaived) — that stays free regardless of edits.
export async function PATCH(req: NextRequest, { params }: RouteParams) {
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

  const [densityTiers, volumeTariffs, systemSettings] = await Promise.all([
    prisma.densityTariff.findMany({ where: { destinationCountry: fields.destinationCountry } }),
    prisma.volumeTariff.findMany({ where: { destinationCountry: fields.destinationCountry } }),
    getSystemSettings(),
  ]);

  // Needed unconditionally now (cargo margin, below), not just for
  // re-pricing the search fee — same "current settings" convention this
  // route already applies to the search fee and (for density mode) the
  // cargo rate itself.
  const tariffSettings = await prisma.tariffSettings.findFirst({ orderBy: { createdAt: "desc" } });
  if (!tariffSettings) {
    return Response.json({ error: "Тарифы не заданы — заполните вкладку «Тарифы»." }, { status: 400 });
  }

  let searchServiceFeeRub = Number(existing.searchServiceFeeRub);
  if (!existing.searchFeeWaived) {
    const feeByType: Record<string, number> = {
      standard: Number(tariffSettings.standardPriceRub),
      expert: Number(tariffSettings.expertPriceRub),
      pro: Number(tariffSettings.proPriceRub),
    };
    searchServiceFeeRub = feeByType[fields.quoteType];
  }

  const attachedServices = parseAttachedServices(formData);
  const attachedServicesTotalRub = attachedServices.reduce((sum, s) => sum + s.priceRub, 0);
  const customProductionFeeRub = customProductionFeeForTier(tariffSettings, fields.quoteType, fields.isCustomProduction);

  const engineInputs = buildEngineInputs(fields, {
    // Frozen unless a manual override is present — same reasoning as the
    // POST route: an override is usable immediately, confirmation only
    // gates the sign-off. No override (same as before) keeps the exact
    // frozen value, never a live tariff lookup — an edit never moves money
    // the client was already quoted.
    cnyRateRub: fields.cnyRateRubOverride ?? Number(existing.cnyRateUsed),
    usdRateRub: Number(existing.usdRateUsed),
    // Frozen, same as cnyRateRub/usdRateRub above — an edit never moves
    // money the client was already quoted (see recalculate/route.ts's
    // comment). A single bracket spanning the whole range reuses the exact
    // same tier-lookup code path in computeQuote while still resolving to
    // this quote's own already-snapshotted %, regardless of how
    // totalPriceRub itself changes from the edit.
    // A manual override (new, changed, or unchanged — the dialog always
    // resends it while set) is usable immediately, same as
    // cargoRateUsdOverride/cnyRateRubOverride above. No override: falls back
    // to this quote's own already-snapshotted % via the same single-bracket
    // trick, never a live tariff lookup — an edit never moves money the
    // client was already quoted.
    buyoutCommissionTiers: buyoutCommissionTiersForQuote(
      fields.buyoutCommissionPercentOverride,
      [{ minAmountRub: 0, maxAmountRub: null, commissionPercent: Number(existing.buyoutCommissionPercent) }],
    ),
    searchServiceFeeRub,
    densityTiers: densityTiersToEngineInput(densityTiers),
    volumeTariffs: volumeTariffsToEngineInput(volumeTariffs),
    lowDensityVolumeThresholdKgM3: Number(systemSettings.lowDensityVolumeThresholdKgM3),
    attachedServicesTotalRub,
    customProductionFeeRub,
  });

  let computed;
  try {
    computed = computeQuote(engineInputs);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось рассчитать просчёт.";
    return Response.json({ error: message }, { status: 400 });
  }

  // A NEW or CHANGED manual cargo rate needs fresh owner/senior sign-off —
  // see Quote.cargoRateOverrideConfirmed in prisma/schema.prisma. Unchanged
  // (including "still unset") carries the existing confirmation state
  // forward untouched, same "edits never silently move already-audited
  // money" principle as the frozen FX/buyout% above.
  const existingCargoRateUsdOverride = existing.cargoRateUsdOverride !== null ? Number(existing.cargoRateUsdOverride) : undefined;
  const cargoRateOverrideChanged = fields.cargoRateUsdOverride !== existingCargoRateUsdOverride;
  const cargoRateOverrideConfirmed = cargoRateOverrideChanged ? false : existing.cargoRateOverrideConfirmed;
  const cargoRateOverrideCostUsd = cargoRateOverrideChanged ? null : existing.cargoRateOverrideCostUsd;
  const cargoRateOverrideConfirmedByManagerId = cargoRateOverrideChanged ? null : existing.cargoRateOverrideConfirmedByManagerId;
  const cargoRateOverrideConfirmedAt = cargoRateOverrideChanged ? null : existing.cargoRateOverrideConfirmedAt;
  const confirmedCargoCostUsd =
    cargoRateOverrideConfirmed && cargoRateOverrideCostUsd !== null ? Number(cargoRateOverrideCostUsd) : null;

  // Same reset-on-change rule as cargoRateUsdOverride above, for the
  // manual ¥→₽ rate — see Quote.cnyRateOverrideConfirmed in
  // prisma/schema.prisma.
  const existingCnyRateRubOverride = existing.cnyRateRubOverride !== null ? Number(existing.cnyRateRubOverride) : undefined;
  const cnyRateOverrideChanged = fields.cnyRateRubOverride !== existingCnyRateRubOverride;
  const cnyRateOverrideConfirmed = cnyRateOverrideChanged ? false : existing.cnyRateOverrideConfirmed;
  const cnyRateOverrideConfirmedByManagerId = cnyRateOverrideChanged ? null : existing.cnyRateOverrideConfirmedByManagerId;
  const cnyRateOverrideConfirmedAt = cnyRateOverrideChanged ? null : existing.cnyRateOverrideConfirmedAt;

  // Same reset-on-change rule again, for the manual buyout-commission % —
  // see Quote.buyoutCommissionOverrideConfirmed in prisma/schema.prisma.
  const existingBuyoutCommissionPercentOverride =
    existing.buyoutCommissionPercentOverride !== null ? Number(existing.buyoutCommissionPercentOverride) : undefined;
  const buyoutCommissionOverrideChanged = fields.buyoutCommissionPercentOverride !== existingBuyoutCommissionPercentOverride;
  const buyoutCommissionOverrideConfirmed = buyoutCommissionOverrideChanged ? false : existing.buyoutCommissionOverrideConfirmed;
  const buyoutCommissionOverrideConfirmedByManagerId = buyoutCommissionOverrideChanged
    ? null
    : existing.buyoutCommissionOverrideConfirmedByManagerId;
  const buyoutCommissionOverrideConfirmedAt = buyoutCommissionOverrideChanged ? null : existing.buyoutCommissionOverrideConfirmedAt;

  // Same per-category cost lookup as the POST route — see its comment. A
  // confirmed manual rate's real supplier cost (confirmedCargoCostUsd)
  // wins over the catalog lookup — that's the whole point of the
  // confirmation step (see PB-V5 chat 2026-07-30).
  const cargoCategoryKey = fields.cargoCategoryKey;
  const densityMarginForThisQuote =
    computed.cargoPricingBasis === "density"
      ? (() => {
          if (confirmedCargoCostUsd !== null) return computed.cargoRateUsd - confirmedCargoCostUsd;
          const cost = cargoCategoryKey ? findDensityTierCost(densityTiers, cargoCategoryKey, computed.densityKgM3) : null;
          return cost !== null ? computed.cargoRateUsd - cost : Number(tariffSettings.cargoDensityMarginUsdPerKg);
        })()
      : Number(tariffSettings.cargoDensityMarginUsdPerKg);
  const volumeMarginForThisQuote =
    computed.cargoPricingBasis === "volume"
      ? (() => {
          if (confirmedCargoCostUsd !== null) return computed.cargoRateUsd - confirmedCargoCostUsd;
          const cost = cargoCategoryKey ? findVolumeTariffCost(volumeTariffs, cargoCategoryKey) : null;
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
      quoteType: fields.quoteType,
      searchServiceFeeRub,
      isCustomProduction: fields.isCustomProduction,
      customProductionFeeRub,
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
      totalVolumeM3: computed.totalVolumeM3,
      densityKgM3: computed.densityKgM3,
      destinationCountry: fields.destinationCountry,
      deliveryPricingMode: fields.deliveryPricingMode,
      // Required for both modes now — see the POST route's comment.
      cargoCategoryKey,
      cargoRateUsd: computed.cargoRateUsd,
      cargoRateUsdOverride: fields.cargoRateUsdOverride ?? null,
      cargoRateOverrideConfirmed,
      cargoRateOverrideCostUsd,
      cargoRateOverrideConfirmedByManagerId,
      cargoRateOverrideConfirmedAt,
      cargoDiscountUsd: computed.cargoDiscountUsd,
      cargoDeliveryUsd: computed.cargoDeliveryUsd,
      cargoDeliveryRub: computed.cargoDeliveryRub,
      cargoCostUsd: cargoCost.cargoCostUsd,
      cargoCostRub: cargoCost.cargoCostRub,
      // Not persisted before this field existed (harmless then — frozen
      // buyout% never actually changed on a plain edit) but a manual
      // override now genuinely can change it, so this has to move with
      // buyoutCommissionRub below rather than staying implicitly unchanged.
      buyoutCommissionPercent: computed.buyoutCommissionPercent,
      buyoutCommissionRub: computed.buyoutCommissionRub,
      buyoutCommissionPercentOverride: fields.buyoutCommissionPercentOverride ?? null,
      buyoutCommissionOverrideConfirmed,
      buyoutCommissionOverrideConfirmedByManagerId,
      buyoutCommissionOverrideConfirmedAt,
      totalRub: computed.totalRub,
      cnyRateUsed: engineInputs.cnyRateRub,
      cnyRateRubOverride: fields.cnyRateRubOverride ?? null,
      cnyRateOverrideConfirmed,
      cnyRateOverrideConfirmedByManagerId,
      cnyRateOverrideConfirmedAt,
    },
  });

  // Full replace, not a diff — the dialog always resends the complete
  // current set of attached services, same as every other quote field.
  await prisma.quoteAttachedService.deleteMany({ where: { quoteId: id } });
  if (attachedServices.length > 0) {
    await prisma.quoteAttachedService.createMany({
      data: attachedServices.map((s) => ({
        quoteId: id,
        serviceCatalogItemId: s.serviceCatalogItemId,
        name: s.name,
        priceRub: s.priceRub,
      })),
    });
  }

  // Existing photos the manager removed in the edit dialog — verified to
  // actually belong to this quote before deleting, not trusted blindly.
  const removePhotoIds = (formData.get("removePhotoIds") as string | null)?.split(",").filter(Boolean) ?? [];
  if (removePhotoIds.length > 0) {
    const toRemove = await prisma.deskFile.findMany({
      where: { id: { in: removePhotoIds }, tab: "quotes", relatedId: id },
    });
    for (const photo of toRemove) {
      try {
        await storage.delete(photo.storageKey);
      } catch (error) {
        console.error("Manager quote edit: photo cleanup failed", error);
      }
    }
    await prisma.deskFile.deleteMany({ where: { id: { in: toRemove.map((p) => p.id) } } });
  }

  // New photos — same best-effort upload as POST, capped so kept+new never
  // exceeds MAX_PHOTOS.
  const remainingSlots = MAX_PHOTOS - (await prisma.deskFile.count({ where: { tab: "quotes", relatedId: id } }));
  let uploaded = 0;
  for (let i = 0; i < MAX_PHOTOS && uploaded < remainingSlots; i++) {
    const photo = formData.get(`photo${i}`);
    if (!(photo instanceof File)) continue;
    if (!SUPPORTED_IMAGE_TYPES.has(photo.type) || photo.size > MAX_PHOTO_BYTES) continue;
    try {
      const buffer = Buffer.from(await photo.arrayBuffer());
      const stored = await storage.upload(buffer, photo.name);
      await prisma.deskFile.create({
        data: {
          tab: "quotes",
          relatedId: id,
          storageKey: stored.key,
          originalName: photo.name,
          mimeType: photo.type,
          size: stored.size,
        },
      });
      uploaded++;
    } catch (error) {
      console.error("Manager quote edit: photo upload failed", error);
    }
  }

  return Response.json({ quote: stripCargoCostForNonOwner(quote, session) });
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
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

  const photos = await prisma.deskFile.findMany({ where: { tab: "quotes", relatedId: id } });
  for (const photo of photos) {
    try {
      await storage.delete(photo.storageKey);
    } catch (error) {
      console.error("Manager quote delete: photo cleanup failed", error);
    }
  }
  await prisma.deskFile.deleteMany({ where: { tab: "quotes", relatedId: id } });
  await prisma.quote.delete({ where: { id } });

  return Response.json({ ok: true });
}
