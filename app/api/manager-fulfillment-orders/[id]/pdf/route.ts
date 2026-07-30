import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { canAccessManagerQuote } from "@/lib/manager-scope";
import { prisma } from "@/lib/prisma";
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
      client: { select: { name: true, company: true } },
      manager: { select: { name: true } },
      items: {
        orderBy: { createdAt: "asc" },
        include: { services: true },
      },
    },
  });
  if (!order) {
    return Response.json({ error: "Заказ не найден." }, { status: 404 });
  }
  if (!(await canAccessManagerQuote(session, order.managerId))) {
    return Response.json({ error: "Нет доступа к этому заказу." }, { status: 403 });
  }

  const buffer = await renderFulfillmentOrderPdf({
    order: { displayId: order.displayId, totalRub: Number(order.totalRub), createdAt: order.createdAt },
    client: { name: order.client.name, company: order.client.company },
    manager: { name: order.manager.name },
    items: order.items.map((item) => ({
      name: item.name,
      sku: item.sku,
      dimensions: item.dimensions,
      services: item.services.map((s) => ({
        name: s.name,
        priceRub: Number(s.priceRub),
        quantity: s.quantity,
        completedAt: s.completedAt,
      })),
    })),
  });

  const fileName = `Наряд-задание — Фулфилмент №${order.displayId}.pdf`;
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    },
  });
}
