import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { getVisibleManagerIds } from "@/lib/manager-scope";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";
import { renderQuotesBundlePdf, type QuotePdfProps } from "@/lib/desk-services/quote-pdf";

// Same as /api/manager-clients/[id]/quotes-pdf-bundle, just not anchored
// to one client — the "Все просчёты" tab (see components/manager/tabs/
// all-quotes-tab.tsx) lets a selection span multiple clients, and
// renderQuotesBundlePdf already takes its client info per-quote (each
// QuotePdfProps carries its own `client`), so nothing about the render
// itself needed to change — only the scope check, which uses
// getVisibleManagerIds directly against each quote's own managerId
// instead of a single client's createdByManagerId. See PB-V5 chat
// 2026-08-01.
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
  const { quoteIds } = (body as { quoteIds?: unknown }) ?? {};
  if (!Array.isArray(quoteIds) || quoteIds.length === 0 || !quoteIds.every((id) => typeof id === "string")) {
    return Response.json({ error: "Выберите хотя бы один просчёт." }, { status: 400 });
  }

  const visibleManagerIds = await getVisibleManagerIds(session);
  const quotes = await prisma.quote.findMany({
    where: {
      id: { in: quoteIds },
      ...(visibleManagerIds === "all" ? {} : { managerId: { in: visibleManagerIds } }),
    },
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

  const fileName = `Просчёты (${quotes.length}).pdf`;
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    },
  });
}
