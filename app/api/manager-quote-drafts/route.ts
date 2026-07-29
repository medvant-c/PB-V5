import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { getVisibleManagerIds } from "@/lib/manager-scope";
import { prisma } from "@/lib/prisma";
import { nextQuoteDraftRequestDisplayId } from "@/lib/display-ids";

// Scoped by the CLIENT's current manager (client.createdByManagerId), not
// by whoever happened to author the draft note — same reasoning as every
// other credit/visibility rule in this app (a reassigned client moves all
// of its associated data with it, see the quote-reassignment comments in
// app/api/manager-quotes/[id]/reassign). Scoping by draft.managerId
// instead would silently drop a draft off its now-current manager's
// dashboard the moment the client changed hands, or if the owner/a
// colleague created the note on that manager's behalf. See PB-V5 chat
// 2026-07-29. Done drafts are hidden by default (once handled — built
// into a real quote or turned out unnecessary — there's no reason for
// them to keep cluttering the "к выполнению" list).
export async function GET(req: NextRequest) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  const visibleManagerIds = await getVisibleManagerIds(session);
  const clientId = req.nextUrl.searchParams.get("clientId");
  const includeDone = req.nextUrl.searchParams.get("includeDone") === "1";

  const drafts = await prisma.quoteDraftRequest.findMany({
    where: {
      ...(visibleManagerIds === "all" ? {} : { client: { createdByManagerId: { in: visibleManagerIds } } }),
      ...(clientId ? { clientId } : {}),
      ...(includeDone ? {} : { done: false }),
    },
    orderBy: { createdAt: "asc" },
    include: { manager: { select: { id: true, name: true } }, client: { select: { id: true, name: true, company: true } } },
  });

  // Reference photos/spec files the client attached at submission — see
  // account-quote-drafts/route.ts. Batched by relatedId (DeskFile has no
  // direct relation to QuoteDraftRequest, same polymorphic pattern as
  // every other DeskFile attachment) rather than N+1 queries.
  const files = await prisma.deskFile.findMany({
    where: { tab: "quote_draft_request", relatedId: { in: drafts.map((d) => d.id) } },
    select: { id: true, relatedId: true, originalName: true, mimeType: true, size: true },
  });
  const filesByDraftId = new Map<string, typeof files>();
  for (const file of files) {
    const list = filesByDraftId.get(file.relatedId!) ?? [];
    list.push(file);
    filesByDraftId.set(file.relatedId!, list);
  }

  return Response.json({
    drafts: drafts.map((d) => ({ ...d, files: filesByDraftId.get(d.id) ?? [] })),
  });
}

export async function POST(req: NextRequest) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Некорректный запрос." }, { status: 400 });
  }
  const { clientId, note } = (body as { clientId?: unknown; note?: unknown }) ?? {};
  if (typeof clientId !== "string" || !clientId) {
    return Response.json({ error: "Укажите клиента." }, { status: 400 });
  }
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) return Response.json({ error: "Клиент не найден." }, { status: 404 });
  if (typeof note !== "string" || !note.trim()) {
    return Response.json({ error: "Опишите, что нужно посчитать." }, { status: 400 });
  }

  const draft = await prisma.quoteDraftRequest.create({
    data: {
      displayId: await nextQuoteDraftRequestDisplayId(),
      clientId,
      managerId: session.managerId,
      note: note.trim(),
    },
    include: { manager: { select: { id: true, name: true } } },
  });

  return Response.json({ draft }, { status: 201 });
}
