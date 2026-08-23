import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { prisma } from "@/lib/prisma";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const VALID_ROLES = ["manager", "senior", "owner", "outsource_manager"];

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const session = await getManagerSessionFromRequest(req);
  if (!session || session.role !== "owner") {
    return Response.json({ error: "Доступно только руководителю." }, { status: 403 });
  }

  const { id } = await params;
  const existing = await prisma.manager.findUnique({ where: { id } });
  if (!existing) return Response.json({ error: "Менеджер не найден." }, { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Некорректный запрос." }, { status: 400 });
  }
  const {
    active,
    canEditTariffs,
    canViewPriceList,
    canViewCash,
    canViewProfitReport,
    canViewTrash,
    canViewCargoCost,
    canViewInvoices,
    canViewDiscounts,
    role,
    supervisorId,
  } =
    (body as {
      active?: unknown;
      canEditTariffs?: unknown;
      canViewPriceList?: unknown;
      canViewCash?: unknown;
      canViewProfitReport?: unknown;
      canViewTrash?: unknown;
      canViewCargoCost?: unknown;
      canViewInvoices?: unknown;
      canViewDiscounts?: unknown;
      role?: unknown;
      supervisorId?: unknown;
    }) ?? {};

  // Never let the owner lock themselves out — blocking/demoting the last
  // owner account would leave nobody able to manage staff at all.
  if ((active === false || (typeof role === "string" && role !== "owner")) && existing.role === "owner") {
    const otherOwners = await prisma.manager.count({ where: { role: "owner", id: { not: id } } });
    if (otherOwners === 0) {
      return Response.json({ error: "Нельзя заблокировать или понизить единственного руководителя." }, { status: 400 });
    }
  }

  const data: Record<string, unknown> = {};
  if (typeof active === "boolean") data.active = active;
  if (typeof canEditTariffs === "boolean") data.canEditTariffs = canEditTariffs;
  if (typeof canViewPriceList === "boolean") data.canViewPriceList = canViewPriceList;
  if (typeof canViewCash === "boolean") data.canViewCash = canViewCash;
  if (typeof canViewProfitReport === "boolean") data.canViewProfitReport = canViewProfitReport;
  if (typeof canViewTrash === "boolean") data.canViewTrash = canViewTrash;
  if (typeof canViewCargoCost === "boolean") data.canViewCargoCost = canViewCargoCost;
  if (typeof canViewInvoices === "boolean") data.canViewInvoices = canViewInvoices;
  if (typeof canViewDiscounts === "boolean") data.canViewDiscounts = canViewDiscounts;
  if (typeof role === "string") {
    if (!VALID_ROLES.includes(role)) return Response.json({ error: "Некорректная роль." }, { status: 400 });
    data.role = role;
  }
  if (supervisorId === null) {
    data.supervisorId = null;
  } else if (typeof supervisorId === "string" && supervisorId) {
    const supervisor = await prisma.manager.findUnique({ where: { id: supervisorId } });
    if (!supervisor || supervisor.role !== "senior") {
      return Response.json({ error: "Руководитель должен быть старшим менеджером." }, { status: 400 });
    }
    if (supervisorId === id) {
      return Response.json({ error: "Менеджер не может быть прикреплён к самому себе." }, { status: 400 });
    }
    data.supervisorId = supervisorId;
  }

  const manager = await prisma.manager.update({ where: { id }, data });
  return Response.json({ manager });
}

// Deleting a manager can't just remove the row — several tables have a
// required (non-nullable) FK to Manager (Quote.managerId,
// TariffSettings.createdByManagerId), so the delete would fail on a
// foreign-key violation the moment this person has ever made a quote or
// touched tariffs. Reassigning everything to the deleting owner first
// (same mechanism as the client-transfer feature) is what makes the
// delete possible at all, and matches the explicit ask: nothing gets
// silently orphaned or lost, it moves to the owner's own cabinet.
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const session = await getManagerSessionFromRequest(req);
  if (!session || session.role !== "owner") {
    return Response.json({ error: "Доступно только руководителю." }, { status: 403 });
  }

  const { id } = await params;
  const existing = await prisma.manager.findUnique({ where: { id } });
  if (!existing) return Response.json({ error: "Менеджер не найден." }, { status: 404 });
  if (existing.role === "owner") {
    return Response.json({ error: "Руководителя нельзя удалить через этот раздел." }, { status: 400 });
  }

  await prisma.$transaction([
    prisma.client.updateMany({ where: { createdByManagerId: id }, data: { createdByManagerId: session.managerId } }),
    prisma.quote.updateMany({ where: { managerId: id }, data: { managerId: session.managerId } }),
    prisma.tariffSettings.updateMany({ where: { createdByManagerId: id }, data: { createdByManagerId: session.managerId } }),
    // Same "required (non-nullable) FK to Manager" problem as Client/Quote/
    // TariffSettings above, just on tables this route forgot the first time
    // round — any one of these existing for the target manager made the
    // delete below throw a foreign-key violation, uncaught, which the
    // frontend then showed as "нажимаю удалить и ничего не происходит"
    // (res.json() on a non-JSON 500 body throws with no catch — see
    // staff-tab.tsx handleDelete). Found via a real outsource-manager
    // delete that silently failed on a single DailyPlanItem row. See PB-V5
    // chat 2026-08-23.
    prisma.cashOrder.updateMany({ where: { createdByManagerId: id }, data: { createdByManagerId: session.managerId } }),
    prisma.quotePaymentAllocation.updateMany({ where: { createdByManagerId: id }, data: { createdByManagerId: session.managerId } }),
    prisma.cashTransfer.updateMany({ where: { createdByManagerId: id }, data: { createdByManagerId: session.managerId } }),
    prisma.cashOpeningBalance.updateMany({ where: { updatedByManagerId: id }, data: { updatedByManagerId: session.managerId } }),
    prisma.issuedInvoice.updateMany({ where: { managerId: id }, data: { managerId: session.managerId } }),
    prisma.fulfillmentOrder.updateMany({ where: { managerId: id }, data: { managerId: session.managerId } }),
    prisma.dailyPlanItem.updateMany({ where: { managerId: id }, data: { managerId: session.managerId } }),
    prisma.systemSettings.updateMany({ where: { updatedByManagerId: id }, data: { updatedByManagerId: session.managerId } }),
    prisma.investor.updateMany({ where: { updatedByManagerId: id }, data: { updatedByManagerId: session.managerId } }),
    // Any manager attached to this one (if it was a "старший менеджер")
    // just loses that supervisor rather than being deleted themselves —
    // the owner can assign a new senior later from the Сотрудники tab.
    prisma.manager.updateMany({ where: { supervisorId: id }, data: { supervisorId: null } }),
    prisma.manager.delete({ where: { id } }),
  ]);

  return Response.json({ ok: true });
}
