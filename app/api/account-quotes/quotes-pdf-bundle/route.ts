import { NextRequest } from "next/server";
import { getClientIdFromRequest } from "@/lib/client-auth";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";
import { renderQuotesBundlePdf, type QuotePdfProps } from "@/lib/desk-services/quote-pdf";

// Client-scoped mirror of /api/manager-clients/[id]/quotes-pdf-bundle — the
// client checkbox-selects which of their own quotes to include, and gets
// one merged PDF with each quote's full detail page, in creation order.
export async function POST(req: NextRequest) {
  const clientId = await getClientIdFromRequest(req);
  if (!clientId) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) {
    return Response.json({ error: "Клиент не найден." }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Некорректный запрос." }, { status: 400 });
  }
  const { quoteIds } = (body as { quoteIds?: unknown }) ?? {};
  if (!Array.isArray(quoteIds) || quoteIds.length === 0 || !quoteIds.every((id) => typeof id === "string")) {
    return Response.json({ error: "Выберите хотя бы один просчёт." }, { status: 400 });
  }

  const quotes = await prisma.quote.findMany({
    where: { id: { in: quoteIds }, clientId, deletedAt: null },
    include: { client: true },
    orderBy: { createdAt: "asc" },
  });
  if (quotes.length === 0) {
    return Response.json({ error: "Просчёты не найдены." }, { status: 404 });
  }

  const quotePdfProps: QuotePdfProps[] = await Promise.all(
    quotes.map(async (quote) => {
      const [photoRecords, attachedServiceRecords] = await Promise.all([
        prisma.deskFile.findMany({ where: { tab: "quotes", relatedId: quote.id }, orderBy: { uploadedAt: "asc" } }),
        prisma.quoteAttachedService.findMany({ where: { quoteId: quote.id }, orderBy: { createdAt: "asc" } }),
      ]);
      const photoBuffers = await Promise.all(photoRecords.map((r) => storage.get(r.storageKey)));

      return {
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
      };
    }),
  );

  const buffer = await renderQuotesBundlePdf(quotePdfProps);

  const fileName = `Просчёты — ${client.name} (${quotes.length}).pdf`;
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    },
  });
}
