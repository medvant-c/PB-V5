import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { canAccessManagerQuote } from "@/lib/manager-scope";
import { prisma } from "@/lib/prisma";
import {
  parseItems,
  parseOrderServices,
  itemsTotalRub,
  orderServicesTotalRub,
  type ParsedItemInput,
  type ParsedOrderServiceInput,
} from "@/lib/desk-services/fulfillment-order-input";
import { withItemPhotoIds } from "@/lib/desk-services/fulfillment-order-photos";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// Edit and archive share one endpoint (same "archived is just another
// PATCH field" convention as manager-clients/[id]/route.ts) — either or
// both can be sent in one request. Editing items/orderServices is a full
// replace, not a diff: existing rows (and their nested services, cascade)
// are deleted and recreated from the submitted set, same "resend the
// complete current state" convention quote-dialog.tsx already uses for
// attached services. This does mean any already-checked
// completedAt/completedByManagerId on a service, or receivedQuantity on an
// item, is lost on a full items edit — accepted trade-off, same as before
// (receivedQuantity has its own narrow endpoint precisely to avoid this,
// see manager-fulfillment-order-items/[id]/receive). cnyRateUsed is NEVER
// changed here — every priceCny→priceRub on an edit uses the order's
// ORIGINAL frozen rate, not a fresh tariff lookup, so an edit can't
// silently drift the order's economics from what was agreed when it was
// created.
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
  const { clientId, quoteId, items: rawItems, orderServices: rawOrderServices, archived, receivedAt, plannedShipAt } =
    (body as {
      clientId?: unknown;
      quoteId?: unknown;
      items?: unknown;
      orderServices?: unknown;
      archived?: unknown;
      receivedAt?: unknown;
      plannedShipAt?: unknown;
    }) ?? {};

  const data: Record<string, unknown> = {};

  if (typeof archived === "boolean") data.archivedAt = archived ? new Date() : null;
  if (receivedAt !== undefined) data.receivedAt = typeof receivedAt === "string" && receivedAt ? new Date(receivedAt) : null;
  if (plannedShipAt !== undefined) data.plannedShipAt = typeof plannedShipAt === "string" && plannedShipAt ? new Date(plannedShipAt) : null;

  const resolvedClientId = typeof clientId === "string" && clientId ? clientId : existing.clientId;
  if (clientId !== undefined) {
    if (typeof clientId !== "string" || !clientId) {
      return Response.json({ error: "Укажите клиента." }, { status: 400 });
    }
    const client = await prisma.client.findUnique({ where: { id: clientId } });
    if (!client) return Response.json({ error: "Клиент не найден." }, { status: 404 });
    data.clientId = clientId;
  }

  if (quoteId !== undefined) {
    if (quoteId === null || quoteId === "") {
      data.quoteId = null;
    } else if (typeof quoteId === "string") {
      const quote = await prisma.quote.findUnique({ where: { id: quoteId } });
      if (!quote || quote.clientId !== resolvedClientId) {
        return Response.json({ error: "Просчёт не найден у этого клиента." }, { status: 400 });
      }
      data.quoteId = quoteId;
    }
  }

  const cnyRateUsed = Number(existing.cnyRateUsed);

  let items: ParsedItemInput[] | undefined;
  if (rawItems !== undefined) {
    const parsed = parseItems(rawItems);
    if ("error" in parsed) {
      return Response.json({ error: parsed.error }, { status: 400 });
    }
    const cardIds = [...new Set(parsed.map((i) => i.productCardId).filter((v): v is string => Boolean(v)))];
    if (cardIds.length > 0) {
      const cards = await prisma.fulfillmentProductCard.findMany({ where: { id: { in: cardIds }, clientId: resolvedClientId } });
      if (cards.length !== cardIds.length) {
        return Response.json({ error: "Одна из выбранных карточек товара не найдена у этого клиента." }, { status: 400 });
      }
    }
    items = parsed;
  }

  let orderServices: ParsedOrderServiceInput[] | undefined;
  if (rawOrderServices !== undefined) {
    const parsed = parseOrderServices(rawOrderServices);
    if ("error" in parsed) {
      return Response.json({ error: parsed.error }, { status: 400 });
    }
    orderServices = parsed;
  }

  if (items || orderServices) {
    // totalRub — сумма по позициям + услугам на партию целиком. Если этот
    // PATCH затронул только одну из двух сторон, вторая берётся из уже
    // сохранённых в БД строк (а не обнуляется) — то же "не потерять
    // нетронутую часть" правило, что и у остальных полей выше.
    let itemsSideRub: number;
    if (items) {
      itemsSideRub = itemsTotalRub(items, cnyRateUsed);
    } else {
      const existingItemsTotal = await prisma.fulfillmentOrderItemService.aggregate({
        where: { item: { orderId: id } },
        _sum: { priceRub: true },
      });
      itemsSideRub = Number(existingItemsTotal._sum.priceRub ?? 0);
    }
    let orderServicesSideRub: number;
    if (orderServices) {
      orderServicesSideRub = orderServicesTotalRub(orderServices, cnyRateUsed);
    } else {
      const existingOrderServicesTotal = await prisma.fulfillmentOrderService.aggregate({
        where: { orderId: id },
        _sum: { priceRub: true },
      });
      orderServicesSideRub = Number(existingOrderServicesTotal._sum.priceRub ?? 0);
    }
    data.totalRub = itemsSideRub + orderServicesSideRub;
  }

  if (items) {
    await prisma.fulfillmentOrderItem.deleteMany({ where: { orderId: id } });
  }
  if (orderServices) {
    await prisma.fulfillmentOrderService.deleteMany({ where: { orderId: id } });
  }

  const order = await prisma.fulfillmentOrder.update({
    where: { id },
    data: {
      ...data,
      ...(items
        ? {
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
          }
        : {}),
      ...(orderServices
        ? {
            orderServices: {
              create: orderServices.map((s) => ({
                name: s.name,
                priceCny: s.priceCny,
                priceRub: s.priceCny * cnyRateUsed,
                quantity: s.quantity,
              })),
            },
          }
        : {}),
    },
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
    },
  });

  const [orderWithPhotos] = await withItemPhotoIds([order]);
  return Response.json({ order: orderWithPhotos });
}

// Hard delete — cascade removes items/services/orderServices/printLogs (see
// onDelete: Cascade in prisma/schema.prisma). Same access scope as edit
// (own orders, senior's team, or owner), not owner-only: this is day-to-day
// warehouse record-keeping, same reasoning as who can create one in the
// first place.
export async function DELETE(req: NextRequest, { params }: RouteParams) {
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

  await prisma.fulfillmentOrder.delete({ where: { id } });
  return Response.json({ ok: true });
}
