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

export { getVisibleManagerIds, canAccessManagerQuote, canAccessManagerClient, clientVisibilityWhere, canEditTariffs };
