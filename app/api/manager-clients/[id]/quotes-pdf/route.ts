import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { getVisibleManagerIds } from "@/lib/manager-scope";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";
import { renderQuotesListPdf, type QuoteListRow } from "@/lib/desk-services/quotes-list-pdf";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// One row per quote (not per product within a quote — each quote is still
// one product, see lib/quote-engine.ts), oldest first ("от 1-го"), for a
// client with more than one quote. Scoped the same way as the client list
// itself — a plain manager can only export a client they can see.
export async function GET(req: NextRequest, { params }: RouteParams) {
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

  const quotes = await prisma.quote.findMany({ where: { clientId }, orderBy: { createdAt: "asc" } });
  if (quotes.length === 0) {
    return Response.json({ error: "У клиента пока нет просчётов." }, { status: 404 });
  }

  const rows: QuoteListRow[] = await Promise.all(
    quotes.map(async (quote) => {
      const firstPhoto = await prisma.deskFile.findFirst({
        where: { tab: "quotes", relatedId: quote.id },
        orderBy: { uploadedAt: "asc" },
      });
      return {
        displayId: quote.displayId,
        quoteType: quote.quoteType,
        productName: quote.productName,
        quantity: quote.quantity,
        totalRub: Number(quote.totalRub),
        searchFeeWaived: quote.searchFeeWaived,
        photoBuffer: firstPhoto ? await storage.get(firstPhoto.storageKey) : null,
        totalWeightKg: Number(quote.totalWeightKg),
        totalVolumeM3: Number(quote.totalVolumeM3),
        densityKgM3: Number(quote.densityKgM3),
        cargoRateUsd: Number(quote.cargoRateUsd),
        deliveryPricingMode: quote.deliveryPricingMode,
      };
    }),
  );

  const buffer = await renderQuotesListPdf({
    client: { name: client.name, company: client.company },
    rows,
    showTariff: true,
  });

  const fileName = `Все просчёты — ${client.name}.pdf`;
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    },
  });
}
