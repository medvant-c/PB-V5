import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { canAccessManagerClient } from "@/lib/manager-scope";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";

interface RouteParams {
  params: Promise<{ id: string }>;
}

async function loadRecordIfVisible(fileId: string, session: NonNullable<Awaited<ReturnType<typeof getManagerSessionFromRequest>>>) {
  const record = await prisma.deskFile.findUnique({ where: { id: fileId } });
  if (!record || record.tab !== "manager_client_files" || !record.relatedId) return null;

  const client = await prisma.client.findUnique({ where: { id: record.relatedId } });
  if (!client) return null;

  if (!(await canAccessManagerClient(session, client))) {
    return null;
  }
  return record;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  const { id } = await params;
  const record = await loadRecordIfVisible(id, session);
  if (!record) {
    return Response.json({ error: "Файл не найден." }, { status: 404 });
  }

  // ?preview=1 — та же самая ручка, только "inline" вместо "attachment":
  // браузер сам умеет показать картинку/PDF по месту (в <img>/<iframe>),
  // не скачивая файл — обычная ссылка «Скачать» по-прежнему форсирует
  // Save As. См. PB-V5 chat 2026-08-23.
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

// Same rule as the "База данных" tab: delete is restricted to whoever
// uploaded the document or the owner, so one manager can't wipe out a
// contract or invoice scan a colleague uploaded for a shared client.
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  const { id } = await params;
  const record = await loadRecordIfVisible(id, session);
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
