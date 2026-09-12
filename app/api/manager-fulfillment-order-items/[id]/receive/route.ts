import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { canAccessManagerQuote } from "@/lib/manager-scope";
import { prisma } from "@/lib/prisma";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// Узкий эндпоинт только для receivedQuantity — заполняется отдельно от
// полного PATCH заказа (см. .../manager-fulfillment-orders/[id]/route.ts),
// потому что склад считает фактически принятое количество независимо и
// зачастую позже, чем менеджер редактирует остальной состав заказа; через
// full-replace PATCH это значение просто терялось бы при любой другой
// правке позиций. См. план «Фулфилмент», PB-V5 chat 2026-09-11.
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  const { id } = await params;
  const item = await prisma.fulfillmentOrderItem.findUnique({
    where: { id },
    include: { order: { select: { managerId: true } } },
  });
  if (!item) {
    return Response.json({ error: "Позиция не найдена." }, { status: 404 });
  }
  if (!(await canAccessManagerQuote(session, item.order.managerId))) {
    return Response.json({ error: "Нет доступа к этому заказу." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Некорректный запрос." }, { status: 400 });
  }
  const { receivedQuantity } = (body as { receivedQuantity?: unknown }) ?? {};
  if (receivedQuantity === null) {
    const updated = await prisma.fulfillmentOrderItem.update({ where: { id }, data: { receivedQuantity: null } });
    return Response.json({ item: updated });
  }
  const value = Number(receivedQuantity);
  if (!Number.isInteger(value) || value < 0) {
    return Response.json({ error: "Укажите принятое количество." }, { status: 400 });
  }

  const updated = await prisma.fulfillmentOrderItem.update({ where: { id }, data: { receivedQuantity: value } });
  return Response.json({ item: updated });
}
