import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { canEditTariffs } from "@/lib/manager-scope";
import { prisma } from "@/lib/prisma";

// Everyone with a manager session can read the price list (needed to build
// a Фулфилмент order); only owner/canEditTariffs can add new services —
// same split as ServiceCatalogItem.
export async function GET(req: NextRequest) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  const items = await prisma.fulfillmentServiceItem.findMany({ orderBy: { createdAt: "asc" } });
  return Response.json({ items });
}

export async function POST(req: NextRequest) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }
  if (!(await canEditTariffs(session))) {
    return Response.json({ error: "У вас нет прав на изменение прайс-листа." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Некорректный запрос." }, { status: 400 });
  }
  const { name, priceRub } = (body as { name?: unknown; priceRub?: unknown }) ?? {};
  if (typeof name !== "string" || !name.trim()) {
    return Response.json({ error: "Укажите название услуги." }, { status: 400 });
  }
  const price = Number(priceRub);
  if (!Number.isFinite(price) || price < 0) {
    return Response.json({ error: "Укажите цену, ₽." }, { status: 400 });
  }

  const item = await prisma.fulfillmentServiceItem.create({ data: { name: name.trim(), priceRub: price } });
  return Response.json({ item }, { status: 201 });
}
