import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { getVisibleManagerIds } from "@/lib/manager-scope";
import { prisma } from "@/lib/prisma";

// Mostly personal — every manager (including the owner, who can plan their
// own day too) sees and manages only their own items here. The one
// exception: POST accepts an optional `managerId` so an owner/senior can
// ASSIGN a task onto someone else's list (see DailyPlanItem.
// assignedByManagerId in prisma/schema.prisma) — the target manager still
// owns checking it off/deleting it afterward, same as anything they added
// themselves. The read-only cross-manager overview lives in a separate
// route (manager-daily-plan-summary).

function dayBounds(dateParam: string | null): { start: Date; end: Date } {
  // <input type="date">/query param is a plain "YYYY-MM-DD" — treated as a
  // UTC calendar day (same convention as CashOrder's date field elsewhere
  // in this app), not the browser's local midnight.
  const base = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? new Date(`${dateParam}T00:00:00.000Z`) : new Date();
  const start = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate()));
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

export async function GET(req: NextRequest) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  const { start, end } = dayBounds(req.nextUrl.searchParams.get("date"));

  const items = await prisma.dailyPlanItem.findMany({
    where: { managerId: session.managerId, planDate: { gte: start, lt: end } },
    orderBy: { createdAt: "asc" },
    include: {
      client: { select: { id: true, name: true, company: true } },
      quoteDraftRequest: { select: { id: true, displayId: true } },
    },
  });

  // assignedByManagerId is a plain string, no relation (see schema) —
  // resolved with one batch lookup rather than N+1 queries.
  const assignerIds = [...new Set(items.map((i) => i.assignedByManagerId).filter((id): id is string => Boolean(id)))];
  const assigners = assignerIds.length
    ? await prisma.manager.findMany({ where: { id: { in: assignerIds } }, select: { id: true, name: true } })
    : [];
  const assignerNameById = new Map(assigners.map((m) => [m.id, m.name]));

  return Response.json({
    items: items.map((item) => ({
      ...item,
      assignedByManagerName: item.assignedByManagerId ? (assignerNameById.get(item.assignedByManagerId) ?? null) : null,
    })),
  });
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
  const { note, clientId, quoteDraftRequestId, date, managerId } =
    (body as { note?: unknown; clientId?: unknown; quoteDraftRequestId?: unknown; date?: unknown; managerId?: unknown }) ?? {};

  if (typeof note !== "string" || !note.trim()) {
    return Response.json({ error: "Укажите, что запланировано." }, { status: 400 });
  }

  if (typeof clientId === "string" && clientId) {
    const client = await prisma.client.findUnique({ where: { id: clientId } });
    if (!client) return Response.json({ error: "Клиент не найден." }, { status: 404 });
  }
  if (typeof quoteDraftRequestId === "string" && quoteDraftRequestId) {
    const draft = await prisma.quoteDraftRequest.findUnique({ where: { id: quoteDraftRequestId } });
    if (!draft) return Response.json({ error: "Черновик не найден." }, { status: 404 });
  }

  // Targeting someone else's list is owner/senior only, and only within
  // their own visibility scope — same rule as everywhere else a
  // руководитель acts on a manager's behalf.
  let targetManagerId = session.managerId;
  let assignedByManagerId: string | null = null;
  if (typeof managerId === "string" && managerId && managerId !== session.managerId) {
    if (session.role !== "owner" && session.role !== "senior") {
      return Response.json({ error: "Ставить задачи другому менеджеру может только старший менеджер или руководитель." }, { status: 403 });
    }
    const visibleManagerIds = await getVisibleManagerIds(session);
    if (visibleManagerIds !== "all" && !visibleManagerIds.includes(managerId)) {
      return Response.json({ error: "Этот менеджер вне вашей зоны видимости." }, { status: 403 });
    }
    targetManagerId = managerId;
    assignedByManagerId = session.managerId;
  }

  const { start } = dayBounds(typeof date === "string" ? date : null);

  const item = await prisma.dailyPlanItem.create({
    data: {
      managerId: targetManagerId,
      assignedByManagerId,
      planDate: start,
      note: note.trim(),
      clientId: typeof clientId === "string" && clientId ? clientId : null,
      quoteDraftRequestId: typeof quoteDraftRequestId === "string" && quoteDraftRequestId ? quoteDraftRequestId : null,
    },
    include: {
      client: { select: { id: true, name: true, company: true } },
      quoteDraftRequest: { select: { id: true, displayId: true } },
    },
  });

  return Response.json({ item }, { status: 201 });
}
