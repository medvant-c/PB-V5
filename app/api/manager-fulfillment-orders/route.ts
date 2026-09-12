import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { getVisibleManagerIds, canAccessManagerClient } from "@/lib/manager-scope";
import { prisma } from "@/lib/prisma";
import { nextFulfillmentOrderDisplayId } from "@/lib/display-ids";
import { parseItems, parseOrderServices, itemsTotalRub, orderServicesTotalRub } from "@/lib/desk-services/fulfillment-order-input";
import { withItemPhotoIds } from "@/lib/desk-services/fulfillment-order-photos";

// Scoped the same as every other manager-cabinet list — a plain manager
// sees only their own orders, senior also sees their team's.
export async function GET(req: NextRequest) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  const visibleManagerIds = await getVisibleManagerIds(session);
  const clientId = req.nextUrl.searchParams.get("clientId");
  const includeArchived = req.nextUrl.searchParams.get("includeArchived") === "1";
  const orders = await prisma.fulfillmentOrder.findMany({
    where: {
      ...(visibleManagerIds === "all" ? {} : { managerId: { in: visibleManagerIds } }),
      ...(clientId ? { clientId } : {}),
      ...(includeArchived ? {} : { archivedAt: null }),
    },
    orderBy: { createdAt: "desc" },
    include: {
      client: { select: { id: true, name: true, company: true, fulfillmentCode: true } },
      manager: { select: { id: true, name: true } },
      quote: { select: { id: true, displayId: true, productName: true } },
      items: {
        orderBy: { createdAt: "asc" },
        include: {
          services: { include: { completedByManager: { select: { id: true, name: true } } } },
        },
      },
      orderServices: { orderBy: { createdAt: "asc" } },
      printLogs: { orderBy: { printedAt: "desc" }, include: { printedByManager: { select: { id: true, name: true } } } },
    },
  });

  return Response.json({ orders: await withItemPhotoIds(orders) });
}

// Доступ — только менеджер, закреплённый за клиентом (canAccessManagerClient,
// та же граница видимости, что и у карточек товара) может создавать заказ
// для него; ЗАКАЗ при этом всегда кредитуется session.managerId (тот, кто
// реально его завёл), тем же способом, что и Quote.managerId при создании
// просчёта — эти два поля намеренно не обязаны совпадать. См. PB-V5 chat
// 2026-09-11.
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
  const { clientId, quoteId, items: rawItems, orderServices: rawOrderServices, receivedAt, plannedShipAt } =
    (body as {
      clientId?: unknown;
      quoteId?: unknown;
      items?: unknown;
      orderServices?: unknown;
      receivedAt?: unknown;
      plannedShipAt?: unknown;
    }) ?? {};

  if (typeof clientId !== "string" || !clientId) {
    return Response.json({ error: "Укажите клиента." }, { status: 400 });
  }
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true, createdByManagerId: true } });
  if (!client) return Response.json({ error: "Клиент не найден." }, { status: 404 });
  if (!(await canAccessManagerClient(session, client))) {
    return Response.json({ error: "Этот клиент вне вашей зоны видимости." }, { status: 403 });
  }

  let resolvedQuoteId: string | null = null;
  if (typeof quoteId === "string" && quoteId) {
    const quote = await prisma.quote.findUnique({ where: { id: quoteId } });
    if (!quote || quote.clientId !== clientId) {
      return Response.json({ error: "Просчёт не найден у этого клиента." }, { status: 400 });
    }
    resolvedQuoteId = quoteId;
  }

  const items = parseItems(rawItems);
  if ("error" in items) {
    return Response.json({ error: items.error }, { status: 400 });
  }
  const orderServices = parseOrderServices(rawOrderServices);
  if ("error" in orderServices) {
    return Response.json({ error: orderServices.error }, { status: 400 });
  }

  const cardIds = [...new Set(items.map((i) => i.productCardId).filter((v): v is string => Boolean(v)))];
  if (cardIds.length > 0) {
    const cards = await prisma.fulfillmentProductCard.findMany({ where: { id: { in: cardIds }, clientId } });
    if (cards.length !== cardIds.length) {
      return Response.json({ error: "Одна из выбранных карточек товара не найдена у этого клиента." }, { status: 400 });
    }
  }

  // Курс фиксируется здесь, один раз — все priceCny→priceRub на этом заказе
  // считаются по НЕМУ, а не по текущему тарифу (см. FulfillmentOrder.cnyRateUsed).
  const tariff = await prisma.tariffSettings.findFirst({ orderBy: { createdAt: "desc" } });
  const cnyRateUsed = tariff ? Number(tariff.cnyRateRub) : 0;
  if (!cnyRateUsed) {
    return Response.json({ error: "Не задан курс юаня в Тарифах — обратитесь к руководителю." }, { status: 400 });
  }

  const totalRub = itemsTotalRub(items, cnyRateUsed) + orderServicesTotalRub(orderServices, cnyRateUsed);

  const order = await prisma.fulfillmentOrder.create({
    data: {
      displayId: await nextFulfillmentOrderDisplayId(),
      clientId,
      quoteId: resolvedQuoteId,
      managerId: session.managerId,
      totalRub,
      cnyRateUsed,
      receivedAt: typeof receivedAt === "string" && receivedAt ? new Date(receivedAt) : null,
      plannedShipAt: typeof plannedShipAt === "string" && plannedShipAt ? new Date(plannedShipAt) : null,
      items: {
        create: items.map((item) => ({
          name: item.name,
          sku: item.sku,
          dimensions: item.dimensions,
          plannedQuantity: item.plannedQuantity,
          productCardId: item.productCardId,
          services: {
            create: item.services.map((s) => ({
              serviceItemId: s.serviceItemId,
              name: s.name,
              priceCny: s.priceCny,
              priceRub: s.priceCny * cnyRateUsed,
              quantity: s.quantity,
            })),
          },
        })),
      },
      orderServices: {
        create: orderServices.map((s) => ({
          name: s.name,
          priceCny: s.priceCny,
          priceRub: s.priceCny * cnyRateUsed,
          quantity: s.quantity,
        })),
      },
    },
    include: {
      client: { select: { id: true, name: true, company: true, fulfillmentCode: true } },
      manager: { select: { id: true, name: true } },
      quote: { select: { id: true, displayId: true, productName: true } },
      items: { include: { services: true } },
      orderServices: true,
    },
  });

  const [orderWithPhotos] = await withItemPhotoIds([order]);
  return Response.json({ order: orderWithPhotos }, { status: 201 });
}
