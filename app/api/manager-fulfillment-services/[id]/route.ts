import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { prisma } from "@/lib/prisma";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  const { id } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Некорректный запрос." }, { status: 400 });
  }
  const { name, priceCny, scope } = (body as { name?: unknown; priceCny?: unknown; scope?: unknown }) ?? {};
  const data: Record<string, unknown> = {};
  if (typeof name === "string" && name.trim()) data.name = name.trim();
  if (scope === "item" || scope === "order") data.scope = scope;
  if (priceCny !== undefined) {
    const priceCnyNum = Number(priceCny);
    if (!Number.isFinite(priceCnyNum) || priceCnyNum < 0) {
      return Response.json({ error: "Укажите цену, ¥." }, { status: 400 });
    }
    const tariff = await prisma.tariffSettings.findFirst({ orderBy: { createdAt: "desc" } });
    const rate = tariff ? Number(tariff.cnyRateRub) : 0;
    data.priceCny = priceCnyNum;
    data.priceRub = priceCnyNum * rate;
  }

  const item = await prisma.fulfillmentServiceItem.update({ where: { id }, data });
  return Response.json({ item });
}

// Existing FulfillmentOrderItem rows keep their own snapshot (name/priceCny/
// priceRub) and just lose the live serviceItemId link (onDelete: SetNull) —
// safe to delete freely, same as ServiceCatalogItem.
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  const { id } = await params;
  await prisma.fulfillmentServiceItem.delete({ where: { id } });
  return Response.json({ ok: true });
}
