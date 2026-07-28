import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { getVisibleManagerIds } from "@/lib/manager-scope";
import { prisma } from "@/lib/prisma";
import { nextQuoteDraftRequestDisplayId } from "@/lib/display-ids";

// Scoped the same as everything else — a plain manager sees only their own
// drafts, senior also sees their team's. Done drafts are hidden by default
// (once handled — built into a real quote or turned out unnecessary —
// there's no reason for them to keep cluttering the "к выполнению" list).
export async function GET(req: NextRequest) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  const visibleManagerIds = await getVisibleManagerIds(session);
  const clientId = req.nextUrl.searchParams.get("clientId");
  const includeDone = req.nextUrl.searchParams.get("includeDone") === "1";

  const drafts = await prisma.quoteDraftRequest.findMany({
    where: {
      ...(visibleManagerIds === "all" ? {} : { managerId: { in: visibleManagerIds } }),
      ...(clientId ? { clientId } : {}),
      ...(includeDone ? {} : { done: false }),
    },
    orderBy: { createdAt: "asc" },
    include: { manager: { select: { id: true, name: true } } },
  });

  return Response.json({ drafts });
}

export async function POST(req: NextRequest) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Некорректный запрос." }, { status: 400 });
  }
  const { clientId, note } = (body as { clientId?: unknown; note?: unknown }) ?? {};
  if (typeof clientId !== "string" || !clientId) {
    return Response.json({ error: "Укажите клиента." }, { status: 400 });
  }
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) return Response.json({ error: "Клиент не найден." }, { status: 404 });
  if (typeof note !== "string" || !note.trim()) {
    return Response.json({ error: "Опишите, что нужно посчитать." }, { status: 400 });
  }

  const draft = await prisma.quoteDraftRequest.create({
    data: {
      displayId: await nextQuoteDraftRequestDisplayId(),
      clientId,
      managerId: session.managerId,
      note: note.trim(),
    },
    include: { manager: { select: { id: true, name: true } } },
  });

  return Response.json({ draft }, { status: 201 });
}
