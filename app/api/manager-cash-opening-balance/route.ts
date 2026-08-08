import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { canViewCash } from "@/lib/manager-scope";
import { prisma } from "@/lib/prisma";

// Один anchor-ряд НА СЧЁТ (см. CashAccount/CashOpeningBalance.accountId в
// prisma/schema.prisma) — GET возвращает якорь конкретного счёта (или null,
// если для него ещё не задан), PUT всегда обновляет тот же ряд для этого
// счёта, а не копит историю якорей. См. PB-V5 chat 2026-08-08.
export async function GET(req: NextRequest) {
  const session = await getManagerSessionFromRequest(req);
  if (!session || !(await canViewCash(session))) {
    return Response.json({ error: "Нет доступа к кассе." }, { status: 403 });
  }

  const accountId = req.nextUrl.searchParams.get("accountId");
  if (!accountId) {
    return Response.json({ error: "Укажите счёт." }, { status: 400 });
  }

  const balance = await prisma.cashOpeningBalance.findFirst({ where: { accountId }, orderBy: { updatedAt: "desc" } });
  return Response.json({ balance });
}

export async function PUT(req: NextRequest) {
  const session = await getManagerSessionFromRequest(req);
  if (!session || !(await canViewCash(session))) {
    return Response.json({ error: "Нет доступа к кассе." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Некорректный запрос." }, { status: 400 });
  }
  const { accountId, effectiveDate, amountCny } =
    (body as { accountId?: unknown; effectiveDate?: unknown; amountCny?: unknown }) ?? {};
  if (typeof accountId !== "string" || !accountId) {
    return Response.json({ error: "Укажите счёт." }, { status: 400 });
  }
  const account = await prisma.cashAccount.findUnique({ where: { id: accountId } });
  if (!account) {
    return Response.json({ error: "Счёт не найден." }, { status: 400 });
  }
  const parsedDate = typeof effectiveDate === "string" ? new Date(effectiveDate) : null;
  if (!parsedDate || Number.isNaN(parsedDate.getTime())) {
    return Response.json({ error: "Укажите дату." }, { status: 400 });
  }
  const amount = Number(amountCny);
  if (!Number.isFinite(amount)) {
    return Response.json({ error: "Укажите сумму." }, { status: 400 });
  }

  const existing = await prisma.cashOpeningBalance.findFirst({ where: { accountId }, orderBy: { updatedAt: "desc" } });
  const balance = existing
    ? await prisma.cashOpeningBalance.update({
        where: { id: existing.id },
        data: { effectiveDate: parsedDate, amountCny: amount, updatedByManagerId: session.managerId },
      })
    : await prisma.cashOpeningBalance.create({
        data: { accountId, effectiveDate: parsedDate, amountCny: amount, updatedByManagerId: session.managerId },
      });

  return Response.json({ balance });
}
