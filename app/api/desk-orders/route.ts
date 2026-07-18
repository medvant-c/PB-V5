import { NextRequest } from "next/server";
import { hasDeskSession } from "@/lib/desk-auth";
import { createOrderFromCatalogItem } from "@/lib/create-order";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  if (!(await hasDeskSession(req))) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  const clientId = req.nextUrl.searchParams.get("clientId");
  if (!clientId) {
    return Response.json({ error: "Укажите clientId." }, { status: 400 });
  }

  const orders = await prisma.order.findMany({
    where: { clientId },
    orderBy: { createdAt: "desc" },
    include: {
      events: { orderBy: { createdAt: "desc" } },
      serviceCatalogItem: { select: { code: true } },
    },
  });

  return Response.json({ orders });
}

export async function POST(req: NextRequest) {
  if (!(await hasDeskSession(req))) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Некорректный запрос." }, { status: 400 });
  }

  const { clientId, serviceCatalogItemId } =
    (body as { clientId?: unknown; serviceCatalogItemId?: unknown }) ?? {};

  if (typeof clientId !== "string" || !clientId) {
    return Response.json({ error: "Укажите клиента." }, { status: 400 });
  }
  if (typeof serviceCatalogItemId !== "string" || !serviceCatalogItemId) {
    return Response.json({ error: "Выберите услугу." }, { status: 400 });
  }

  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) {
    return Response.json({ error: "Клиент не найден." }, { status: 404 });
  }

  const order = await createOrderFromCatalogItem(clientId, serviceCatalogItemId);
  if (!order) {
    return Response.json({ error: "Услуга не найдена." }, { status: 404 });
  }

  return Response.json({ order }, { status: 201 });
}
