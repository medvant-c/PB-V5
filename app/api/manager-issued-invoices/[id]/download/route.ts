import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { canViewInvoices, canAccessManagerClient } from "@/lib/manager-scope";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// Re-download exactly the file that was actually issued (not a freshly
// regenerated one) — see IssuedInvoice's schema comment. Доступ — то же
// canViewInvoices-или-собственный-scope правило, что и в PATCH
// .../route.ts (см. его комментарий). См. PB-V5 chat 2026-09-12.
export async function GET(req: NextRequest, { params }: RouteParams) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  const { id } = await params;
  const record = await prisma.issuedInvoice.findUnique({
    where: { id },
    include: { client: { select: { id: true, kind: true, createdByManagerId: true } } },
  });
  if (!record) {
    return Response.json({ error: "Счёт не найден." }, { status: 404 });
  }
  const allowed =
    (await canViewInvoices(session)) || (record.client.kind === "fulfillment" && (await canAccessManagerClient(session, record.client)));
  if (!allowed) {
    return Response.json({ error: "Нет доступа к этому разделу." }, { status: 403 });
  }

  const buffer = await storage.get(record.storageKey);
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": record.mimeType,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(record.fileName)}`,
    },
  });
}
