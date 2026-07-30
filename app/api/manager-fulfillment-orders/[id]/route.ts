import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { canAccessManagerQuote } from "@/lib/manager-scope";
import { prisma } from "@/lib/prisma";

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface ParsedServiceInput {
  serviceItemId: string | null;
  name: string;
  priceRub: number;
  quantity: number;
}

interface ParsedItemInput {
  name: string;
  sku: string | null;
  dimensions: string | null;
  services: ParsedServiceInput[];
}

// Same validation as the POST route in ../route.ts — kept as a literal copy
// rather than a shared import since the two files would otherwise need to
// import from each other.
function parseItems(raw: unknown): ParsedItemInput[] | { error: string } {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { error: "Добавьте хотя бы один товар." };
  }
  const items: ParsedItemInput[] = [];
  for (const rawItem of raw) {
    const item = rawItem as { name?: unknown; sku?: unknown; dimensions?: unknown; services?: unknown };
    const name = typeof item.name === "string" ? item.name.trim() : "";
    if (!name) return { error: "Укажите название товара." };
    if (!Array.isArray(item.services) || item.services.length === 0) {
      return { error: `У товара «${name}» не выбрано ни одной услуги.` };
    }
    const services: ParsedServiceInput[] = [];
    for (const rawService of item.services) {
      const service = rawService as { serviceItemId?: unknown; name?: unknown; priceRub?: unknown; quantity?: unknown };
      const serviceName = typeof service.name === "string" ? service.name.trim() : "";
      const priceRub = Number(service.priceRub);
      const quantity = Number(service.quantity);
      if (!serviceName || !Number.isFinite(priceRub) || priceRub < 0 || !Number.isInteger(quantity) || quantity <= 0) {
        return { error: `Некорректная услуга у товара «${name}».` };
      }
      services.push({
        serviceItemId: typeof service.serviceItemId === "string" && service.serviceItemId ? service.serviceItemId : null,
        name: serviceName,
        priceRub,
        quantity,
      });
    }
    items.push({
      name,
      sku: typeof item.sku === "string" && item.sku.trim() ? item.sku.trim() : null,
      dimensions: typeof item.dimensions === "string" && item.dimensions.trim() ? item.dimensions.trim() : null,
      services,
    });
  }
  return items;
}

// Edit and archive share one endpoint (same "archived is just another
// PATCH field" convention as manager-clients/[id]/route.ts) — either or
// both can be sent in one request. Editing items is a full replace, not a
// diff: existing FulfillmentOrderItem rows (and their services, cascade)
// are deleted and recreated from the submitted set, same "resend the
// complete current state" convention quote-dialog.tsx already uses for
// attached services. This does mean any already-checked
// completedAt/completedByManagerId on a service is lost on edit — accepted
// trade-off, since editing quantities/services after the warehouse has
// started ticking them off would leave stale completion state anyway.
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
  const { clientId, quoteId, items: rawItems, archived } =
    (body as { clientId?: unknown; quoteId?: unknown; items?: unknown; archived?: unknown }) ?? {};

  const data: Record<string, unknown> = {};

  if (typeof archived === "boolean") data.archivedAt = archived ? new Date() : null;

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
      if (!quote || quote.clientId !== (typeof clientId === "string" ? clientId : existing.clientId)) {
        return Response.json({ error: "Просчёт не найден у этого клиента." }, { status: 400 });
      }
      data.quoteId = quoteId;
    }
  }

  let items: ParsedItemInput[] | undefined;
  if (rawItems !== undefined) {
    const parsed = parseItems(rawItems);
    if ("error" in parsed) {
      return Response.json({ error: parsed.error }, { status: 400 });
    }
    items = parsed;
    data.totalRub = items.reduce(
      (orderSum, item) => orderSum + item.services.reduce((itemSum, s) => itemSum + s.priceRub * s.quantity, 0),
      0,
    );
  }

  if (items) {
    await prisma.fulfillmentOrderItem.deleteMany({ where: { orderId: id } });
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
                services: { create: item.services },
              })),
            },
          }
        : {}),
    },
    include: {
      client: { select: { id: true, name: true, company: true } },
      manager: { select: { id: true, name: true } },
      quote: { select: { id: true, displayId: true, productName: true } },
      items: {
        orderBy: { createdAt: "asc" },
        include: {
          services: { include: { completedByManager: { select: { id: true, name: true } } } },
        },
      },
    },
  });

  return Response.json({ order });
}

// Hard delete — cascade removes items/services (see onDelete: Cascade in
// prisma/schema.prisma). Same access scope as edit (own orders, senior's
// team, or owner), not owner-only: this is day-to-day warehouse
// record-keeping, same reasoning as who can create one in the first place.
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
