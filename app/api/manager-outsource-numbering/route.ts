import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { clientVisibilityWhere } from "@/lib/manager-scope";
import { prisma } from "@/lib/prisma";

// Only meaningful for outsource_manager (see ManagerRole.outsource_manager
// in prisma/schema.prisma) — everyone else gets applicable:false and the
// frontend falls back to the real displayId everywhere, unchanged. Numbers
// clients 1, 2, 3… in the exact order/scope the "Клиенты" list itself
// already uses (clientVisibilityWhere — same OR createdByManagerId/has-a-
// quote rule, so a number here always matches a row this manager can
// actually see), then labels each of THIS manager's own quotes
// "{client's local number}_{that quote's own local number for this
// client}" — e.g. "2_1" for the first quote under client №2. The real
// displayId is never touched anywhere in the database; this is purely a
// display-time relabeling computed fresh on every call. See PB-V5 chat
// 2026-08-06.
export async function GET(req: NextRequest) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }
  if (session.role !== "outsource_manager") {
    return Response.json({ applicable: false });
  }

  const clients = await prisma.client.findMany({
    where: clientVisibilityWhere([session.managerId]),
    orderBy: { displayId: "asc" },
    select: { id: true },
  });
  const clientNumbers: Record<string, number> = {};
  clients.forEach((c, i) => {
    clientNumbers[c.id] = i + 1;
  });

  const quotes = await prisma.quote.findMany({
    where: { managerId: session.managerId, deletedAt: null },
    orderBy: { displayId: "asc" },
    select: { id: true, clientId: true },
  });
  const quoteCountByClientId = new Map<string, number>();
  const quoteLabels: Record<string, string> = {};
  for (const q of quotes) {
    const clientNumber = clientNumbers[q.clientId] ?? "?";
    const nextIndex = (quoteCountByClientId.get(q.clientId) ?? 0) + 1;
    quoteCountByClientId.set(q.clientId, nextIndex);
    quoteLabels[q.id] = `${clientNumber}_${nextIndex}`;
  }

  return Response.json({ applicable: true, clientNumbers, quoteLabels });
}
