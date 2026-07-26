import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  const { id } = await params;
  const record = await prisma.deskFile.findUnique({ where: { id } });
  if (!record || record.tab !== "manager_database") {
    return Response.json({ error: "Файл не найден." }, { status: 404 });
  }

  const buffer = await storage.get(record.storageKey);
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": record.mimeType,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(record.originalName)}`,
      "Content-Length": String(record.size),
    },
  });
}

// Anyone can upload to the shared file store, but deleting is restricted to
// whoever uploaded it (or the owner) — otherwise any manager could wipe
// another manager's documents out from under them.
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  const { id } = await params;
  const record = await prisma.deskFile.findUnique({ where: { id } });
  if (!record || record.tab !== "manager_database") {
    return Response.json({ error: "Файл не найден." }, { status: 404 });
  }
  if (session.role !== "owner" && record.uploadedByManagerId !== session.managerId) {
    return Response.json({ error: "Удалить файл может только автор загрузки или руководитель." }, { status: 403 });
  }

  await storage.delete(record.storageKey);
  await prisma.deskFile.delete({ where: { id } });
  return Response.json({ ok: true });
}
