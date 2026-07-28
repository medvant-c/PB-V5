import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { getVisibleManagerIds } from "@/lib/manager-scope";
import { prisma } from "@/lib/prisma";
import { nextClientDisplayId } from "@/lib/display-ids";

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
      active: true,
      archivedAt: true,
      createdAt: true,
    },
  });

  // A plain manager never sees the real contact fields for a client the
  // senior/owner has explicitly hidden (see Client.contactsHiddenFromManager)
  // — stripped here, server-side, not just hidden in the UI, since the API
  // response itself must never carry the real values in that case.
  const responseClients = clients.map((client) => {
    const shouldMask = session.role === "manager" && client.contactsHiddenFromManager;
    if (!shouldMask) return { ...client, contactsHidden: false };
    const { phone, email, messenger, ...rest } = client;
    void phone;
    void email;
    void messenger;
    return { ...rest, phone: null, email: null, messenger: null, contactsHidden: true };
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

  const { name, company, phone, messenger, email, source } =
    (body as {
      name?: unknown;
      company?: unknown;
      phone?: unknown;
      messenger?: unknown;
      email?: unknown;
      source?: unknown;
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
  if (typeof phone !== "string" || !phone.trim()) {
    return Response.json({ error: "Укажите телефон." }, { status: 400 });
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

  const client = await prisma.client.create({
    data: {
      displayId: await nextClientDisplayId(),
      name: name.trim(),
      company: typeof company === "string" && company.trim() ? company.trim() : null,
      messenger: typeof messenger === "string" && messenger.trim() ? messenger.trim() : null,
      email: normalizedEmail,
      phone: phone.trim(),
      source: normalizedSource as never,
      createdByManagerId: session.managerId,
    },
  });

  return Response.json({ client }, { status: 201 });
}
