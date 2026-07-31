import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { prisma } from "@/lib/prisma";

// Purely personal — every manager (including the owner, who can plan their
// own day too) sees and manages only their own items here. The cross-
// manager view for owner/senior lives in a separate route
// (manager-daily-plan-summary), read-only, since editing someone else's
// list would defeat the point of a personal checklist.

function dayBounds(dateParam: string | null): { start: Date; end: Date } {
  // <input type="date">/query param is a plain "YYYY-MM-DD" — treated as a
  // UTC calendar day (same convention as CashOrder's date field elsewhere
  // in this app), not the browser's local midnight.
  const base = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? new Date(`${dateParam}T00:00:00.000Z`) : new Date();
  const start = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate()));
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

export async function GET(req: NextRequest) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  const { start, end } = dayBounds(req.nextUrl.searchParams.get("date"));

  const items = await prisma.dailyPlanItem.findMany({
    where: { managerId: session.managerId, planDate: { gte: start, lt: end } },
    orderBy: { createdAt: "asc" },
    include: {
      client: { select: { id: true, name: true, company: true } },
      quoteDraftRequest: { select: { id: true, displayId: true } },
    },
  });

  return Response.json({ items });
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
  const { note, clientId, quoteDraftRequestId, date } =
    (body as { note?: unknown; clientId?: unknown; quoteDraftRequestId?: unknown; date?: unknown }) ?? {};

  if (typeof note !== "string" || !note.trim()) {
    return Response.json({ error: "Укажите, что запланировано." }, { status: 400 });
  }

  if (typeof clientId === "string" && clientId) {
    const client = await prisma.client.findUnique({ where: { id: clientId } });
    if (!client) return Response.json({ error: "Клиент не найден." }, { status: 404 });
  }
  if (typeof quoteDraftRequestId === "string" && quoteDraftRequestId) {
    const draft = await prisma.quoteDraftRequest.findUnique({ where: { id: quoteDraftRequestId } });
    if (!draft) return Response.json({ error: "Черновик не найден." }, { status: 404 });
  }

  const { start } = dayBounds(typeof date === "string" ? date : null);

  const item = await prisma.dailyPlanItem.create({
    data: {
      managerId: session.managerId,
      planDate: start,
      note: note.trim(),
      clientId: typeof clientId === "string" && clientId ? clientId : null,
      quoteDraftRequestId: typeof quoteDraftRequestId === "string" && quoteDraftRequestId ? quoteDraftRequestId : null,
    },
    include: {
      client: { select: { id: true, name: true, company: true } },
      quoteDraftRequest: { select: { id: true, displayId: true } },
    },
  });

  return Response.json({ item }, { status: 201 });
}
