import { NextRequest } from "next/server";
import { getClientIdFromRequest } from "@/lib/client-auth";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";

interface RouteParams {
  params: Promise<{ photoId: string }>;
}

// Client-scoped mirror of /api/manager-quotes/photos/[photoId] — same file,
// gated by "does this quote's photo belong to a quote of MY clientId"
// instead of a manager session.
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

  const buffer = await storage.get(record.storageKey);
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": record.mimeType,
      "Content-Length": String(record.size),
      "Cache-Control": "private, max-age=3600",
    },
  });
}
