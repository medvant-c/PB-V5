import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { prisma } from "@/lib/prisma";

// Polled by DailyPlanAssignedModal so a manager gets an unmissable pop-up
// the first time they're online after an owner/senior assigns them a new
// task (DailyPlanItem.assignedByManagerId) — not scoped to today's date on
// purpose, since a task assigned while the manager was offline must still
// surface once they're back, whatever day that ends up being. Stops
// appearing forever once acknowledgedAt is set (see PATCH .../[id]).
export async function GET(req: NextRequest) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  const items = await prisma.dailyPlanItem.findMany({
    where: { managerId: session.managerId, assignedByManagerId: { not: null }, acknowledgedAt: null },
    orderBy: { createdAt: "asc" },
    include: {
      client: { select: { id: true, name: true, company: true } },
      quoteDraftRequest: { select: { id: true, displayId: true } },
    },
  });

  const assignerIds = [...new Set(items.map((i) => i.assignedByManagerId).filter((id): id is string => Boolean(id)))];
  const assigners = assignerIds.length
    ? await prisma.manager.findMany({ where: { id: { in: assignerIds } }, select: { id: true, name: true } })
    : [];
  const assignerNameById = new Map(assigners.map((m) => [m.id, m.name]));

  return Response.json({
    items: items.map((item) => ({
      id: item.id,
      note: item.note,
      client: item.client,
      quoteDraftRequest: item.quoteDraftRequest,
      assignedByManagerName: assignerNameById.get(item.assignedByManagerId!) ?? null,
      createdAt: item.createdAt,
    })),
  });
}
