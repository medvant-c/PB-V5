import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { canViewInvoices } from "@/lib/manager-scope";
import { prisma } from "@/lib/prisma";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// "Редактировать" a счёт — only the note and the cancelled flag (a soft
// void, same spirit as Quote.deletedAt). The document itself (amount/
// quotes/file) is never edited in place — a mistake gets cancelled and a
// fresh счёт issued instead, so the stored PDF/Excel always matches what
// was actually sent.
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }
  if (!(await canViewInvoices(session))) {
    return Response.json({ error: "Нет доступа к этому разделу." }, { status: 403 });
  }

  const { id } = await params;
  const existing = await prisma.issuedInvoice.findUnique({ where: { id } });
  if (!existing) {
    return Response.json({ error: "Счёт не найден." }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Некорректный запрос." }, { status: 400 });
  }
  const { note, cancelled } = (body as { note?: unknown; cancelled?: unknown }) ?? {};

  const data: { note?: string; cancelled?: boolean; cancelledAt?: Date | null } = {};
  if (typeof note === "string") data.note = note;
  if (typeof cancelled === "boolean") {
    data.cancelled = cancelled;
    data.cancelledAt = cancelled ? new Date() : null;
  }

  const invoice = await prisma.issuedInvoice.update({ where: { id }, data });
  return Response.json({ invoice: { ...invoice, amountTotal: invoice.amountTotal.toString() } });
}
