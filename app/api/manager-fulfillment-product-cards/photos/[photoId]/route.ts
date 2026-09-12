import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { canAccessManagerClient } from "@/lib/manager-scope";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";

interface RouteParams {
  params: Promise<{ photoId: string }>;
}

// Отдаёт фото карточки товара клиента фулфилмента inline — тот же паттерн,
// что и /api/manager-quotes/photos/[photoId].
export async function GET(req: NextRequest, { params }: RouteParams) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  const { photoId } = await params;
  const record = await prisma.deskFile.findUnique({ where: { id: photoId } });
  if (!record || record.tab !== "fulfillment_product_card" || !record.relatedId) {
    return Response.json({ error: "Файл не найден." }, { status: 404 });
  }

  const card = await prisma.fulfillmentProductCard.findUnique({
    where: { id: record.relatedId },
    select: { client: { select: { id: true, createdByManagerId: true } } },
  });
  if (!card || !(await canAccessManagerClient(session, card.client))) {
    return Response.json({ error: "Нет доступа к этому файлу." }, { status: 403 });
  }

  const buffer = await storage.get(record.storageKey);
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": record.mimeType,
      "Content-Length": String(record.size),
      "Cache-Control": "private, max-age=3600",
    },
  });
}
