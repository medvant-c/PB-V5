import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { getVisibleManagerIds } from "@/lib/manager-scope";
import { prisma } from "@/lib/prisma";
import { nextClientDisplayId } from "@/lib/display-ids";
import { normalizePhone } from "@/lib/phone";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Scoped by role (see lib/manager-scope.ts): a plain manager sees only
// clients they created, a senior manager also sees their attached
// managers' clients, and the owner sees everyone's — createdByManagerId is
// still returned so the UI can show who brought each one in.
export async function GET(req: NextRequest) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  const visibleManagerIds = await getVisibleManagerIds(session);
  const includeArchived = req.nextUrl.searchParams.get("includeArchived") === "1";

  const clients = await prisma.client.findMany({
    where: {
      ...(visibleManagerIds === "all" ? {} : { createdByManagerId: { in: visibleManagerIds } }),
      ...(includeArchived ? {} : { archivedAt: null }),
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      displayId: true,
      name: true,
      company: true,
      messenger: true,
      email: true,
      phone: true,
      source: true,
      createdByManagerId: true,
      createdByManager: { select: { name: true } },
      selfSourcedClaimed: true,
      selfSourcedClaimedAt: true,
      selfSourcedConfirmed: true,
      contactsHiddenFromManager: true,
      vladShareRatePercentOverride: true,
      active: true,
      archivedAt: true,
      createdAt: true,
    },
  });

  // A plain manager never sees the real contact fields for a client the
  // senior/owner has explicitly hidden (see Client.contactsHiddenFromManager)
  // — stripped here, server-side, not just hidden in the UI, since the API
  // response itself must never carry the real values in that case.
  // vladShareRatePercentOverride is a separate, stricter boundary — owner-
  // only, same confidentiality as the rest of "Доля партнёров" in
  // manager-dashboard.tsx, never sent to senior/plain-manager sessions
  // regardless of contactsHiddenFromManager.
  const responseClients = clients.map((client) => {
    const shouldMask = session.role === "manager" && client.contactsHiddenFromManager;
    const { phone, email, messenger, vladShareRatePercentOverride, ...rest } = client;
    return {
      ...rest,
      phone: shouldMask ? null : phone,
      email: shouldMask ? null : email,
      messenger: shouldMask ? null : messenger,
      contactsHidden: shouldMask,
      ...(session.role === "owner" ? { vladShareRatePercentOverride } : {}),
    };
  });

  return Response.json({ clients: responseClients });
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

  const { name, company, phone, messenger, email, source, selfSourced } =
    (body as {
      name?: unknown;
      company?: unknown;
      phone?: unknown;
      messenger?: unknown;
      email?: unknown;
      source?: unknown;
      selfSourced?: unknown;
    }) ?? {};

  if (typeof name !== "string" || !name.trim()) {
    return Response.json({ error: "Укажите имя клиента." }, { status: 400 });
  }
  // Email is optional — a client without one just never gets /account
  // portal access (that login is keyed by email), same as any other
  // not-yet-activated account. Format is still checked when provided.
  const hasEmail = typeof email === "string" && email.trim();
  if (hasEmail && !EMAIL_RE.test((email as string).trim())) {
    return Response.json({ error: "Укажите корректный email." }, { status: 400 });
  }
  // Phone is optional too now — only the name is truly required at
  // creation (see PB-V5 chat 2026-07-30). Format is still enforced when
  // provided, same reasoning as email above. Enforced here (not just the
  // input mask) so a normalized, filterable/exportable shape lands in the
  // DB regardless of how the request was made — see lib/phone.ts.
  const hasPhone = typeof phone === "string" && phone.trim();
  const normalizedPhone = hasPhone ? normalizePhone(phone as string) : null;
  if (hasPhone && !normalizedPhone) {
    return Response.json({ error: "Укажите номер телефона полностью: +7 (XXX) XXX-XX-XX, или международный, с кодом страны через «+»." }, { status: 400 });
  }

  const VALID_SOURCES = ["instagram", "telegram", "website", "referral", "other"];
  const normalizedSource = typeof source === "string" && VALID_SOURCES.includes(source) ? source : null;

  const normalizedEmail = hasEmail ? (email as string).trim().toLowerCase() : null;
  if (normalizedEmail) {
    const existing = await prisma.client.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      return Response.json({ error: "Клиент с таким email уже существует." }, { status: 409 });
    }
  }

  // "Ваш личный клиент" at creation time just pre-fills the same claim a
  // manager could otherwise make afterward via "Заявить как личного
  // клиента" — still needs senior/owner confirmation before it actually
  // affects premium (see confirm-self-sourced route), this only saves the
  // separate follow-up click.
  const isSelfSourced = selfSourced === true;

  const client = await prisma.client.create({
    data: {
      displayId: await nextClientDisplayId(),
      name: name.trim(),
      company: typeof company === "string" && company.trim() ? company.trim() : null,
      messenger: typeof messenger === "string" && messenger.trim() ? messenger.trim() : null,
      email: normalizedEmail,
      phone: normalizedPhone,
      source: normalizedSource as never,
      createdByManagerId: session.managerId,
      ...(isSelfSourced ? { selfSourcedClaimed: true, selfSourcedClaimedAt: new Date() } : {}),
    },
  });

  return Response.json({ client }, { status: 201 });
}
