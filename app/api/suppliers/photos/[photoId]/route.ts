import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";

interface RouteParams {
  params: Promise<{ photoId: string }>;
}

// Отдаёт фото витрины поставщика — без доп. scoping (кроме самой сессии):
// «База поставщиков» общая для всех менеджеров, в отличие от фото просчёта
// (app/api/manager-quotes/photos/[photoId]/route.ts), где нужен
// canAccessManagerQuote.
export async function GET(req: NextRequest, { params }: RouteParams) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  const { photoId } = await params;
  const record = await prisma.deskFile.findUnique({ where: { id: photoId } });
  if (!record || record.tab !== "supplier_showcase") {
    return Response.json({ error: "Файл не найден." }, { status: 404 });
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
