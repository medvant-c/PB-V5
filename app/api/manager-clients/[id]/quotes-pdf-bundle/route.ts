import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { getVisibleManagerIds } from "@/lib/manager-scope";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";
import { renderQuotesBundlePdf, type QuotePdfProps } from "@/lib/desk-services/quote-pdf";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// Same POST-with-body reasoning as quotes-excel: the manager checkbox-
// selects a subset, and unlike quotes-pdf (the compact one-row-per-quote
// table for ALL of a client's quotes), this merges each selected quote's
// FULL detail page — the same layout as a single quote's own PDF — into one
// file, in the order the quotes were created.
export async function POST(req: NextRequest, { params }: RouteParams) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  const { id: clientId } = await params;
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) {
    return Response.json({ error: "Клиент не найден." }, { status: 404 });
  }

  const visibleManagerIds = await getVisibleManagerIds(session);
  if (
    visibleManagerIds !== "all" &&
    (!client.createdByManagerId || !visibleManagerIds.includes(client.createdByManagerId))
  ) {
    return Response.json({ error: "Этот клиент вне вашей зоны видимости." }, { status: 403 });
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
    where: { id: { in: quoteIds }, clientId },
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

      // productLink deliberately excluded — never shown to the client, same
      // as the single-quote PDF route.
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
