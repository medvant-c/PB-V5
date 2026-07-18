import "server-only";
import { prisma } from "@/lib/prisma";

// Shared by both the desk-side "add service to client" flow and the client's
// own cart checkout — either way, an Order is just a snapshot of a
// ServiceCatalogItem at the moment it's added, tied to a client.
// seenByManager defaults to true (a manager creating the order has, by
// definition, already seen it) — the client cart-checkout route explicitly
// passes false so the desk UI can badge it as new/unreviewed.
async function createOrderFromCatalogItem(
  clientId: string,
  serviceCatalogItemId: string,
  options?: { seenByManager?: boolean },
) {
  const serviceCatalogItem = await prisma.serviceCatalogItem.findUnique({ where: { id: serviceCatalogItemId } });
  if (!serviceCatalogItem) return null;

  return prisma.order.create({
    data: {
      clientId,
      direction: serviceCatalogItem.direction,
      title: serviceCatalogItem.name,
      price: serviceCatalogItem.price,
      serviceCatalogItemId: serviceCatalogItem.id,
      seenByManager: options?.seenByManager ?? true,
      events: { create: { status: "new" } },
    },
    include: { events: { orderBy: { createdAt: "desc" } } },
  });
}

export { createOrderFromCatalogItem };
