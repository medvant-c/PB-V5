import { NextRequest } from "next/server";
import { getClientIdFromRequest } from "@/lib/client-auth";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const clientId = await getClientIdFromRequest(req);
  if (!clientId) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  const { id } = await params;
  const record = await prisma.deskFile.findUnique({ where: { id } });
  if (!record || record.tab !== "orders" || !record.relatedId) {
    return Response.json({ error: "Документ не найден." }, { status: 404 });
  }

  // The one check /api/desk-files has no concept of: this document's order
  // must actually belong to the logged-in client, not just any order.
  const order = await prisma.order.findFirst({ where: { id: record.relatedId, clientId } });
  if (!order) {
    return Response.json({ error: "Документ не найден." }, { status: 404 });
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
