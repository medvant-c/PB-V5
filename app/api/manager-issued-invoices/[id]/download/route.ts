import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { canViewInvoices } from "@/lib/manager-scope";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// Re-download exactly the file that was actually issued (not a freshly
// regenerated one) — see IssuedInvoice's schema comment.
export async function GET(req: NextRequest, { params }: RouteParams) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }
  if (!(await canViewInvoices(session))) {
    return Response.json({ error: "Нет доступа к этому разделу." }, { status: 403 });
  }

  const { id } = await params;
  const record = await prisma.issuedInvoice.findUnique({ where: { id } });
  if (!record) {
    return Response.json({ error: "Счёт не найден." }, { status: 404 });
  }

  const buffer = await storage.get(record.storageKey);
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": record.mimeType,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(record.fileName)}`,
    },
  });
}
