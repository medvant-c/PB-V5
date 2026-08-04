import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { prisma } from "@/lib/prisma";
import { isSelfSourcedFor } from "@/lib/desk-services/quote-profit";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// Owner-only manual override of the manager's flat cargo bonus %
// (Quote.cargoBonusRatePercent in prisma/schema.prisma) for ONE specific
// deal — normally auto-set to 10 (self-sourced) or 0 (company-lead) the
// moment a quote reaches "выдано клиенту" and never touched again. Lets
// the owner reward (or reduce) a manager's cargo cut case-by-case without
// changing the global rate for everyone.
//
// Only usable once the normal auto-lock has already happened
// (cargoBonusRatePercent !== null) — this EDITS an already-locked value,
// it never locks one in early: the same field also gates when a
// flat_per_cargo_kg investor (e.g. Юра) gets paid (see
// deliveredCargoQuotes in manager-dashboard/route.ts), and setting it
// before cargo is actually delivered would pay that investor out too
// soon. Only meaningful for a self-sourced client — company-lead quotes
// get zero by design, no exceptions. See PB-V5 chat 2026-08-01.
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }
  if (session.role !== "owner") {
    return Response.json({ error: "Доступно только руководителю." }, { status: 403 });
  }

  const { id } = await params;
  const quote = await prisma.quote.findUnique({
    where: { id },
    include: { client: { select: { selfSourcedConfirmed: true, createdByManagerId: true } } },
  });
  if (!quote || quote.deletedAt) {
    return Response.json({ error: "Просчёт не найден." }, { status: 404 });
  }
  if (quote.cargoBonusRatePercent === null) {
    return Response.json({ error: "Ставка ещё не зафиксирована — карго должно быть выдано клиенту." }, { status: 400 });
  }
  if (!isSelfSourcedFor(quote.client, quote.managerId)) {
    return Response.json({ error: "Премия за карго начисляется только по своим клиентам менеджера." }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Некорректный запрос." }, { status: 400 });
  }
  const { ratePercent } = (body as { ratePercent?: unknown }) ?? {};
  const value = Number(ratePercent);
  if (!Number.isFinite(value) || value < 0) {
    return Response.json({ error: "Ставка должна быть неотрицательным числом." }, { status: 400 });
  }

  const updated = await prisma.quote.update({
    where: { id },
    data: { cargoBonusRatePercent: value },
    select: { id: true, cargoBonusRatePercent: true },
  });

  return Response.json({ quote: updated });
}
