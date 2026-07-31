import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { getVisibleManagerIds } from "@/lib/manager-scope";
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

  const dateParam = req.nextUrl.searchParams.get("date");
  const base = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? new Date(`${dateParam}T00:00:00.000Z`) : new Date();
  const start = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate()));
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

  const visibleManagerIds = await getVisibleManagerIds(session);

  const [managers, items] = await Promise.all([
    prisma.manager.findMany({
      where: { active: true, ...(visibleManagerIds === "all" ? {} : { id: { in: visibleManagerIds } }) },
      orderBy: { displayId: "asc" },
      select: { id: true, name: true },
    }),
    prisma.dailyPlanItem.findMany({
      where: {
        planDate: { gte: start, lt: end },
        ...(visibleManagerIds === "all" ? {} : { managerId: { in: visibleManagerIds } }),
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        managerId: true,
        note: true,
        doneAt: true,
        client: { select: { id: true, name: true, company: true } },
        quoteDraftRequest: { select: { id: true, displayId: true } },
      },
    }),
  ]);

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

  return Response.json({ summary });
}
