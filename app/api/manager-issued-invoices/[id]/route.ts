import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { canViewInvoices, canAccessManagerClient } from "@/lib/manager-scope";
import { prisma } from "@/lib/prisma";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// "Редактировать" a счёт — only the note and the cancelled flag (a soft
// void, same spirit as Quote.deletedAt). The document itself (amount/
// quotes/file) is never edited in place — a mistake gets cancelled and a
// fresh счёт issued instead, so the stored PDF/Excel always matches what
// was actually sent.
//
// Доступ: canViewInvoices (owner/senior company-wide право) ИЛИ — для
// счетов клиентов фулфилмента — обычный scoping по видимости клиента
// (canAccessManagerClient), тот же принцип, что и у остальных
// fulfillment-роутов, иначе рядовой менеджер не мог бы отменить/поправить
// заметку на СВОЁМ же выставленном счёте. См. PB-V5 chat 2026-09-12.
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  const { id } = await params;
  const existing = await prisma.issuedInvoice.findUnique({
    where: { id },
    include: { client: { select: { id: true, kind: true, createdByManagerId: true } } },
  });
  if (!existing) {
    return Response.json({ error: "Счёт не найден." }, { status: 404 });
  }
  const allowed =
    (await canViewInvoices(session)) ||
    (existing.client.kind === "fulfillment" && (await canAccessManagerClient(session, existing.client)));
  if (!allowed) {
    return Response.json({ error: "Нет доступа к этому разделу." }, { status: 403 });
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
