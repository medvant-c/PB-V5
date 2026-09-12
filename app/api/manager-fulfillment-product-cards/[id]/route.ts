import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { canAccessManagerClient } from "@/lib/manager-scope";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

async function loadCardWithAccess(session: Awaited<ReturnType<typeof getManagerSessionFromRequest>>, id: string) {
  const card = await prisma.fulfillmentProductCard.findUnique({
    where: { id },
    include: { client: { select: { id: true, createdByManagerId: true } }, services: { orderBy: { createdAt: "asc" } } },
  });
  if (!card) return { error: Response.json({ error: "Карточка не найдена." }, { status: 404 }) } as const;
  if (!session || !(await canAccessManagerClient(session, card.client))) {
    return { error: Response.json({ error: "Этот клиент вне вашей зоны видимости." }, { status: 403 }) } as const;
  }
  return { card } as const;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }
  const { id } = await params;
  const result = await loadCardWithAccess(session, id);
  if ("error" in result) return result.error;

  const photo = await prisma.deskFile.findFirst({ where: { tab: "fulfillment_product_card", relatedId: id }, select: { id: true } });
  return Response.json({ card: { ...result.card, photoId: photo?.id ?? null } });
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }
  const { id } = await params;
  const result = await loadCardWithAccess(session, id);
  if ("error" in result) return result.error;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return Response.json({ error: "Некорректный запрос." }, { status: 400 });
  }

  const str = (key: string): string | null | undefined => {
    if (!formData.has(key)) return undefined;
    const v = formData.get(key);
    return typeof v === "string" && v.trim() ? v.trim() : null;
  };
  const data: Record<string, unknown> = {};
  const name = str("name");
  if (name !== undefined) {
    if (!name) return Response.json({ error: "Укажите название товара." }, { status: 400 });
    data.name = name;
  }
  for (const key of ["sku", "description", "dimensions", "packaging", "barcodeWb", "barcodeOzon", "barcodeYm", "barcodeAmazon"] as const) {
    const value = str(key);
    if (value !== undefined) data[key] = value;
  }
  if (formData.has("marketplaceFlow")) {
    const raw = formData.get("marketplaceFlow");
    data.marketplaceFlow = raw === "fbs" || raw === "fbo" || raw === "both" ? raw : null;
  }
  if (formData.has("weightPerUnitKg")) {
    const raw = formData.get("weightPerUnitKg");
    const weight = typeof raw === "string" && raw.trim() ? Number(raw) : null;
    if (weight !== null && (!Number.isFinite(weight) || weight < 0)) {
      return Response.json({ error: "Некорректный вес за единицу." }, { status: 400 });
    }
    data.weightPerUnitKg = weight;
  }

  if (formData.get("removePhoto") === "true") {
    const existing = await prisma.deskFile.findFirst({ where: { tab: "fulfillment_product_card", relatedId: id } });
    if (existing) {
      await storage.delete(existing.storageKey).catch(() => {});
      await prisma.deskFile.delete({ where: { id: existing.id } });
    }
  }
  const photo = formData.get("photo");
  if (photo instanceof File && SUPPORTED_IMAGE_TYPES.has(photo.type) && photo.size <= MAX_PHOTO_BYTES) {
    try {
      const previous = await prisma.deskFile.findFirst({ where: { tab: "fulfillment_product_card", relatedId: id } });
      if (previous) {
        await storage.delete(previous.storageKey).catch(() => {});
        await prisma.deskFile.delete({ where: { id: previous.id } });
      }
      const buffer = Buffer.from(await photo.arrayBuffer());
      const stored = await storage.upload(buffer, photo.name);
      await prisma.deskFile.create({
        data: {
          tab: "fulfillment_product_card",
          relatedId: id,
          storageKey: stored.key,
          originalName: photo.name,
          mimeType: photo.type,
          size: stored.size,
        },
      });
    } catch (error) {
      console.error("Fulfillment product card: photo upload failed", error);
    }
  }

  const card = Object.keys(data).length > 0
    ? await prisma.fulfillmentProductCard.update({ where: { id }, data, include: { services: { orderBy: { createdAt: "asc" } } } })
    : await prisma.fulfillmentProductCard.findUnique({ where: { id }, include: { services: { orderBy: { createdAt: "asc" } } } });

  const photoRecord = await prisma.deskFile.findFirst({ where: { tab: "fulfillment_product_card", relatedId: id }, select: { id: true } });
  return Response.json({ card: { ...card, photoId: photoRecord?.id ?? null } });
}

// Удаление каскадно уносит FulfillmentProductCardService (onDelete: Cascade)
// и обнуляет productCardId у уже размещённых по этой карточке позиций
// заказов (onDelete: SetNull, сами позиции не трогает — снэпшот остаётся).
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }
  const { id } = await params;
  const result = await loadCardWithAccess(session, id);
  if ("error" in result) return result.error;

  const photo = await prisma.deskFile.findFirst({ where: { tab: "fulfillment_product_card", relatedId: id } });
  if (photo) {
    await storage.delete(photo.storageKey).catch(() => {});
    await prisma.deskFile.delete({ where: { id: photo.id } });
  }
  await prisma.fulfillmentProductCard.delete({ where: { id } });
  return Response.json({ ok: true });
}
