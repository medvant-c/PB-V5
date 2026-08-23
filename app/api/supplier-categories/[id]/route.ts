import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { prisma } from "@/lib/prisma";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  const { id } = await params;
  const existing = await prisma.supplierCategory.findUnique({ where: { id } });
  if (!existing) return Response.json({ error: "Категория не найдена." }, { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Некорректный запрос." }, { status: 400 });
  }
  const { name, emoji } = (body as { name?: unknown; emoji?: unknown }) ?? {};
  const data: Record<string, unknown> = {};
  if (typeof name === "string" && name.trim()) data.name = name.trim();
  if (typeof emoji === "string") data.emoji = emoji.trim() || null;

  const category = await prisma.supplierCategory.update({ where: { id }, data });
  return Response.json({ category });
}

// Не даёт удалить непустую категорию — та же логика "нельзя стереть, пока
// внутри что-то есть", что и везде в проекте (напр. клиент нельзя удалить,
// если у него есть просчёты — тут просто нет автопереноса, самих
// поставщиков придётся переместить/удалить вручную сначала).
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  const { id } = await params;
  const existing = await prisma.supplierCategory.findUnique({ where: { id }, include: { _count: { select: { suppliers: true } } } });
  if (!existing) return Response.json({ error: "Категория не найдена." }, { status: 404 });
  if (existing._count.suppliers > 0) {
    return Response.json({ error: "В категории есть поставщики — сначала перенесите или удалите их." }, { status: 400 });
  }

  await prisma.supplierCategory.delete({ where: { id } });
  return Response.json({ ok: true });
}
