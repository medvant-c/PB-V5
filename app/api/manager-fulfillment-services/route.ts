import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { prisma } from "@/lib/prisma";

// Каталог услуг фулфилмента — отдельный, менее чувствительный прайс-лист
// от Тарифов (canEditTariffs), поэтому и читать, и создавать/редактировать
// его может любая сессия менеджера — реальная защита данных клиента живёт
// в scoping заказов/клиентов, не в этом справочнике. См. PB-V5 chat
// 2026-09-11.
//
// scope — "item" (услуги к товару: приёмка, маркировка единицы и т.п.) или
// "order" (услуги к заявке целиком, результат которых известен только
// после обработки — например "Формирование короба"). Один каталог, а не
// два — существующие связи (FulfillmentOrderItemService.serviceItemId,
// FulfillmentProductCardService.serviceItemId) продолжают работать
// одинаково для обоих scope, разница только в том, где услуга
// предлагается в UI. См. PB-V5 chat 2026-09-12.
export async function GET(req: NextRequest) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  const scopeParam = req.nextUrl.searchParams.get("scope");
  const scope = scopeParam === "item" || scopeParam === "order" ? scopeParam : null;

  const items = await prisma.fulfillmentServiceItem.findMany({
    where: scope ? { scope } : {},
    orderBy: { createdAt: "asc" },
  });
  return Response.json({ items });
}

export async function POST(req: NextRequest) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Некорректный запрос." }, { status: 400 });
  }
  const { name, priceCny, scope } = (body as { name?: unknown; priceCny?: unknown; scope?: unknown }) ?? {};
  if (typeof name !== "string" || !name.trim()) {
    return Response.json({ error: "Укажите название услуги." }, { status: 400 });
  }
  const priceCnyNum = Number(priceCny);
  if (!Number.isFinite(priceCnyNum) || priceCnyNum < 0) {
    return Response.json({ error: "Укажите цену, ¥." }, { status: 400 });
  }
  const resolvedScope = scope === "order" ? "order" : "item";

  // priceRub — не заморожена, просто пересчитывается по текущему курсу
  // тарифа для показа в прайс-листе; актуальный расход/доход конкретного
  // заказа считается по cnyRateUsed этого заказа, не по этому полю.
  const tariff = await prisma.tariffSettings.findFirst({ orderBy: { createdAt: "desc" } });
  const rate = tariff ? Number(tariff.cnyRateRub) : 0;

  const item = await prisma.fulfillmentServiceItem.create({
    data: { name: name.trim(), scope: resolvedScope, priceCny: priceCnyNum, priceRub: priceCnyNum * rate },
  });
  return Response.json({ item }, { status: 201 });
}
