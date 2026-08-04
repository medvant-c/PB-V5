import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { canAccessManagerQuote } from "@/lib/manager-scope";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";
import { renderQuotePdf } from "@/lib/desk-services/quote-pdf";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  const { id } = await params;
  const quote = await prisma.quote.findUnique({ where: { id }, include: { client: true } });
  if (!quote || quote.deletedAt) {
    return Response.json({ error: "Просчёт не найден." }, { status: 404 });
  }
  if (!(await canAccessManagerQuote(session, quote.managerId))) {
    return Response.json({ error: "Нет доступа к этому просчёту." }, { status: 403 });
  }

  const photoRecords = await prisma.deskFile.findMany({
    where: { tab: "quotes", relatedId: quote.id },
    orderBy: { uploadedAt: "asc" },
  });
  const photoBuffers = await Promise.all(photoRecords.map((record) => storage.get(record.storageKey)));

  const attachedServiceRecords = await prisma.quoteAttachedService.findMany({
    where: { quoteId: quote.id },
    orderBy: { createdAt: "asc" },
  });

  // productLink is deliberately never passed to renderQuotePdf — the
  // supplier link stays internal, per the manager's explicit instruction
  // ("ссылку на поставщика мы клиенту не показываем").
  const buffer = await renderQuotePdf({
    quote: {
      displayId: quote.displayId,
      productName: quote.productName,
      productDescription: quote.productDescription,
      color: quote.color,
      dimensions: quote.dimensions,
      quantity: quote.quantity,
      quoteType: quote.quoteType,
      priceCnyPerUnit: Number(quote.priceCnyPerUnit),
      totalPriceCny: Number(quote.totalPriceCny),
      totalPriceRub: Number(quote.totalPriceRub),
      chinaDeliveryRub: Number(quote.chinaDeliveryRub),
      totalWeightKg: Number(quote.totalWeightKg),
      totalVolumeM3: Number(quote.totalVolumeM3),
      densityKgM3: Number(quote.densityKgM3),
      cargoDeliveryUsd: Number(quote.cargoDeliveryUsd),
      cargoDeliveryRub: Number(quote.cargoDeliveryRub),
      searchServiceFeeRub: Number(quote.searchServiceFeeRub),
      searchFeeWaived: quote.searchFeeWaived,
      isCustomProduction: quote.isCustomProduction,
      customProductionFeeRub: Number(quote.customProductionFeeRub),
      buyoutCommissionPercent: Number(quote.buyoutCommissionPercent),
      buyoutCommissionRub: Number(quote.buyoutCommissionRub),
      totalRub: Number(quote.totalRub),
      createdAt: quote.createdAt,
    },
    client: {
      name: quote.client.name,
      company: quote.client.company,
      phone: quote.client.phone,
      messenger: quote.client.messenger,
    },
    photoBuffers,
    attachedServices: attachedServiceRecords.map((s) => ({ name: s.name, priceRub: Number(s.priceRub) })),
  });

  const fileName = `Расчёт — ${quote.productName}.pdf`;
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    },
  });
}
