import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { getVisibleManagerIds } from "@/lib/manager-scope";
import { dayBoundsUtc, isTodayUtc } from "@/lib/daily-plan-day";
import { prisma } from "@/lib/prisma";

// Mostly personal — every manager (including the owner, who can plan their
// own day too) sees and manages only their own items here. The one
// exception: POST accepts an optional `managerId` so an owner/senior can
// ASSIGN a task onto someone else's list (see DailyPlanItem.
// assignedByManagerId in prisma/schema.prisma) — the target manager still
// owns checking it off/deleting it afterward, same as anything they added
// themselves. The read-only cross-manager overview lives in a separate
// route (manager-daily-plan-summary).

export async function GET(req: NextRequest) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  const { start, end } = dayBoundsUtc(req.nextUrl.searchParams.get("date"));

  const todayItems = await prisma.dailyPlanItem.findMany({
    where: { managerId: session.managerId, planDate: { gte: start, lt: end } },
    orderBy: { createdAt: "asc" },
    include: {
      client: { select: { id: true, name: true, company: true } },
      quoteDraftRequest: { select: { id: true, displayId: true } },
    },
  });

  // Anything left unchecked on an earlier day rolls forward onto today's
  // list automatically, so it doesn't quietly fall off the radar once its
  // original day ends — only when actually looking at today, never when
  // reviewing a past day's plan (that must stay an exact historical
  // record, e.g. for DailyPlanReviewModal's "vs yesterday" check). See
  // PB-V5 chat 2026-08-01.
  const overdueItems = isTodayUtc(start)
    ? await prisma.dailyPlanItem.findMany({
        where: { managerId: session.managerId, doneAt: null, planDate: { lt: start } },
        orderBy: { planDate: "asc" },
        include: {
          client: { select: { id: true, name: true, company: true } },
          quoteDraftRequest: { select: { id: true, displayId: true } },
        },
      })
    : [];
  const overdueIds = new Set(overdueItems.map((i) => i.id));

  const items = [...overdueItems, ...todayItems];

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
      carriedOverFromDate: overdueIds.has(item.id) ? item.planDate.toISOString().slice(0, 10) : null,
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

  const { start } = dayBoundsUtc(typeof date === "string" ? date : null);

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
