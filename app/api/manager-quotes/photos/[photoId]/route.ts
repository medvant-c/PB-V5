import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { canAccessManagerQuote } from "@/lib/manager-scope";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";

interface RouteParams {
  params: Promise<{ photoId: string }>;
}

// Serves a quote's uploaded photo inline (for <img src> previews in the
// edit dialog) — separate from /api/desk-files/[id], which is gated by the
// old shared-password /desk session, not a manager session.
export async function GET(req: NextRequest, { params }: RouteParams) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  const { photoId } = await params;
  const record = await prisma.deskFile.findUnique({ where: { id: photoId } });
  if (!record || record.tab !== "quotes" || !record.relatedId) {
    return Response.json({ error: "Файл не найден." }, { status: 404 });
  }

  const quote = await prisma.quote.findUnique({ where: { id: record.relatedId }, select: { managerId: true } });
  if (!quote || !(await canAccessManagerQuote(session, quote.managerId))) {
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
