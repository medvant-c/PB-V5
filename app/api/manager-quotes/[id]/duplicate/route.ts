import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { canAccessManagerQuote } from "@/lib/manager-scope";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";
import { nextQuoteDisplayId } from "@/lib/display-ids";
import { stripCargoCostForNonOwner } from "@/lib/desk-services/quote-request";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// Full copy of an existing quote — same client, same manager, every priced
// field carried over as-is (not re-derived from current tariffs; use
// /recalculate afterwards for that). Photos are physically copied to a new
// storage key each (not just a new DeskFile row pointing at the same key) —
// deleting either quote later calls storage.delete() on its own photos
// unconditionally, so sharing a key would let deleting one quote silently
// break the other's photo.
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

  const [attachedServices, photos] = await Promise.all([
    prisma.quoteAttachedService.findMany({ where: { quoteId: id } }),
    prisma.deskFile.findMany({ where: { tab: "quotes", relatedId: id } }),
  ]);

  const duplicate = await prisma.quote.create({
    data: {
      displayId: await nextQuoteDisplayId(),
      clientId: existing.clientId,
      managerId: existing.managerId,
      quoteType: existing.quoteType,
      searchServiceFeeRub: existing.searchServiceFeeRub,
      searchFeeWaived: existing.searchFeeWaived,
      isCustomProduction: existing.isCustomProduction,
      customProductionFeeRub: existing.customProductionFeeRub,
      productName: `${existing.productName} (копия)`,
      productLink: existing.productLink,
      productDescription: existing.productDescription,
      color: existing.color,
      dimensions: existing.dimensions,
      quantity: existing.quantity,
      priceCnyPerUnit: existing.priceCnyPerUnit,
      priceRubPerUnit: existing.priceRubPerUnit,
      totalPriceCny: existing.totalPriceCny,
      totalPriceRub: existing.totalPriceRub,
      chinaDeliveryCny: existing.chinaDeliveryCny,
      chinaDeliveryRub: existing.chinaDeliveryRub,
      weightPerUnitKg: existing.weightPerUnitKg,
      totalWeightKg: existing.totalWeightKg,
      volumeInputMode: existing.volumeInputMode,
      unitLengthCm: existing.unitLengthCm,
      unitWidthCm: existing.unitWidthCm,
      unitHeightCm: existing.unitHeightCm,
      totalLengthCm: existing.totalLengthCm,
      totalWidthCm: existing.totalWidthCm,
      totalHeightCm: existing.totalHeightCm,
      totalVolumeM3: existing.totalVolumeM3,
      densityKgM3: existing.densityKgM3,
      deliveryPricingMode: existing.deliveryPricingMode,
      cargoCategoryKey: existing.cargoCategoryKey,
      cargoRateUsd: existing.cargoRateUsd,
      // Value carried over (so the manager doesn't retype it), but
      // confirmation always resets — a duplicate is its own document and
      // needs its own proof screenshot, even if the rate itself started
      // the same. See Quote.cargoRateOverrideConfirmed in
      // prisma/schema.prisma.
      cargoRateUsdOverride: existing.cargoRateUsdOverride,
      cargoDiscountUsd: existing.cargoDiscountUsd,
      cargoDeliveryUsd: existing.cargoDeliveryUsd,
      cargoDeliveryRub: existing.cargoDeliveryRub,
      cargoCostUsd: existing.cargoCostUsd,
      cargoCostRub: existing.cargoCostRub,
      buyoutCommissionPercent: existing.buyoutCommissionPercent,
      buyoutCommissionRub: existing.buyoutCommissionRub,
      totalRub: existing.totalRub,
      cnyRateUsed: existing.cnyRateUsed,
      usdRateUsed: existing.usdRateUsed,
      // Same "value carried over, confirmation always resets" reasoning as
      // cargoRateUsdOverride above.
      cnyRateRubOverride: existing.cnyRateRubOverride,
    },
  });

  if (attachedServices.length > 0) {
    await prisma.quoteAttachedService.createMany({
      data: attachedServices.map((s) => ({
        quoteId: duplicate.id,
        serviceCatalogItemId: s.serviceCatalogItemId,
        name: s.name,
        priceRub: s.priceRub,
      })),
    });
  }

  for (const photo of photos) {
    try {
      const buffer = await storage.get(photo.storageKey);
      const stored = await storage.upload(buffer, photo.originalName);
      await prisma.deskFile.create({
        data: {
          tab: "quotes",
          relatedId: duplicate.id,
          storageKey: stored.key,
          originalName: photo.originalName,
          mimeType: photo.mimeType,
          size: stored.size,
        },
      });
    } catch (error) {
      console.error("Manager quote duplicate: photo copy failed", error);
    }
  }

  return Response.json({ quote: stripCargoCostForNonOwner(duplicate, session) }, { status: 201 });
}
