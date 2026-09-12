import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { canAccessManagerClient, getVisibleManagerIds } from "@/lib/manager-scope";
import { prisma } from "@/lib/prisma";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// Переназначение менеджера, закреплённого за клиентом фулфилмента —
// owner/senior, тот же паттерн видимости, что у manager-quotes/[id]/
// reassign, но в отличие от него ЗАКАСКАДИВАЕТ FulfillmentOrder.managerId
// для всех заказов этого клиента (в одной транзакции с обновлением
// Client.createdByManagerId) — иначе новый ответственный менеджер видел бы
// клиента, но не мог бы вести уже существующие у него заказы (видимость
// заказа сейчас определяется его СОБСТВЕННЫМ managerId, не клиентским).
// Ровно то же поведение, что уже даёт transferToManagerId на PATCH
// /api/manager-clients/[id] для просчётов. См. PB-V5 chat 2026-09-11.
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }
  if (session.role !== "owner" && session.role !== "senior") {
    return Response.json({ error: "Передавать клиентов может только старший менеджер или руководитель." }, { status: 403 });
  }

  const { id } = await params;
  const client = await prisma.client.findUnique({ where: { id }, select: { id: true, kind: true, createdByManagerId: true } });
  if (!client) {
    return Response.json({ error: "Клиент не найден." }, { status: 404 });
  }
  if (client.kind !== "fulfillment") {
    return Response.json({ error: "Этот клиент не относится к фулфилменту." }, { status: 400 });
  }
  if (!(await canAccessManagerClient(session, client))) {
    return Response.json({ error: "Этот клиент вне вашей зоны видимости." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Некорректный запрос." }, { status: 400 });
  }
  const { managerId } = (body as { managerId?: unknown }) ?? {};
  if (typeof managerId !== "string" || !managerId) {
    return Response.json({ error: "Укажите менеджера." }, { status: 400 });
  }

  const visibleManagerIds = await getVisibleManagerIds(session);
  if (visibleManagerIds !== "all" && !visibleManagerIds.includes(managerId)) {
    return Response.json({ error: "Этот менеджер вне вашей зоны видимости." }, { status: 403 });
  }

  const newManager = await prisma.manager.findUnique({ where: { id: managerId }, select: { id: true, name: true } });
  if (!newManager) {
    return Response.json({ error: "Менеджер не найден." }, { status: 404 });
  }

  const [updatedClient] = await prisma.$transaction([
    prisma.client.update({
      where: { id },
      data: { createdByManagerId: managerId, updatedByManagerId: session.managerId },
      select: { id: true, createdByManagerId: true, createdByManager: { select: { name: true } } },
    }),
    prisma.fulfillmentOrder.updateMany({ where: { clientId: id }, data: { managerId } }),
  ]);

  return Response.json({ client: updatedClient });
}
