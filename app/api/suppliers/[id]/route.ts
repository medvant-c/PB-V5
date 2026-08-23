import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";

interface RouteParams {
  params: Promise<{ id: string }>;
}

function optionalString(value: unknown): string | null | undefined {
  if (typeof value !== "string") return undefined;
  return value.trim() ? value.trim() : null;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  const { id } = await params;
  const supplier = await prisma.supplier.findUnique({
    where: { id },
    include: { createdByManager: { select: { id: true, name: true } }, category: { select: { id: true, name: true, emoji: true } } },
  });
  if (!supplier) return Response.json({ error: "Поставщик не найден." }, { status: 404 });

  const photos = await prisma.deskFile.findMany({
    where: { tab: "supplier_showcase", relatedId: id },
    orderBy: { uploadedAt: "asc" },
    select: { id: true, originalName: true },
  });

  return Response.json({ supplier, photos });
}

// Правки доступны любому менеджеру — это общий, коллективно поддерживаемый
// справочник (например, обновить телефон поставщика может тот, кто узнал
// об этом первым, не только автор карточки).
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  const { id } = await params;
  const existing = await prisma.supplier.findUnique({ where: { id } });
  if (!existing) return Response.json({ error: "Поставщик не найден." }, { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Некорректный запрос." }, { status: 400 });
  }
  const fields = (body as Record<string, unknown>) ?? {};
  const data: Record<string, unknown> = {};
  if (typeof fields.name === "string" && fields.name.trim()) data.name = fields.name.trim();
  for (const key of ["description", "paymentInfo", "location", "contactPerson", "wechat", "whatsapp", "email", "phone"] as const) {
    const value = optionalString(fields[key]);
    if (value !== undefined) data[key] = value;
  }

  const supplier = await prisma.supplier.update({ where: { id }, data });
  return Response.json({ supplier });
}

// Удалить может только автор карточки или руководитель — тот же принцип,
// что удаление файла в components/manager/client-files-panel.tsx (не даёт
// одному менеджеру стереть работу другого в общей базе).
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  const { id } = await params;
  const existing = await prisma.supplier.findUnique({ where: { id } });
  if (!existing) return Response.json({ error: "Поставщик не найден." }, { status: 404 });
  if (session.role !== "owner" && existing.createdByManagerId !== session.managerId) {
    return Response.json({ error: "Удалить может только автор карточки или руководитель." }, { status: 403 });
  }

  const photos = await prisma.deskFile.findMany({ where: { tab: "supplier_showcase", relatedId: id } });
  for (const photo of photos) {
    await storage.delete(photo.storageKey);
  }
  await prisma.deskFile.deleteMany({ where: { tab: "supplier_showcase", relatedId: id } });
  await prisma.supplier.delete({ where: { id } });

  return Response.json({ ok: true });
}
