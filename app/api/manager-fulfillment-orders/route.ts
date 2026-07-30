import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { getVisibleManagerIds } from "@/lib/manager-scope";
import { prisma } from "@/lib/prisma";
import { nextFulfillmentOrderDisplayId } from "@/lib/display-ids";

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

  return Response.json({ orders });
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

// Any manager can create one — this is day-to-day warehouse work, not
// something needing senior/owner sign-off (no self-report risk: the price
// list is fixed, quantities are visible/auditable on the order itself).
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
  const { clientId, quoteId, items: rawItems } = (body as { clientId?: unknown; quoteId?: unknown; items?: unknown }) ?? {};

  if (typeof clientId !== "string" || !clientId) {
    return Response.json({ error: "Укажите клиента." }, { status: 400 });
  }
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) return Response.json({ error: "Клиент не найден." }, { status: 404 });

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

  const totalRub = items.reduce(
    (orderSum, item) => orderSum + item.services.reduce((itemSum, s) => itemSum + s.priceRub * s.quantity, 0),
    0,
  );

  const order = await prisma.fulfillmentOrder.create({
    data: {
      displayId: await nextFulfillmentOrderDisplayId(),
      clientId,
      quoteId: resolvedQuoteId,
      managerId: session.managerId,
      totalRub,
      items: {
        create: items.map((item) => ({
          name: item.name,
          sku: item.sku,
          dimensions: item.dimensions,
          services: { create: item.services },
        })),
      },
    },
    include: {
      client: { select: { id: true, name: true, company: true } },
      manager: { select: { id: true, name: true } },
      quote: { select: { id: true, displayId: true, productName: true } },
      items: { include: { services: true } },
    },
  });

  return Response.json({ order }, { status: 201 });
}
