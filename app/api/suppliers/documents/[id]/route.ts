import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";

interface RouteParams {
  params: Promise<{ id: string }>;
}

async function loadRecord(fileId: string) {
  const record = await prisma.deskFile.findUnique({ where: { id: fileId } });
  if (!record || record.tab !== "supplier_document") return null;
  return record;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  const { id } = await params;
  const record = await loadRecord(id);
  if (!record) {
    return Response.json({ error: "Файл не найден." }, { status: 404 });
  }

  // ?preview=1 — та же ручка, только "inline" вместо "attachment", как и у
  // документов клиента (app/api/manager-client-files/[id]/route.ts).
  const isPreview = new URL(req.url).searchParams.get("preview") === "1";
  const buffer = await storage.get(record.storageKey);
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": record.mimeType,
      "Content-Disposition": `${isPreview ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(record.originalName)}`,
      "Content-Length": String(record.size),
    },
  });
}

// Удалить может только автор загрузки или руководитель — тот же принцип,
// что и документы клиента и сама карточка поставщика.
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  const { id } = await params;
  const record = await loadRecord(id);
  if (!record) {
    return Response.json({ error: "Файл не найден." }, { status: 404 });
  }
  if (session.role !== "owner" && record.uploadedByManagerId !== session.managerId) {
    return Response.json({ error: "Удалить файл может только автор загрузки или руководитель." }, { status: 403 });
  }

  await storage.delete(record.storageKey);
  await prisma.deskFile.delete({ where: { id } });
  return Response.json({ ok: true });
}
