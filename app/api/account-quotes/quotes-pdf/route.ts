import { NextRequest } from "next/server";
import { getClientIdFromRequest } from "@/lib/client-auth";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";
import { renderQuotesListPdf, type QuoteListRow } from "@/lib/desk-services/quotes-list-pdf";

// Client-scoped mirror of /api/manager-clients/[id]/quotes-pdf — one
// compact table row per quote, ALL of the logged-in client's quotes (no
// selection needed, unlike the bundle/excel routes below).
export async function GET(req: NextRequest) {
  const clientId = await getClientIdFromRequest(req);
  if (!clientId) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) {
    return Response.json({ error: "Клиент не найден." }, { status: 404 });
  }

  const quotes = await prisma.quote.findMany({ where: { clientId }, orderBy: { createdAt: "asc" } });
  if (quotes.length === 0) {
    return Response.json({ error: "Просчётов пока нет." }, { status: 404 });
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
      };
    }),
  );

  const buffer = await renderQuotesListPdf({
    client: { name: client.name, company: client.company },
    rows,
  });

  const fileName = `Все просчёты — ${client.name}.pdf`;
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    },
  });
}
