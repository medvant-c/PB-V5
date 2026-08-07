import "server-only";
import { prisma } from "@/lib/prisma";
import type { ManagerSession } from "@/lib/manager-auth";

// Which managers' clients/quotes a given session is allowed to see or act
// on. "all" means no filter (owner). A plain array means "restrict to
// exactly these manager ids" — used as `createdByManagerId: { in: ... }` /
// `managerId: { in: ... }` in Prisma queries.
async function getVisibleManagerIds(session: ManagerSession): Promise<"all" | string[]> {
  if (session.role === "owner") return "all";
  // outsource_manager has the exact same scope as a plain "manager" — only
  // their own clients, never a subordinate's — see ManagerRole.
  // outsource_manager's schema comment. Deliberately NOT folded into the
  // "manager" check above via an array/includes, so a future new role
  // added here can't silently fall through into the senior branch below
  // the way this one almost did.
  if (session.role === "manager" || session.role === "outsource_manager") return [session.managerId];

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

// Whether a session can see/edit a given client — true either if the
// session created them (createdByManagerId, the original rule) OR if any
// of the session's own visible managers currently hold a quote for that
// client. That second branch matters because a client can be created by
// one manager (or the owner, or predate this field entirely — null) and
// then have its actual quotes reassigned to someone else entirely; a
// senior manager must be able to edit a client their own subordinate is
// actively working, even if that subordinate didn't create the client
// record. Previously this was `createdByManagerId`-only, which silently
// locked a senior out of exactly that case ("вне вашей зоны видимости")
// even though the underlying quote itself was already correctly visible
// via canAccessManagerQuote. See PB-V5 chat 2026-08-03.
async function canAccessManagerClient(session: ManagerSession, client: { id: string; createdByManagerId: string | null }): Promise<boolean> {
  const visibleManagerIds = await getVisibleManagerIds(session);
  if (visibleManagerIds === "all") return true;
  if (client.createdByManagerId && visibleManagerIds.includes(client.createdByManagerId)) return true;
  const ownQuote = await prisma.quote.findFirst({
    where: { clientId: client.id, managerId: { in: visibleManagerIds } },
    select: { id: true },
  });
  return Boolean(ownQuote);
}

// Same rule as canAccessManagerClient above, as a Prisma where-fragment for
// list queries (GET /api/manager-clients) instead of a per-row check —
// spread directly into a `where` object; `{}` for "all" (owner, no filter).
function clientVisibilityWhere(visibleManagerIds: "all" | string[]) {
  if (visibleManagerIds === "all") return {};
  return {
    OR: [
      { createdByManagerId: { in: visibleManagerIds } },
      { quotes: { some: { managerId: { in: visibleManagerIds } } } },
    ],
  };
}

// Manager-scoped team list for a "hand off to / assigned to" picker —
// owner sees every active manager, senior sees themself + their own
// subordinates, everyone else sees just themself. Reuses the same
// getVisibleManagerIds scope this file already enforces for clients/quotes
// instead of an independently-derived manager list. Previously duplicated
// (each with its own inline query) in manager-confirmations,
// manager-confirmations-archive, and manager-daily-plan-summary — see
// PB-V5 chat 2026-08-07.
async function getTeamManagers(session: ManagerSession): Promise<{ id: string; name: string }[]> {
  const visibleManagerIds = await getVisibleManagerIds(session);
  return prisma.manager.findMany({
    where: { active: true, ...(visibleManagerIds === "all" ? {} : { id: { in: visibleManagerIds } }) },
    orderBy: { displayId: "asc" },
    select: { id: true, name: true },
  });
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

// Shared "owner always, otherwise look up this one column live" shape for
// every individually-grantable permission in prisma/schema.prisma's Manager
// model (see its own comment for what each one gates and why it's kept
// separate from a role) — one query per check, same cost/consistency as
// canEditTariffs above, just generalized so a 6th permission doesn't need a
// 6th copy-pasted function.
async function hasManagerPermission(
  session: ManagerSession,
  field: "canViewPriceList" | "canViewCash" | "canViewProfitReport" | "canViewTrash" | "canViewCargoCost",
): Promise<boolean> {
  if (session.role === "owner") return true;
  const manager = await prisma.manager.findUnique({ where: { id: session.managerId }, select: { [field]: true } });
  return Boolean(manager?.[field]);
}

// "Прайс-лист" tab — see Manager.canViewPriceList's schema comment.
async function canManagePriceList(session: ManagerSession): Promise<boolean> {
  return hasManagerPermission(session, "canViewPriceList");
}

// "Отчёты по дням" (cash ledger) tab — see Manager.canViewCash.
async function canViewCash(session: ManagerSession): Promise<boolean> {
  return hasManagerPermission(session, "canViewCash");
}

// "Отчёт о прибыли" tab (both "по сделкам" and "за период" modes) — see
// Manager.canViewProfitReport.
async function canViewProfitReport(session: ManagerSession): Promise<boolean> {
  return hasManagerPermission(session, "canViewProfitReport");
}

// "Корзина" tab — see Manager.canViewTrash.
async function canViewTrash(session: ManagerSession): Promise<boolean> {
  return hasManagerPermission(session, "canViewTrash");
}

// Real cargo cost/margin fields — see Manager.canViewCargoCost.
async function canViewCargoCost(session: ManagerSession): Promise<boolean> {
  return hasManagerPermission(session, "canViewCargoCost");
}

export {
  getVisibleManagerIds,
  getTeamManagers,
  canAccessManagerQuote,
  canAccessManagerClient,
  clientVisibilityWhere,
  canEditTariffs,
  canManagePriceList,
  canViewCash,
  canViewProfitReport,
  canViewTrash,
  canViewCargoCost,
};
