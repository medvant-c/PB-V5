import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { canAccessManagerClient } from "@/lib/manager-scope";
import { prisma } from "@/lib/prisma";

interface RouteParams {
  params: Promise<{ id: string }>;
}

async function loadVisibleClient(clientId: string, session: NonNullable<Awaited<ReturnType<typeof getManagerSessionFromRequest>>>) {
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) return null;
  if (!(await canAccessManagerClient(session, client))) return null;
  return client;
}

// Произвольные папки-группы просчётов ("Мебель", "Оборудование" и т.п.) —
// свои у каждого клиента, заводятся менеджером по желанию, чисто для
// сортировки/фильтра, никак не влияют на расчёты. См. QuoteGroup в
// prisma/schema.prisma, PB-V5 chat 2026-08-27.
export async function GET(req: NextRequest, { params }: RouteParams) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  const { id } = await params;
  const client = await loadVisibleClient(id, session);
  if (!client) return Response.json({ error: "Клиент не найден или вне вашей зоны видимости." }, { status: 404 });

  const groups = await prisma.quoteGroup.findMany({
    where: { clientId: id },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { _count: { select: { quotes: true } } },
  });

  return Response.json({
    groups: groups.map((g) => ({ id: g.id, name: g.name, sortOrder: g.sortOrder, quoteCount: g._count.quotes })),
  });
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  const { id } = await params;
  const client = await loadVisibleClient(id, session);
  if (!client) return Response.json({ error: "Клиент не найден или вне вашей зоны видимости." }, { status: 404 });

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

  const existing = await prisma.quoteGroup.findUnique({ where: { clientId_name: { clientId: id, name: name.trim() } } });
  if (existing) {
    return Response.json({ error: "У этого клиента уже есть такая группа." }, { status: 409 });
  }

  const last = await prisma.quoteGroup.findFirst({ where: { clientId: id }, orderBy: { sortOrder: "desc" } });
  const group = await prisma.quoteGroup.create({
    data: { clientId: id, name: name.trim(), sortOrder: (last?.sortOrder ?? 0) + 1 },
  });

  return Response.json({ group }, { status: 201 });
}
