import { NextRequest } from "next/server";
import { hasDeskSession } from "@/lib/desk-auth";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  if (!(await hasDeskSession(req))) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  const { id } = await params;
  const record = await prisma.deskFile.findUnique({ where: { id } });
  if (!record) {
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

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  if (!(await hasDeskSession(req))) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  const { id } = await params;
  const record = await prisma.deskFile.findUnique({ where: { id } });
  if (!record) {
    return Response.json({ error: "Файл не найден." }, { status: 404 });
  }

  await storage.delete(record.storageKey);
  await prisma.deskFile.delete({ where: { id } });
  return Response.json({ ok: true });
}
