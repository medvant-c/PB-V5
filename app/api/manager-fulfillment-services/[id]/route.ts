import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { canEditTariffs } from "@/lib/manager-scope";
import { prisma } from "@/lib/prisma";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }
  if (!(await canEditTariffs(session))) {
    return Response.json({ error: "У вас нет прав на изменение прайс-листа." }, { status: 403 });
  }

  const { id } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Некорректный запрос." }, { status: 400 });
  }
  const { name, priceRub } = (body as { name?: unknown; priceRub?: unknown }) ?? {};
  const data: Record<string, unknown> = {};
  if (typeof name === "string" && name.trim()) data.name = name.trim();
  if (priceRub !== undefined) {
    const price = Number(priceRub);
    if (!Number.isFinite(price) || price < 0) {
      return Response.json({ error: "Укажите цену, ₽." }, { status: 400 });
    }
    data.priceRub = price;
  }

  const item = await prisma.fulfillmentServiceItem.update({ where: { id }, data });
  return Response.json({ item });
}

// Existing FulfillmentOrderItem rows keep their own snapshot (name/priceRub)
// and just lose the live serviceItemId link (onDelete: SetNull) — safe to
// delete freely, same as ServiceCatalogItem.
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }
  if (!(await canEditTariffs(session))) {
    return Response.json({ error: "У вас нет прав на изменение прайс-листа." }, { status: 403 });
  }

  const { id } = await params;
  await prisma.fulfillmentServiceItem.delete({ where: { id } });
  return Response.json({ ok: true });
}
