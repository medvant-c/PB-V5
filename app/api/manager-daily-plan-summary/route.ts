import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { getVisibleManagerIds } from "@/lib/manager-scope";
import { dayBoundsUtc, isTodayUtc } from "@/lib/daily-plan-day";
import { prisma } from "@/lib/prisma";

// Owner/senior only — read-only cross-manager view of today's (or any
// day's) plans, for the "Планы на сегодня по менеджерам" dashboard block.
// Same visibility scope as everywhere else (owner sees everyone, senior
// sees their own team) — see lib/manager-scope.ts.
export async function GET(req: NextRequest) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }
  if (session.role !== "owner" && session.role !== "senior") {
    return Response.json({ error: "Доступно только старшему менеджеру и руководителю." }, { status: 403 });
  }

  const { start, end } = dayBoundsUtc(req.nextUrl.searchParams.get("date"));

  const visibleManagerIds = await getVisibleManagerIds(session);
  const managerScopeFilter = visibleManagerIds === "all" ? {} : { managerId: { in: visibleManagerIds } };
  const itemSelect = {
    id: true,
    managerId: true,
    note: true,
    doneAt: true,
    planDate: true,
    client: { select: { id: true, name: true, company: true } },
    quoteDraftRequest: { select: { id: true, displayId: true } },
  } as const;

  const [managers, todayItems, overdueItems] = await Promise.all([
    prisma.manager.findMany({
      where: { active: true, ...(visibleManagerIds === "all" ? {} : { id: { in: visibleManagerIds } }) },
      orderBy: { displayId: "asc" },
      select: { id: true, name: true },
    }),
    prisma.dailyPlanItem.findMany({
      where: { planDate: { gte: start, lt: end }, ...managerScopeFilter },
      orderBy: { createdAt: "asc" },
      select: itemSelect,
    }),
    // Same "roll unfinished items forward onto today" behavior as
    // manager-daily-plan's GET (see lib/daily-plan-day.ts) — otherwise a
    // manager's own panel would show an overdue item while this
    // cross-manager view still reported them at 0 for today.
    isTodayUtc(start)
      ? prisma.dailyPlanItem.findMany({
          where: { doneAt: null, planDate: { lt: start }, ...managerScopeFilter },
          orderBy: { planDate: "asc" },
          select: itemSelect,
        })
      : Promise.resolve([]),
  ]);
  const overdueIds = new Set(overdueItems.map((i) => i.id));
  const items = [...overdueItems, ...todayItems].map((item) => ({
    ...item,
    carriedOverFromDate: overdueIds.has(item.id) ? item.planDate.toISOString().slice(0, 10) : null,
  }));

  const itemsByManagerId = new Map<string, typeof items>();
  for (const item of items) {
    const list = itemsByManagerId.get(item.managerId) ?? [];
    list.push(item);
    itemsByManagerId.set(item.managerId, list);
  }

  // Only managers with at least one item today — an empty-handed manager
  // doesn't need a zero-width row cluttering the list every single day.
  const summary = managers
    .map((m) => {
      const managerItems = itemsByManagerId.get(m.id) ?? [];
      return {
        manager: m,
        total: managerItems.length,
        done: managerItems.filter((i) => i.doneAt).length,
        items: managerItems,
      };
    })
    .filter((row) => row.total > 0);

  // Full visible list (not just managers with items today) — the "assign
  // a task" picker on this same dashboard block needs to target someone
  // with an empty list too, not just whoever already has something on it.
  return Response.json({ summary, teamManagers: managers });
}
