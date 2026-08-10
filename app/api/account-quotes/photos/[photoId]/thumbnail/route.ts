import { NextRequest } from "next/server";
import { getClientIdFromRequest } from "@/lib/client-auth";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";
import { renderPhotoThumbnail } from "@/lib/desk-services/photo-thumbnail";

interface RouteParams {
  params: Promise<{ photoId: string }>;
}

// Client-scoped mirror of /api/manager-quotes/photos/[photoId]/thumbnail —
// see that route's comment.
export async function GET(req: NextRequest, { params }: RouteParams) {
  const clientId = await getClientIdFromRequest(req);
  if (!clientId) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  const { photoId } = await params;
  const record = await prisma.deskFile.findUnique({ where: { id: photoId } });
  if (!record || record.tab !== "quotes" || !record.relatedId) {
    return Response.json({ error: "Файл не найден." }, { status: 404 });
  }

  const quote = await prisma.quote.findFirst({ where: { id: record.relatedId, clientId } });
  if (!quote) {
    return Response.json({ error: "Нет доступа к этому файлу." }, { status: 403 });
  }

  const buffer = await storage.getOrCreateVariant(record.storageKey, "thumb", renderPhotoThumbnail);
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "private, max-age=86400",
    },
  });
}
