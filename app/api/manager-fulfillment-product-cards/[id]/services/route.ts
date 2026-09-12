import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { canAccessManagerClient } from "@/lib/manager-scope";
import { prisma } from "@/lib/prisma";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// Услуги по умолчанию, привязанные к карточке товара — снэпшот с
// глобального каталога (FulfillmentServiceItem) на момент привязки, не
// живая ссылка (см. схему). При создании позиции заказа из карточки эти
// строки копируются дальше в FulfillmentOrderItemService, тоже снэпшотом.
export async function GET(req: NextRequest, { params }: RouteParams) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }
  const { id } = await params;
  const card = await prisma.fulfillmentProductCard.findUnique({ where: { id }, include: { client: { select: { id: true, createdByManagerId: true } } } });
  if (!card) return Response.json({ error: "Карточка не найдена." }, { status: 404 });
  if (!(await canAccessManagerClient(session, card.client))) {
    return Response.json({ error: "Этот клиент вне вашей зоны видимости." }, { status: 403 });
  }

  const services = await prisma.fulfillmentProductCardService.findMany({ where: { cardId: id }, orderBy: { createdAt: "asc" } });
  return Response.json({ services });
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }
  const { id } = await params;
  const card = await prisma.fulfillmentProductCard.findUnique({ where: { id }, include: { client: { select: { id: true, createdByManagerId: true } } } });
  if (!card) return Response.json({ error: "Карточка не найдена." }, { status: 404 });
  if (!(await canAccessManagerClient(session, card.client))) {
    return Response.json({ error: "Этот клиент вне вашей зоны видимости." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Некорректный запрос." }, { status: 400 });
  }
  const { serviceItemId, name, priceCny } = (body as { serviceItemId?: unknown; name?: unknown; priceCny?: unknown }) ?? {};

  let resolvedName = typeof name === "string" ? name.trim() : "";
  let resolvedPriceCny = Number(priceCny);

  if (typeof serviceItemId === "string" && serviceItemId) {
    const catalogItem = await prisma.fulfillmentServiceItem.findUnique({ where: { id: serviceItemId } });
    if (!catalogItem) return Response.json({ error: "Услуга не найдена в каталоге." }, { status: 404 });
    if (!resolvedName) resolvedName = catalogItem.name;
    if (!Number.isFinite(resolvedPriceCny) || priceCny === undefined) resolvedPriceCny = Number(catalogItem.priceCny);
  }

  if (!resolvedName) {
    return Response.json({ error: "Укажите название услуги." }, { status: 400 });
  }
  if (!Number.isFinite(resolvedPriceCny) || resolvedPriceCny < 0) {
    return Response.json({ error: "Укажите цену, ¥." }, { status: 400 });
  }

  const tariff = await prisma.tariffSettings.findFirst({ orderBy: { createdAt: "desc" } });
  const rate = tariff ? Number(tariff.cnyRateRub) : 0;

  const service = await prisma.fulfillmentProductCardService.create({
    data: {
      cardId: id,
      serviceItemId: typeof serviceItemId === "string" && serviceItemId ? serviceItemId : null,
      name: resolvedName,
      priceCny: resolvedPriceCny,
      priceRub: resolvedPriceCny * rate,
    },
  });
  return Response.json({ service }, { status: 201 });
}
