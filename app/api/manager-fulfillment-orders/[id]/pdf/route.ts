import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { canAccessManagerQuote } from "@/lib/manager-scope";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";
import { renderFulfillmentOrderPdf } from "@/lib/desk-services/fulfillment-order-pdf";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  const { id } = await params;
  const order = await prisma.fulfillmentOrder.findUnique({
    where: { id },
    include: {
      client: { select: { name: true, company: true, fulfillmentCode: true } },
      manager: { select: { name: true } },
      items: {
        orderBy: { createdAt: "asc" },
        include: { services: true },
      },
      orderServices: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!order) {
    return Response.json({ error: "Заказ не найден." }, { status: 404 });
  }
  if (!(await canAccessManagerQuote(session, order.managerId))) {
    return Response.json({ error: "Нет доступа к этому заказу." }, { status: 403 });
  }

  // Фото — по productCardId позиции (одно фото на карточку, tab:
  // fulfillment_product_card), одним батч-запросом на все позиции сразу.
  const cardIds = [...new Set(order.items.map((i) => i.productCardId).filter((v): v is string => Boolean(v)))];
  const photoRecords = cardIds.length
    ? await prisma.deskFile.findMany({ where: { tab: "fulfillment_product_card", relatedId: { in: cardIds } } })
    : [];
  const photoByCardId = new Map(photoRecords.map((p) => [p.relatedId, p]));
  const photoBuffers = new Map<string, Buffer>(
    await Promise.all(
      [...photoByCardId.entries()].map(async ([cardId, file]) => [cardId, await storage.get(file.storageKey)] as [string, Buffer]),
    ),
  );

  const buffer = await renderFulfillmentOrderPdf({
    order: { displayId: order.displayId, totalRub: Number(order.totalRub), createdAt: order.createdAt },
    client: { name: order.client.name, company: order.client.company, fulfillmentCode: order.client.fulfillmentCode },
    manager: { name: order.manager.name },
    items: order.items.map((item) => ({
      name: item.name,
      sku: item.sku,
      dimensions: item.dimensions,
      plannedQuantity: item.plannedQuantity,
      photoBuffer: item.productCardId ? photoBuffers.get(item.productCardId) ?? null : null,
      services: item.services.map((s) => ({
        name: s.name,
        priceRub: Number(s.priceRub),
        quantity: s.quantity,
        completedAt: s.completedAt,
      })),
    })),
    orderServices: order.orderServices.map((s) => ({ name: s.name, priceRub: Number(s.priceRub), quantity: s.quantity })),
  });

  // Лог печати — строка на каждый хит, без дедупликации: наряд можно
  // печатать повторно, и должна быть видна вся история, кто и когда. См.
  // план «Фулфилмент», PB-V5 chat 2026-09-11.
  await prisma.fulfillmentOrderPrintLog.create({
    data: { orderId: id, printedByManagerId: session.managerId },
  });

  const fileName = `Наряд-задание — Фулфилмент №${order.displayId}.pdf`;
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    },
  });
}
