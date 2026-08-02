import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { getVisibleManagerIds } from "@/lib/manager-scope";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";
import { renderContainerShipmentPdf, type ContainerShipmentPdfRow } from "@/lib/desk-services/container-shipment-pdf";
import { containerTypeLabel } from "@/lib/container-types";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  const { id } = await params;
  const shipment = await prisma.containerShipment.findUnique({
    where: { id },
    include: { client: true, items: { include: { quote: { select: { displayId: true } } } } },
  });
  if (!shipment) {
    return Response.json({ error: "Контейнер не найден." }, { status: 404 });
  }

  const visibleManagerIds = await getVisibleManagerIds(session);
  if (visibleManagerIds !== "all" && !visibleManagerIds.includes(shipment.managerId)) {
    return Response.json({ error: "Этот контейнер вне вашей зоны видимости." }, { status: 403 });
  }

  const photoRecords = await prisma.deskFile.findMany({
    where: { tab: "quotes", relatedId: { in: shipment.items.map((i) => i.quoteId) } },
    orderBy: { uploadedAt: "asc" },
  });
  const firstPhotoByQuoteId = new Map<string, string>();
  for (const photo of photoRecords) {
    if (photo.relatedId && !firstPhotoByQuoteId.has(photo.relatedId)) {
      firstPhotoByQuoteId.set(photo.relatedId, photo.storageKey);
    }
  }

  const rows: ContainerShipmentPdfRow[] = await Promise.all(
    shipment.items.map(async (item) => {
      const storageKey = firstPhotoByQuoteId.get(item.quoteId);
      const photoBuffer = storageKey ? await storage.get(storageKey) : null;
      return {
        displayId: item.quote.displayId,
        productName: item.productName,
        color: item.color,
        dimensions: item.dimensions,
        quantity: item.quantity,
        totalVolumeM3: Number(item.totalVolumeM3),
        goodsAndFeesRub: Number(item.goodsAndFeesRub),
        photoBuffer,
      };
    }),
  );

  const buffer = await renderContainerShipmentPdf({
    displayId: shipment.displayId,
    client: { name: shipment.client.name, company: shipment.client.company },
    containerTypeLabel: containerTypeLabel(shipment.containerType),
    totalDeliveryUsd: Number(shipment.totalDeliveryUsd),
    usdRateRub: Number(shipment.usdRateRub),
    rows,
  });

  const fileName = `Контейнер ЖД №${shipment.displayId} — ${shipment.client.name}.pdf`;
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    },
  });
}
