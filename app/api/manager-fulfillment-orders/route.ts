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
  const orders = await prisma.fulfillmentOrder.findMany({
    where: {
      ...(visibleManagerIds === "all" ? {} : { managerId: { in: visibleManagerIds } }),
      ...(clientId ? { clientId } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: {
      client: { select: { id: true, name: true, company: true } },
      manager: { select: { id: true, name: true } },
      quote: { select: { id: true, displayId: true, productName: true } },
      items: true,
    },
  });

  return Response.json({ orders });
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
  const { clientId, quoteId, items } =
    (body as { clientId?: unknown; quoteId?: unknown; items?: unknown }) ?? {};

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

  if (!Array.isArray(items) || items.length === 0) {
    return Response.json({ error: "Выберите хотя бы одну услугу." }, { status: 400 });
  }
  const parsedItems: { serviceItemId: string | null; name: string; priceRub: number; quantity: number }[] = [];
  for (const raw of items) {
    const item = raw as { serviceItemId?: unknown; name?: unknown; priceRub?: unknown; quantity?: unknown };
    const name = typeof item.name === "string" ? item.name.trim() : "";
    const priceRub = Number(item.priceRub);
    const quantity = Number(item.quantity);
    if (!name || !Number.isFinite(priceRub) || priceRub < 0 || !Number.isInteger(quantity) || quantity <= 0) {
      return Response.json({ error: "Некорректная услуга в списке." }, { status: 400 });
    }
    parsedItems.push({
      serviceItemId: typeof item.serviceItemId === "string" && item.serviceItemId ? item.serviceItemId : null,
      name,
      priceRub,
      quantity,
    });
  }
  const totalRub = parsedItems.reduce((sum, item) => sum + item.priceRub * item.quantity, 0);

  const order = await prisma.fulfillmentOrder.create({
    data: {
      displayId: await nextFulfillmentOrderDisplayId(),
      clientId,
      quoteId: resolvedQuoteId,
      managerId: session.managerId,
      totalRub,
      items: { create: parsedItems },
    },
    include: {
      client: { select: { id: true, name: true, company: true } },
      manager: { select: { id: true, name: true } },
      quote: { select: { id: true, displayId: true, productName: true } },
      items: true,
    },
  });

  return Response.json({ order }, { status: 201 });
}
