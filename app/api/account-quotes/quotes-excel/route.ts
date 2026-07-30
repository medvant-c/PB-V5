import { NextRequest } from "next/server";
import { getClientIdFromRequest } from "@/lib/client-auth";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";
import { renderQuotesExcel, type QuoteExcelRow } from "@/lib/desk-services/quotes-excel";

// Client-scoped mirror of /api/manager-clients/[id]/quotes-excel.
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
    where: { id: { in: quoteIds }, clientId },
    orderBy: { createdAt: "asc" },
  });
  if (quotes.length === 0) {
    return Response.json({ error: "Просчёты не найдены." }, { status: 404 });
  }

  const rows: QuoteExcelRow[] = await Promise.all(
    quotes.map(async (quote) => {
      const [photoRecords, attachedServices] = await Promise.all([
        prisma.deskFile.findMany({ where: { tab: "quotes", relatedId: quote.id }, orderBy: { uploadedAt: "asc" } }),
        prisma.quoteAttachedService.findMany({ where: { quoteId: quote.id } }),
      ]);
      const photoBuffers = await Promise.all(photoRecords.map((r) => storage.get(r.storageKey)));
      const attachedServicesTotalRub = attachedServices.reduce((sum, s) => sum + Number(s.priceRub), 0);

      return {
        quoteType: quote.quoteType,
        photoBuffers,
        productName: quote.productName,
        productDescription: quote.productDescription,
        color: quote.color,
        dimensions: quote.dimensions,
        quantity: quote.quantity,
        priceRubPerUnit: Number(quote.priceRubPerUnit),
        totalPriceRub: Number(quote.totalPriceRub),
        chinaDeliveryRub: Number(quote.chinaDeliveryRub),
        totalWeightKg: Number(quote.totalWeightKg),
        densityKgM3: Number(quote.densityKgM3),
        totalVolumeM3: Number(quote.totalVolumeM3),
        searchServiceFeeRub: Number(quote.searchServiceFeeRub),
        searchFeeWaived: quote.searchFeeWaived,
        customProductionFeeRub: Number(quote.customProductionFeeRub),
        buyoutCommissionRub: Number(quote.buyoutCommissionRub),
        attachedServicesTotalRub,
        cargoDeliveryRub: Number(quote.cargoDeliveryRub),
        totalRub: Number(quote.totalRub),
      };
    }),
  );

  const buffer = await renderQuotesExcel({ client: { name: client.name, company: client.company }, rows });

  const fileName = `Просчёты — ${client.name}.xlsx`;
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    },
  });
}
