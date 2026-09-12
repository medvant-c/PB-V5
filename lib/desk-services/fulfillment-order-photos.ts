import "server-only";
import { prisma } from "@/lib/prisma";

// Подтягивает фото карточки товара (DeskFile, tab: fulfillment_product_card)
// для каждой позиции заказа по её productCardId — одним батч-запросом на
// весь список заказов, а не по одному на позицию. Используется и в списке
// заказов, и при возврате одного заказа после create/update, чтобы фото
// появлялось сразу, без перезагрузки. См. PB-V5 chat 2026-09-12.
async function withItemPhotoIds<T extends { items: { productCardId: string | null }[] }>(
  orders: T[],
): Promise<(T & { items: (T["items"][number] & { photoId: string | null })[] })[]> {
  const cardIds = [...new Set(orders.flatMap((o) => o.items.map((i) => i.productCardId).filter((v): v is string => Boolean(v))))];
  const photoIdByCardId = new Map<string, string>();
  if (cardIds.length > 0) {
    const photos = await prisma.deskFile.findMany({
      where: { tab: "fulfillment_product_card", relatedId: { in: cardIds } },
      select: { id: true, relatedId: true },
    });
    for (const photo of photos) {
      if (photo.relatedId) photoIdByCardId.set(photo.relatedId, photo.id);
    }
  }
  return orders.map((order) => ({
    ...order,
    items: order.items.map((item) => ({
      ...item,
      photoId: item.productCardId ? photoIdByCardId.get(item.productCardId) ?? null : null,
    })),
  }));
}

export { withItemPhotoIds };
