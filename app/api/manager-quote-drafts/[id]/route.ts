import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { getVisibleManagerIds } from "@/lib/manager-scope";
import { prisma } from "@/lib/prisma";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// Scoped by the CLIENT's current manager, not the draft's original author
// — same reasoning as the GET route above. A manager who just inherited a
// reassigned client must be able to mark/delete that client's existing
// draft requests, even if a different manager (or the owner) created them.
async function canAccessDraft(session: { role: string; managerId: string }, clientManagerId: string | null): Promise<boolean> {
  const visibleManagerIds = await getVisibleManagerIds(session as never);
  return visibleManagerIds === "all" || (clientManagerId !== null && visibleManagerIds.includes(clientManagerId));
}

// Mark done (a real Quote was built, or it's no longer needed) or edit the
// note.
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  const { id } = await params;
  const existing = await prisma.quoteDraftRequest.findUnique({ where: { id }, include: { client: { select: { createdByManagerId: true } } } });
  if (!existing) return Response.json({ error: "Черновик не найден." }, { status: 404 });
  if (!(await canAccessDraft(session, existing.client.createdByManagerId))) {
    return Response.json({ error: "Нет доступа к этому черновику." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Некорректный запрос." }, { status: 400 });
  }
  const { note, done } = (body as { note?: unknown; done?: unknown }) ?? {};
  const data: Record<string, unknown> = {};
  if (typeof note === "string" && note.trim()) data.note = note.trim();
  if (typeof done === "boolean") data.done = done;

  const draft = await prisma.quoteDraftRequest.update({
    where: { id },
    data,
    include: { manager: { select: { id: true, name: true } } },
  });
  return Response.json({ draft });
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  const { id } = await params;
  const existing = await prisma.quoteDraftRequest.findUnique({ where: { id }, include: { client: { select: { createdByManagerId: true } } } });
  if (!existing) return Response.json({ error: "Черновик не найден." }, { status: 404 });
  if (!(await canAccessDraft(session, existing.client.createdByManagerId))) {
    return Response.json({ error: "Нет доступа к этому черновику." }, { status: 403 });
  }

  await prisma.quoteDraftRequest.delete({ where: { id } });
  return Response.json({ ok: true });
}
