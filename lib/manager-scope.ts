import "server-only";
import { prisma } from "@/lib/prisma";
import type { ManagerSession } from "@/lib/manager-auth";

// Which managers' clients/quotes a given session is allowed to see or act
// on. "all" means no filter (owner). A plain array means "restrict to
// exactly these manager ids" — used as `createdByManagerId: { in: ... }` /
// `managerId: { in: ... }` in Prisma queries.
async function getVisibleManagerIds(session: ManagerSession): Promise<"all" | string[]> {
  if (session.role === "owner") return "all";
  if (session.role === "manager") return [session.managerId];

  // senior — self plus every manager attached to them via supervisorId.
  const subordinates = await prisma.manager.findMany({
    where: { supervisorId: session.managerId },
    select: { id: true },
  });
  return [session.managerId, ...subordinates.map((m) => m.id)];
}

// Shared by every manager-quotes route (detail/edit/delete/photos) so the
// same rule can't drift between them.
async function canAccessManagerQuote(session: ManagerSession, quoteManagerId: string): Promise<boolean> {
  const visibleManagerIds = await getVisibleManagerIds(session);
  return visibleManagerIds === "all" || visibleManagerIds.includes(quoteManagerId);
}

// Owner can always edit tariffs (rates, density tiers, price list); anyone
// else needs Manager.canEditTariffs explicitly turned on — checked live,
// never trusted from the session token (same pattern as Manager.active).
// Shared by manager-tariffs, manager-density-tariffs, and manager-service-
// catalog edit routes so the rule can't drift between them.
async function canEditTariffs(session: ManagerSession): Promise<boolean> {
  if (session.role === "owner") return true;
  const manager = await prisma.manager.findUnique({ where: { id: session.managerId }, select: { canEditTariffs: true } });
  return manager?.canEditTariffs ?? false;
}

export { getVisibleManagerIds, canAccessManagerQuote, canEditTariffs };
