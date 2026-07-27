import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { prisma } from "@/lib/prisma";

interface RouteParams {
  params: Promise<{ id: string }>;
}

function requireOwner(session: { role: string } | null) {
  return session !== null && session.role === "owner";
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const session = await getManagerSessionFromRequest(req);
  if (!requireOwner(session)) {
    return Response.json({ error: "Доступно только руководителю." }, { status: 403 });
  }

  const { id } = await params;
  const existing = await prisma.cashCategory.findUnique({ where: { id } });
  if (!existing) return Response.json({ error: "Статья не найдена." }, { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Некорректный запрос." }, { status: 400 });
  }
  const { name } = (body as { name?: unknown }) ?? {};
  if (typeof name !== "string" || !name.trim()) {
    return Response.json({ error: "Укажите название статьи." }, { status: 400 });
  }
  const trimmed = name.trim();

  if (trimmed !== existing.name) {
    const conflict = await prisma.cashCategory.findUnique({ where: { type_name: { type: existing.type, name: trimmed } } });
    if (conflict) {
      return Response.json({ error: "Такая статья уже существует." }, { status: 409 });
    }
  }

  const category = await prisma.cashCategory.update({ where: { id }, data: { name: trimmed } });
  return Response.json({ category });
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const session = await getManagerSessionFromRequest(req);
  if (!requireOwner(session)) {
    return Response.json({ error: "Доступно только руководителю." }, { status: 403 });
  }

  const { id } = await params;
  const existing = await prisma.cashCategory.findUnique({ where: { id } });
  if (!existing) return Response.json({ error: "Статья не найдена." }, { status: 404 });

  const ordersCount = await prisma.cashOrder.count({ where: { categoryId: id } });
  if (ordersCount > 0) {
    return Response.json({ error: "Нельзя удалить статью, у неё есть операции." }, { status: 409 });
  }

  await prisma.cashCategory.delete({ where: { id } });
  return Response.json({ ok: true });
}
