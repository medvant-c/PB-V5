import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { prisma } from "@/lib/prisma";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// Owner-only, per-quote reassignment — deliberately separate from
// transferToManagerId on PATCH /api/manager-clients/[id], which moves a
// client's ENTIRE quote history to a new manager at once. This lets the
// owner move a single quote (so its premium counts for whoever actually
// worked it) while the client stays assigned to their usual manager and
// every other quote keeps its own managerId untouched.
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }
  if (session.role !== "owner") {
    return Response.json({ error: "Передавать просчёты может только руководитель." }, { status: 403 });
  }

  const { id } = await params;
  const quote = await prisma.quote.findUnique({ where: { id }, select: { id: true } });
  if (!quote) {
    return Response.json({ error: "Просчёт не найден." }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Некорректный запрос." }, { status: 400 });
  }
  const { managerId } = (body as { managerId?: unknown }) ?? {};
  if (typeof managerId !== "string" || !managerId) {
    return Response.json({ error: "Укажите менеджера." }, { status: 400 });
  }

  const newManager = await prisma.manager.findUnique({ where: { id: managerId }, select: { id: true, name: true } });
  if (!newManager) {
    return Response.json({ error: "Менеджер не найден." }, { status: 404 });
  }

  const updated = await prisma.quote.update({
    where: { id },
    data: { managerId },
    select: { id: true, managerId: true, manager: { select: { name: true } } },
  });

  return Response.json({ quote: updated });
}
