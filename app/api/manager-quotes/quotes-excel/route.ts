import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { getVisibleManagerIds } from "@/lib/manager-scope";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";
import { renderQuotesExcel, type QuoteExcelRow } from "@/lib/desk-services/quotes-excel";

// Same as /api/manager-clients/[id]/quotes-excel, just not anchored to
// one client — the "Все просчёты" tab lets a selection span multiple
// clients, which is exactly why QuoteExcelRow carries its own
// clientName/clientCompany per row now instead of one shared header. See
// PB-V5 chat 2026-08-01.
export async function POST(req: NextRequest) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Некорректный запрос." }, { status: 400 });
  }
  const { quoteIds, cargoInUsd } = (body as { quoteIds?: unknown; cargoInUsd?: unknown }) ?? {};
  if (!Array.isArray(quoteIds) || quoteIds.length === 0 || !quoteIds.every((id) => typeof id === "string")) {
    return Response.json({ error: "Выберите хотя бы один просчёт." }, { status: 400 });
  }

  const visibleManagerIds = await getVisibleManagerIds(session);
  const quotes = await prisma.quote.findMany({
    where: {
      id: { in: quoteIds },
      deletedAt: null,
      ...(visibleManagerIds === "all" ? {} : { managerId: { in: visibleManagerIds } }),
    },
    include: { client: { select: { name: true, company: true } } },
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
        clientName: quote.client.name,
        clientCompany: quote.client.company,
        quoteType: quote.quoteType,
        photoBuffers,
        productName: quote.productName,
        productDescription: quote.productDescription,
        color: quote.color,
        dimensions: quote.dimensions,
        quantity: quote.quantity,
        priceRubPerUnit: Number(quote.priceRubPerUnit),
        priceCnyPerUnit: Number(quote.priceCnyPerUnit),
        totalPriceRub: Number(quote.totalPriceRub),
        totalPriceCny: Number(quote.totalPriceCny),
        chinaDeliveryRub: Number(quote.chinaDeliveryRub),
        chinaDeliveryCny: Number(quote.chinaDeliveryCny),
        totalWeightKg: Number(quote.totalWeightKg),
        densityKgM3: Number(quote.densityKgM3),
        totalVolumeM3: Number(quote.totalVolumeM3),
        searchServiceFeeRub: Number(quote.searchServiceFeeRub),
        searchFeeWaived: quote.searchFeeWaived,
        customProductionFeeRub: Number(quote.customProductionFeeRub),
        buyoutCommissionRub: Number(quote.buyoutCommissionRub),
        attachedServicesTotalRub,
        cargoDeliveryRub: Number(quote.cargoDeliveryRub),
        cargoDeliveryUsd: Number(quote.cargoDeliveryUsd),
        totalRub: Number(quote.totalRub),
        cnyRateUsed: Number(quote.cnyRateUsed),
      };
    }),
  );

  const buffer = await renderQuotesExcel({
    client: { name: "Все просчёты", company: null },
    rows,
    cargoInUsd: cargoInUsd === true,
  });

  const fileName = `Просчёты (${quotes.length})${cargoInUsd === true ? " (карго в $)" : ""}.xlsx`;
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    },
  });
}
