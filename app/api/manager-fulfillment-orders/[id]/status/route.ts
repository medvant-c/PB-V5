import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { canAccessManagerQuote } from "@/lib/manager-scope";
import { prisma } from "@/lib/prisma";
import { isFulfillmentOrderStatus } from "@/lib/fulfillment-statuses";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// Separate from the full-edit PATCH on manager-fulfillment-orders/[id] —
// the status dropdown in the order list changes just this one field, same
// reasoning as manager-quotes/[id]/status/route.ts. No side effects to
// gate on here (unlike Quote's status, which touches buyout/cargo
// confirmation state) — a fulfillment order's status is a plain label.
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  const { id } = await params;
  const existing = await prisma.fulfillmentOrder.findUnique({ where: { id } });
  if (!existing) return Response.json({ error: "Заказ не найден." }, { status: 404 });
  if (!(await canAccessManagerQuote(session, existing.managerId))) {
    return Response.json({ error: "Нет доступа к этому заказу." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Некорректный запрос." }, { status: 400 });
  }
  const { status } = (body as { status?: unknown }) ?? {};
  if (typeof status !== "string" || !isFulfillmentOrderStatus(status)) {
    return Response.json({ error: "Некорректный статус." }, { status: 400 });
  }

  const order = await prisma.fulfillmentOrder.update({ where: { id }, data: { status } });
  return Response.json({ order });
}
