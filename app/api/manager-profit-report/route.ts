import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { prisma } from "@/lib/prisma";
import { buildProfitReport, parseQuoteIds } from "@/lib/desk-services/profit-report";
import { isQuoteStatus } from "@/lib/quote-statuses";

// Owner-only "сколько мы заработаем на этих сделках" report — the owner
// checkbox-selects any set of quotes (across all clients/managers, not
// scoped to one like every other quote list in this app) and gets back the
// exact same per-quote profit math the dashboard's aggregate numbers are
// built from (see lib/desk-services/quote-profit.ts), plus what's actually
// left for him after Влад's cut and every manager's premium — not just
// gross company profit. See PB-V5 chat 2026-07-31.
async function requireOwner(req: NextRequest) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) return { error: Response.json({ error: "Не авторизовано." }, { status: 401 }) } as const;
  if (session.role !== "owner") {
    return { error: Response.json({ error: "Доступно только руководителю." }, { status: 403 }) } as const;
  }
  return { session } as const;
}

// GET: the selection list — every quote, lightweight fields only, with
// optional filters (matches the ConfirmationsArchive filter-bar UX). Full
// profit numbers are only computed for whatever subset gets POSTed below —
// no point running the real math for quotes the owner never selects.
export async function GET(req: NextRequest) {
  const gate = await requireOwner(req);
  if ("error" in gate) return gate.error;

  const managerIdParam = req.nextUrl.searchParams.get("managerId");
  const clientIdParam = req.nextUrl.searchParams.get("clientId");
  const statusParam = req.nextUrl.searchParams.get("status");
  const dateFromParam = req.nextUrl.searchParams.get("dateFrom");
  const dateToParam = req.nextUrl.searchParams.get("dateTo");

  const dateFrom = dateFromParam ? new Date(dateFromParam) : null;
  const dateTo = dateToParam ? new Date(dateToParam) : null;
  if (dateTo) dateTo.setHours(23, 59, 59, 999);

  const [quotes, managers, clients] = await Promise.all([
    prisma.quote.findMany({
      where: {
        ...(managerIdParam ? { managerId: managerIdParam } : {}),
        ...(clientIdParam ? { clientId: clientIdParam } : {}),
        ...(statusParam && isQuoteStatus(statusParam) ? { status: statusParam } : {}),
        ...(dateFrom || dateTo ? { createdAt: { ...(dateFrom ? { gte: dateFrom } : {}), ...(dateTo ? { lte: dateTo } : {}) } } : {}),
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        displayId: true,
        productName: true,
        status: true,
        totalRub: true,
        createdAt: true,
        buyoutFactConfirmed: true,
        manager: { select: { id: true, name: true } },
        client: { select: { id: true, name: true, company: true } },
      },
    }),
    prisma.manager.findMany({ where: { active: true }, orderBy: { displayId: "asc" }, select: { id: true, name: true } }),
    prisma.client.findMany({ orderBy: { displayId: "asc" }, select: { id: true, name: true, company: true } }),
  ]);

  return Response.json({ quotes, managers, clients });
}

export async function POST(req: NextRequest) {
  const gate = await requireOwner(req);
  if ("error" in gate) return gate.error;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Некорректный запрос." }, { status: 400 });
  }
  const quoteIds = parseQuoteIds(body);
  if (!quoteIds) {
    return Response.json({ error: "Выберите хотя бы один просчёт." }, { status: 400 });
  }

  const report = await buildProfitReport(quoteIds);
  return Response.json(report);
}
