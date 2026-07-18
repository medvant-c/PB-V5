import { NextRequest } from "next/server";
import { getClientIdFromRequest } from "@/lib/client-auth";
import { createOrderFromCatalogItem } from "@/lib/create-order";
import { sendManagerOrderNotification } from "@/lib/account-email";
import { isRateLimited } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 5;
const MAX_CART_ITEMS = 20;

// Client's own "submit cart" checkout — creates one Order per selected
// catalog item under the logged-in client, same snapshot logic the desk
// side uses when a manager adds a service by hand.
export async function POST(req: NextRequest) {
  const clientId = await getClientIdFromRequest(req);
  if (!clientId) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  if (isRateLimited(`account-orders:${clientId}`, RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX_REQUESTS)) {
    return Response.json({ error: "Слишком много запросов. Подождите немного." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Некорректный запрос." }, { status: 400 });
  }

  const { serviceCatalogItemIds } = (body as { serviceCatalogItemIds?: unknown }) ?? {};
  if (
    !Array.isArray(serviceCatalogItemIds) ||
    serviceCatalogItemIds.length === 0 ||
    serviceCatalogItemIds.length > MAX_CART_ITEMS ||
    !serviceCatalogItemIds.every((id) => typeof id === "string" && id)
  ) {
    return Response.json({ error: "Корзина пуста или некорректна." }, { status: 400 });
  }

  const orders = [];
  for (const serviceCatalogItemId of serviceCatalogItemIds as string[]) {
    const order = await createOrderFromCatalogItem(clientId, serviceCatalogItemId, { seenByManager: false });
    if (order) orders.push(order);
  }

  if (orders.length === 0) {
    return Response.json({ error: "Не удалось оформить заявку — услуги не найдены." }, { status: 404 });
  }

  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (client) {
    await sendManagerOrderNotification(client.name, client.email, orders.map((order) => order.title));
  }

  return Response.json({ orders }, { status: 201 });
}
