import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { getVisibleManagerIds } from "@/lib/manager-scope";
import { prisma } from "@/lib/prisma";

// Owner/senior only, same gate as /api/manager-confirmations — this is the
// "already handled" counterpart to that queue: every quote whose buyout
// fact has been confirmed, filterable by manager/client/date so a
// руководитель can audit what was confirmed without re-opening every
// client's quote list. See PB-V5 chat 2026-07-29.
export async function GET(req: NextRequest) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }
  if (session.role !== "owner" && session.role !== "senior") {
    return Response.json({ error: "Доступно только старшему менеджеру и руководителю." }, { status: 403 });
  }

  const visibleManagerIds = await getVisibleManagerIds(session);
  const managerScopeFilter = visibleManagerIds === "all" ? {} : { managerId: { in: visibleManagerIds } };

  const managerIdParam = req.nextUrl.searchParams.get("managerId");
  const clientIdParam = req.nextUrl.searchParams.get("clientId");
  const dateFromParam = req.nextUrl.searchParams.get("dateFrom");
  const dateToParam = req.nextUrl.searchParams.get("dateTo");

  const dateFrom = dateFromParam ? new Date(dateFromParam) : null;
  // <input type="date"> gives a calendar-day boundary at 00:00 — bumped to
  // the end of that day so a "to" filter of today actually includes
  // confirmations made today, not just before midnight.
  const dateTo = dateToParam ? new Date(dateToParam) : null;
  if (dateTo) dateTo.setHours(23, 59, 59, 999);

  const buyouts = await prisma.quote.findMany({
    where: {
      buyoutFactConfirmed: true,
      ...managerScopeFilter,
      ...(managerIdParam ? { managerId: managerIdParam } : {}),
      ...(clientIdParam ? { clientId: clientIdParam } : {}),
      ...(dateFrom || dateTo
        ? { buyoutConfirmedAt: { ...(dateFrom ? { gte: dateFrom } : {}), ...(dateTo ? { lte: dateTo } : {}) } }
        : {}),
    },
    orderBy: { buyoutConfirmedAt: "desc" },
    select: {
      id: true,
      displayId: true,
      productName: true,
      totalRub: true,
      totalPriceCny: true,
      actualBuyoutCny: true,
      actualBuyoutRateUsed: true,
      actualSupplierDiscountCny: true,
      actualClientPaymentRub: true,
      actualClientPaymentRateUsed: true,
      searchServiceFeeRub: true,
      customProductionFeeRub: true,
      buyoutCommissionRub: true,
      cnyRateUsed: true,
      buyoutConfirmedAt: true,
      buyoutConfirmedByManagerId: true,
      manager: { select: { id: true, name: true } },
      client: { select: { id: true, name: true, company: true } },
    },
  });

  // buyoutConfirmedByManagerId is a plain string field (no Prisma relation
  // — see prisma/schema.prisma), so the confirmer's name is resolved with
  // one extra lookup rather than an include.
  const confirmedByIds = [...new Set(buyouts.map((b) => b.buyoutConfirmedByManagerId).filter((id): id is string => Boolean(id)))];
  const confirmedByManagers = confirmedByIds.length
    ? await prisma.manager.findMany({ where: { id: { in: confirmedByIds } }, select: { id: true, name: true } })
    : [];
  const confirmedByNameById = new Map(confirmedByManagers.map((m) => [m.id, m.name]));

  // Same manager-filter dropdown source as /api/manager-confirmations —
  // owner sees everyone, senior sees themself + their own subordinates.
  const teamManagers = await prisma.manager.findMany({
    where: { active: true, ...(session.role === "owner" ? {} : { OR: [{ id: session.managerId }, { supervisorId: session.managerId }] }) },
    orderBy: { displayId: "asc" },
    select: { id: true, name: true },
  });

  return Response.json({
    buyouts: buyouts.map((b) => ({
      ...b,
      confirmedByManagerName: b.buyoutConfirmedByManagerId ? (confirmedByNameById.get(b.buyoutConfirmedByManagerId) ?? null) : null,
      // Same reconciliation figures shown live in confirmations-tab.tsx's
      // confirm-buyout form — reproduced here from the same stored fields
      // (actualClientPaymentRateUsed is the real ¥→₽ rate at the moment of
      // that payment, not today's rate) so the archive row is self-
      // contained without the reader having to redo the math.
      actualClientPaymentCny:
        b.actualClientPaymentRub && b.actualClientPaymentRateUsed
          ? Number(b.actualClientPaymentRub) / Number(b.actualClientPaymentRateUsed)
          : null,
      servicesAndCommissionCny:
        (Number(b.searchServiceFeeRub) + Number(b.buyoutCommissionRub) + Number(b.customProductionFeeRub)) / Number(b.cnyRateUsed),
    })),
    teamManagers,
  });
}
