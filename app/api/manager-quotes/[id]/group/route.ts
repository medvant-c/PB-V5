import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { canAccessManagerQuote, canViewCargoCost } from "@/lib/manager-scope";
import { prisma } from "@/lib/prisma";
import { stripCargoCostForNonOwner } from "@/lib/desk-services/quote-request";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// Narrow, single-purpose endpoint for the "переместить в группу"
// action(s) in clients-tab.tsx — same shape as quote-type/status/reassign
// routes. groupId: null unassigns (moves back to "Без группы"). Groups are
// per-client (QuoteGroup.clientId) — a group belonging to a DIFFERENT
// client can never be attached here, same isolation as everything else
// scoped to one client. See PB-V5 chat 2026-08-27.
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  const { id } = await params;
  const existing = await prisma.quote.findUnique({ where: { id } });
  if (!existing || existing.deletedAt) return Response.json({ error: "Просчёт не найден." }, { status: 404 });
  if (!(await canAccessManagerQuote(session, existing.managerId))) {
    return Response.json({ error: "Нет доступа к этому просчёту." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Некорректный запрос." }, { status: 400 });
  }
  const { groupId } = (body as { groupId?: unknown }) ?? {};
  if (groupId !== null && typeof groupId !== "string") {
    return Response.json({ error: "Некорректная группа." }, { status: 400 });
  }

  if (groupId) {
    const group = await prisma.quoteGroup.findUnique({ where: { id: groupId } });
    if (!group || group.clientId !== existing.clientId) {
      return Response.json({ error: "Группа не найдена у этого клиента." }, { status: 404 });
    }
  }

  const quote = await prisma.quote.update({ where: { id }, data: { groupId: groupId ?? null } });
  return Response.json({ quote: stripCargoCostForNonOwner(quote, await canViewCargoCost(session)) });
}
