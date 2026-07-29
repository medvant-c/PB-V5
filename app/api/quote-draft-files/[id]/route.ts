import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { getClientIdFromRequest } from "@/lib/client-auth";
import { getVisibleManagerIds } from "@/lib/manager-scope";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// Serves a reference photo / spec file attached to a QuoteDraftRequest —
// either a manager (scoped the same way as the draft itself, by the
// client's current manager) or the client who authored that draft can
// fetch it. Shared between both sessions rather than two near-identical
// routes since the only difference is which auth cookie is present.
export async function GET(req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const record = await prisma.deskFile.findUnique({ where: { id } });
  if (!record || record.tab !== "quote_draft_request" || !record.relatedId) {
    return Response.json({ error: "Файл не найден." }, { status: 404 });
  }

  const draft = await prisma.quoteDraftRequest.findUnique({
    where: { id: record.relatedId },
    include: { client: { select: { createdByManagerId: true } } },
  });
  if (!draft) {
    return Response.json({ error: "Файл не найден." }, { status: 404 });
  }

  const managerSession = await getManagerSessionFromRequest(req);
  if (managerSession) {
    const visibleManagerIds = await getVisibleManagerIds(managerSession);
    const allowed = visibleManagerIds === "all" || (draft.client.createdByManagerId !== null && visibleManagerIds.includes(draft.client.createdByManagerId));
    if (!allowed) return Response.json({ error: "Нет доступа к файлу." }, { status: 403 });
  } else {
    const clientId = await getClientIdFromRequest(req);
    if (!clientId || clientId !== draft.clientId) {
      return Response.json({ error: "Не авторизовано." }, { status: 401 });
    }
  }

  const buffer = await storage.get(record.storageKey);
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": record.mimeType,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(record.originalName)}`,
      "Content-Length": String(record.size),
    },
  });
}
