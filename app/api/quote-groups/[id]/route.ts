import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { canAccessManagerClient } from "@/lib/manager-scope";
import { prisma } from "@/lib/prisma";

interface RouteParams {
  params: Promise<{ id: string }>;
}

async function loadVisibleGroup(groupId: string, session: NonNullable<Awaited<ReturnType<typeof getManagerSessionFromRequest>>>) {
  const group = await prisma.quoteGroup.findUnique({ where: { id: groupId }, include: { client: true } });
  if (!group) return null;
  if (!(await canAccessManagerClient(session, group.client))) return null;
  return group;
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  const { id } = await params;
  const group = await loadVisibleGroup(id, session);
  if (!group) return Response.json({ error: "Группа не найдена." }, { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Некорректный запрос." }, { status: 400 });
  }
  const { name } = (body as { name?: unknown }) ?? {};
  if (typeof name !== "string" || !name.trim()) {
    return Response.json({ error: "Укажите название группы." }, { status: 400 });
  }

  const conflict = await prisma.quoteGroup.findUnique({
    where: { clientId_name: { clientId: group.clientId, name: name.trim() } },
  });
  if (conflict && conflict.id !== id) {
    return Response.json({ error: "У этого клиента уже есть такая группа." }, { status: 409 });
  }

  const updated = await prisma.quoteGroup.update({ where: { id }, data: { name: name.trim() } });
  return Response.json({ group: updated });
}

// Не даёт удалить непустую группу — та же логика, что и везде в проекте
// (напр. категория поставщиков): просчёты сначала нужно переместить в
// другую группу или снять группу вручную.
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  const { id } = await params;
  const group = await loadVisibleGroup(id, session);
  if (!group) return Response.json({ error: "Группа не найдена." }, { status: 404 });

  const quoteCount = await prisma.quote.count({ where: { groupId: id } });
  if (quoteCount > 0) {
    return Response.json({ error: "В группе есть просчёты — сначала переместите их или снимите группу." }, { status: 400 });
  }

  await prisma.quoteGroup.delete({ where: { id } });
  return Response.json({ ok: true });
}
