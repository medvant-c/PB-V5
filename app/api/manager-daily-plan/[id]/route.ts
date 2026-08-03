import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { prisma } from "@/lib/prisma";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// Own items only — a personal checklist, not a shared record; not even
// the owner can edit someone else's (see manager-daily-plan-summary for
// the owner/senior's read-only cross-manager view).
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  const { id } = await params;
  const existing = await prisma.dailyPlanItem.findUnique({ where: { id } });
  if (!existing) return Response.json({ error: "Пункт не найден." }, { status: 404 });
  if (existing.managerId !== session.managerId) {
    return Response.json({ error: "Нет доступа к этому пункту." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Некорректный запрос." }, { status: 400 });
  }
  const { done, acknowledged } = (body as { done?: unknown; acknowledged?: unknown }) ?? {};
  if (typeof done !== "boolean" && acknowledged !== true) {
    return Response.json({ error: "Некорректный запрос." }, { status: 400 });
  }

  const item = await prisma.dailyPlanItem.update({
    where: { id },
    data: {
      ...(typeof done === "boolean" ? { doneAt: done ? new Date() : null } : {}),
      // One-way — the pop-up's whole point is proof the manager actually
      // saw the task, so there's no "un-acknowledge" action to pair it
      // with (unlike doneAt, which toggles freely).
      ...(acknowledged === true ? { acknowledgedAt: new Date() } : {}),
    },
  });

  return Response.json({ item });
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  const { id } = await params;
  const existing = await prisma.dailyPlanItem.findUnique({ where: { id } });
  if (!existing) return Response.json({ error: "Пункт не найден." }, { status: 404 });
  if (existing.managerId !== session.managerId) {
    return Response.json({ error: "Нет доступа к этому пункту." }, { status: 403 });
  }

  await prisma.dailyPlanItem.delete({ where: { id } });
  return Response.json({ ok: true });
}
