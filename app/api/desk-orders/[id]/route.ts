import { NextRequest } from "next/server";
import { hasDeskSession } from "@/lib/desk-auth";
import { OrderStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";

const VALID_STATUSES = new Set<string>(Object.values(OrderStatus));

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  if (!(await hasDeskSession(req))) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Некорректный запрос." }, { status: 400 });
  }

  const { status, note, markSeen, price } =
    (body as { status?: unknown; note?: unknown; markSeen?: unknown; price?: unknown }) ?? {};

  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) {
    return Response.json({ error: "Заказ не найден." }, { status: 404 });
  }

  // Lightweight path: the desk UI fires this when a manager expands an
  // order to view it, just to clear the "new" badge — no status/history
  // change involved.
  if (status === undefined && price === undefined && markSeen === true) {
    const updatedOrder = await prisma.order.update({
      where: { id },
      data: { seenByManager: true },
      include: { events: { orderBy: { createdAt: "desc" } } },
    });
    return Response.json({ order: updatedOrder });
  }

  // Price edit / discount — the manager just types the final price (either
  // computed from a % off, or a manual override); it's stored as free text
  // like the rest of the pricing system (see ServiceCatalogItem.price),
  // since prices here aren't always clean numbers ("по расчёту" etc).
  if (status === undefined && typeof price === "string") {
    if (!price.trim()) {
      return Response.json({ error: "Укажите цену." }, { status: 400 });
    }
    const updatedOrder = await prisma.order.update({
      where: { id },
      data: { price: price.trim() },
      include: { events: { orderBy: { createdAt: "desc" } }, serviceCatalogItem: { select: { code: true } } },
    });
    return Response.json({ order: updatedOrder });
  }

  if (typeof status !== "string" || !VALID_STATUSES.has(status)) {
    return Response.json({ error: "Некорректный статус." }, { status: 400 });
  }

  // Status and its history entry are written together — they must never
  // drift apart (the account dashboard's timeline is derived entirely from
  // OrderStatusEvent rows, not from Order.status alone). The event is
  // created first so the order.update's `include` below already sees it.
  // A manager changing the status obviously means they've seen the order.
  const [, updatedOrder] = await prisma.$transaction([
    prisma.orderStatusEvent.create({
      data: {
        orderId: id,
        status: status as OrderStatus,
        note: typeof note === "string" && note.trim() ? note.trim() : null,
      },
    }),
    prisma.order.update({
      where: { id },
      data: { status: status as OrderStatus, seenByManager: true },
      include: { events: { orderBy: { createdAt: "desc" } }, serviceCatalogItem: { select: { code: true } } },
    }),
  ]);

  return Response.json({ order: updatedOrder });
}

// Removes a service/order line entirely (and any documents attached to it) —
// e.g. the manager added the wrong service or the client cancelled one item
// from their request before it's confirmed.
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  if (!(await hasDeskSession(req))) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  const { id } = await params;

  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) {
    return Response.json({ error: "Заказ не найден." }, { status: 404 });
  }

  const attachedFiles = await prisma.deskFile.findMany({ where: { tab: "orders", relatedId: id } });
  for (const file of attachedFiles) {
    await storage.delete(file.storageKey);
  }

  await prisma.$transaction([
    prisma.deskFile.deleteMany({ where: { tab: "orders", relatedId: id } }),
    prisma.orderStatusEvent.deleteMany({ where: { orderId: id } }),
    prisma.order.delete({ where: { id } }),
  ]);

  return Response.json({ ok: true });
}
