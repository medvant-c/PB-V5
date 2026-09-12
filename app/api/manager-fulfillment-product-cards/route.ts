import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { canAccessManagerClient } from "@/lib/manager-scope";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";

const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

// Персистентные карточки товара клиента фулфилмента — доступны только
// менеджеру, закреплённому за этим клиентом (та же canAccessManagerClient,
// что и у карточки клиента на просчёт). См. план «Фулфилмент», PB-V5 chat
// 2026-09-11.
export async function GET(req: NextRequest) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  const clientId = req.nextUrl.searchParams.get("clientId");
  if (!clientId) {
    return Response.json({ error: "Укажите клиента." }, { status: 400 });
  }
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true, createdByManagerId: true } });
  if (!client) return Response.json({ error: "Клиент не найден." }, { status: 404 });
  if (!(await canAccessManagerClient(session, client))) {
    return Response.json({ error: "Этот клиент вне вашей зоны видимости." }, { status: 403 });
  }

  const cards = await prisma.fulfillmentProductCard.findMany({
    where: { clientId },
    orderBy: { createdAt: "asc" },
    include: { services: { orderBy: { createdAt: "asc" } } },
  });
  const photos = await prisma.deskFile.findMany({
    where: { tab: "fulfillment_product_card", relatedId: { in: cards.map((c) => c.id) } },
    select: { id: true, relatedId: true },
  });
  const photoIdByCardId = new Map(photos.map((p) => [p.relatedId, p.id]));

  return Response.json({
    cards: cards.map((card) => ({ ...card, photoId: photoIdByCardId.get(card.id) ?? null })),
  });
}

export async function POST(req: NextRequest) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return Response.json({ error: "Некорректный запрос." }, { status: 400 });
  }

  const clientId = formData.get("clientId");
  if (typeof clientId !== "string" || !clientId) {
    return Response.json({ error: "Укажите клиента." }, { status: 400 });
  }
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true, createdByManagerId: true, kind: true } });
  if (!client) return Response.json({ error: "Клиент не найден." }, { status: 404 });
  if (client.kind !== "fulfillment") {
    return Response.json({ error: "Карточки товара доступны только клиентам фулфилмента." }, { status: 400 });
  }
  if (!(await canAccessManagerClient(session, client))) {
    return Response.json({ error: "Этот клиент вне вашей зоны видимости." }, { status: 403 });
  }

  const name = formData.get("name");
  if (typeof name !== "string" || !name.trim()) {
    return Response.json({ error: "Укажите название товара." }, { status: 400 });
  }
  const str = (key: string): string | null => {
    const v = formData.get(key);
    return typeof v === "string" && v.trim() ? v.trim() : null;
  };
  const weightRaw = formData.get("weightPerUnitKg");
  const weightPerUnitKg = typeof weightRaw === "string" && weightRaw.trim() ? Number(weightRaw) : null;
  if (weightPerUnitKg !== null && (!Number.isFinite(weightPerUnitKg) || weightPerUnitKg < 0)) {
    return Response.json({ error: "Некорректный вес за единицу." }, { status: 400 });
  }

  const card = await prisma.fulfillmentProductCard.create({
    data: {
      clientId,
      name: name.trim(),
      sku: str("sku"),
      description: str("description"),
      dimensions: str("dimensions"),
      weightPerUnitKg,
      packaging: str("packaging"),
    },
    include: { services: true },
  });

  const photo = formData.get("photo");
  let photoId: string | null = null;
  if (photo instanceof File && SUPPORTED_IMAGE_TYPES.has(photo.type) && photo.size <= MAX_PHOTO_BYTES) {
    try {
      const buffer = Buffer.from(await photo.arrayBuffer());
      const stored = await storage.upload(buffer, photo.name);
      const file = await prisma.deskFile.create({
        data: {
          tab: "fulfillment_product_card",
          relatedId: card.id,
          storageKey: stored.key,
          originalName: photo.name,
          mimeType: photo.type,
          size: stored.size,
        },
      });
      photoId = file.id;
    } catch (error) {
      console.error("Fulfillment product card: photo upload failed", error);
    }
  }

  return Response.json({ card: { ...card, photoId } }, { status: 201 });
}
