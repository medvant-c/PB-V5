import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { getVisibleManagerIds } from "@/lib/manager-scope";
import { prisma } from "@/lib/prisma";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_SOURCES = ["instagram", "telegram", "website", "referral", "other"];

// Edit client fields and/or archive/unarchive — didn't exist at all before;
// the only client mutation was create. Scoped the same as everywhere else:
// a manager can only touch a client they can already see.
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  const { id } = await params;
  const existing = await prisma.client.findUnique({ where: { id } });
  if (!existing) return Response.json({ error: "Клиент не найден." }, { status: 404 });

  const visibleManagerIds = await getVisibleManagerIds(session);
  if (
    visibleManagerIds !== "all" &&
    (!existing.createdByManagerId || !visibleManagerIds.includes(existing.createdByManagerId))
  ) {
    return Response.json({ error: "Этот клиент вне вашей зоны видимости." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Некорректный запрос." }, { status: 400 });
  }
  const { name, company, phone, messenger, email, source, archived, transferToManagerId, contactsHiddenFromManager } =
    (body as {
      name?: unknown;
      company?: unknown;
      phone?: unknown;
      messenger?: unknown;
      email?: unknown;
      source?: unknown;
      archived?: unknown;
      transferToManagerId?: unknown;
      contactsHiddenFromManager?: unknown;
    }) ?? {};

  // Owner or senior; senior can only hand off to their own subordinate —
  // a separate atomic step (not folded into the `data` object below)
  // because moving a client also has to move every one of their quotes'
  // managerId, so the new manager's dashboard/KPI reflects the full
  // history as their own, not just future quotes. This deliberately
  // rewrites who's credited with past quotes; if you want the original
  // manager's name preserved for audit purposes instead, this is the one
  // line to change. Also auto-hides contacts from the new manager (see
  // Client.contactsHiddenFromManager) — a handed-off client defaults to
  // "company lead", not automatically visible to whoever it lands on.
  if (typeof transferToManagerId === "string" && transferToManagerId) {
    if (session.role !== "owner" && session.role !== "senior") {
      return Response.json({ error: "Передавать клиентов может только старший менеджер или руководитель." }, { status: 403 });
    }
    const newManager = await prisma.manager.findUnique({ where: { id: transferToManagerId } });
    if (!newManager) return Response.json({ error: "Менеджер не найден." }, { status: 404 });
    if (session.role === "senior" && newManager.supervisorId !== session.managerId) {
      return Response.json({ error: "Можно передавать только своим подчинённым менеджерам." }, { status: 403 });
    }

    await prisma.$transaction([
      prisma.client.update({ where: { id }, data: { createdByManagerId: transferToManagerId, contactsHiddenFromManager: true } }),
      prisma.quote.updateMany({ where: { clientId: id }, data: { managerId: transferToManagerId } }),
    ]);
  }

  // Senior/owner-only manual override of the contact-visibility flag — a
  // plain manager (including the client's own createdByManagerId) can
  // never grant themselves access to contacts someone else hid.
  if (typeof contactsHiddenFromManager === "boolean") {
    if (session.role !== "owner" && session.role !== "senior") {
      return Response.json({ error: "Эту настройку может менять только старший менеджер или руководитель." }, { status: 403 });
    }
  }

  const data: Record<string, unknown> = {};
  if (typeof contactsHiddenFromManager === "boolean" && (session.role === "owner" || session.role === "senior")) {
    data.contactsHiddenFromManager = contactsHiddenFromManager;
  }
  if (typeof name === "string" && name.trim()) data.name = name.trim();
  if (typeof phone === "string" && phone.trim()) data.phone = phone.trim();
  if (typeof company === "string") data.company = company.trim() || null;
  if (typeof messenger === "string") data.messenger = messenger.trim() || null;
  if (typeof source === "string") data.source = VALID_SOURCES.includes(source) ? source : null;
  if (typeof email === "string") {
    const trimmed = email.trim();
    if (trimmed) {
      if (!EMAIL_RE.test(trimmed)) {
        return Response.json({ error: "Укажите корректный email." }, { status: 400 });
      }
      const normalized = trimmed.toLowerCase();
      const conflict = await prisma.client.findUnique({ where: { email: normalized } });
      if (conflict && conflict.id !== id) {
        return Response.json({ error: "Клиент с таким email уже существует." }, { status: 409 });
      }
      data.email = normalized;
    } else {
      data.email = null;
    }
  }
  if (typeof archived === "boolean") data.archivedAt = archived ? new Date() : null;

  const client = await prisma.client.update({ where: { id }, data });
  return Response.json({ client });
}
