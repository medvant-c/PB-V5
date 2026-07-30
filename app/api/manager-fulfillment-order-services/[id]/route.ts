import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { canAccessManagerQuote } from "@/lib/manager-scope";
import { prisma } from "@/lib/prisma";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// Marks (or unmarks) one warehouse task done — the atomic unit of physical
// work, see FulfillmentOrderItemService in prisma/schema.prisma. Any
// manager with access to the order can toggle it, same "day-to-day work,
// no sign-off needed" reasoning as creating the order itself — there's no
// separate "warehouse" role in this system.
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  const { id } = await params;
  const service = await prisma.fulfillmentOrderItemService.findUnique({
    where: { id },
    include: { item: { include: { order: { select: { managerId: true } } } } },
  });
  if (!service) {
    return Response.json({ error: "Услуга не найдена." }, { status: 404 });
  }
  if (!(await canAccessManagerQuote(session, service.item.order.managerId))) {
    return Response.json({ error: "Нет доступа к этому заказу." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Некорректный запрос." }, { status: 400 });
  }
  const { completed } = (body as { completed?: unknown }) ?? {};
  if (typeof completed !== "boolean") {
    return Response.json({ error: "Некорректное значение." }, { status: 400 });
  }

  const updated = await prisma.fulfillmentOrderItemService.update({
    where: { id },
    data: completed
      ? { completedAt: new Date(), completedByManagerId: session.managerId }
      : { completedAt: null, completedByManagerId: null },
    include: { completedByManager: { select: { id: true, name: true } } },
  });

  return Response.json({ service: updated });
}
