import { NextRequest } from "next/server";
import { getClientIdFromRequest } from "@/lib/client-auth";
import { prisma } from "@/lib/prisma";

// Client-facing, read-only list of the logged-in client's own quotes — no
// productLink, no manager/tariff/cost fields, nothing editable. Mirrors
// exactly what the client-facing PDF already shows (lib/desk-services/
// quote-pdf.tsx), just as JSON for the in-portal view.
export async function GET(req: NextRequest) {
  const clientId = await getClientIdFromRequest(req);
  if (!clientId) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  // Explicit select instead of a bare findMany (which pulled every one of
  // Quote's ~100 columns, most of them internal-only — manager rates,
  // overrides, cargo cost, etc. never even reach the mapped response
  // below) — same "only fetch what this view renders" fix as the manager
  // list route. See PB-V5 chat 2026-08-10.
  const quotes = await prisma.quote.findMany({
    where: { clientId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      displayId: true,
      status: true,
      quoteType: true,
      productName: true,
      productDescription: true,
      color: true,
      dimensions: true,
      quantity: true,
      priceCnyPerUnit: true,
      totalPriceCny: true,
      priceRubPerUnit: true,
      totalPriceRub: true,
      chinaDeliveryRub: true,
      totalWeightKg: true,
      totalVolumeM3: true,
      densityKgM3: true,
      cargoDeliveryUsd: true,
      cargoDeliveryRub: true,
      searchServiceFeeRub: true,
      searchFeeWaived: true,
      isCustomProduction: true,
      customProductionFeeRub: true,
      buyoutCommissionPercent: true,
      buyoutCommissionRub: true,
      totalRub: true,
      cnyRateUsed: true,
      usdRateUsed: true,
      clientComment: true,
      managerComment: true,
      createdAt: true,
    },
  });

  const [photos, attachedServices] = await Promise.all([
    prisma.deskFile.findMany({
      where: { tab: "quotes", relatedId: { in: quotes.map((q) => q.id) } },
      orderBy: { uploadedAt: "asc" },
      select: { id: true, relatedId: true },
    }),
    prisma.quoteAttachedService.findMany({
      where: { quoteId: { in: quotes.map((q) => q.id) } },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const photoIdsByQuoteId = new Map<string, string[]>();
  for (const photo of photos) {
    if (!photo.relatedId) continue;
    const list = photoIdsByQuoteId.get(photo.relatedId) ?? [];
    list.push(photo.id);
    photoIdsByQuoteId.set(photo.relatedId, list);
  }
  const servicesByQuoteId = new Map<string, { name: string; priceRub: number }[]>();
  for (const service of attachedServices) {
    const list = servicesByQuoteId.get(service.quoteId) ?? [];
    list.push({ name: service.name, priceRub: Number(service.priceRub) });
    servicesByQuoteId.set(service.quoteId, list);
  }

  return Response.json({
    quotes: quotes.map((q) => ({
      id: q.id,
      displayId: q.displayId,
      status: q.status,
      quoteType: q.quoteType,
      productName: q.productName,
      productDescription: q.productDescription,
      color: q.color,
      dimensions: q.dimensions,
      quantity: q.quantity,
      priceCnyPerUnit: Number(q.priceCnyPerUnit),
      totalPriceCny: Number(q.totalPriceCny),
      priceRubPerUnit: Number(q.priceRubPerUnit),
      totalPriceRub: Number(q.totalPriceRub),
      chinaDeliveryRub: Number(q.chinaDeliveryRub),
      totalWeightKg: Number(q.totalWeightKg),
      totalVolumeM3: Number(q.totalVolumeM3),
      densityKgM3: Number(q.densityKgM3),
      cargoDeliveryUsd: Number(q.cargoDeliveryUsd),
      cargoDeliveryRub: Number(q.cargoDeliveryRub),
      searchServiceFeeRub: Number(q.searchServiceFeeRub),
      searchFeeWaived: q.searchFeeWaived,
      isCustomProduction: q.isCustomProduction,
      customProductionFeeRub: Number(q.customProductionFeeRub),
      buyoutCommissionPercent: Number(q.buyoutCommissionPercent),
      buyoutCommissionRub: Number(q.buyoutCommissionRub),
      totalRub: Number(q.totalRub),
      cnyRateUsed: Number(q.cnyRateUsed),
      usdRateUsed: Number(q.usdRateUsed),
      clientComment: q.clientComment,
      managerComment: q.managerComment,
      createdAt: q.createdAt.toISOString(),
      photoIds: photoIdsByQuoteId.get(q.id) ?? [],
      attachedServices: servicesByQuoteId.get(q.id) ?? [],
    })),
  });
}
