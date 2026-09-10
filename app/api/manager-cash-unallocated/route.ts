import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { canViewCash } from "@/lib/manager-scope";
import { prisma } from "@/lib/prisma";

// Нераспределённая сумма — деньги клиента, уже полученные на выкуп, но
// ещё не потраченные на закупку (см. CashUnallocatedAmount в
// prisma/schema.prisma). Один ряд на счёт, PUT всегда обновляет тот же
// ряд, а не копит историю — тот же паттерн, что и
// app/api/manager-cash-opening-balance/route.ts.
//
// ?accountId= — сумма одного счёта. Без accountId — сумма по ВСЕМ активным
// счетам сразу (для карточки "Все счета"). См. PB-V5 chat 2026-09-07.
export async function GET(req: NextRequest) {
  const session = await getManagerSessionFromRequest(req);
  if (!session || !(await canViewCash(session))) {
    return Response.json({ error: "Нет доступа к кассе." }, { status: 403 });
  }

  const accountId = req.nextUrl.searchParams.get("accountId");
  if (accountId) {
    const row = await prisma.cashUnallocatedAmount.findUnique({ where: { accountId } });
    return Response.json({ amountCny: row ? Number(row.amountCny) : 0 });
  }

  const rows = await prisma.cashUnallocatedAmount.findMany({
    where: { account: { active: true } },
    select: { amountCny: true },
  });
  const amountCny = rows.reduce((sum, r) => sum + Number(r.amountCny), 0);
  return Response.json({ amountCny });
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
  const { accountId, amountCny } = (body as { accountId?: unknown; amountCny?: unknown }) ?? {};
  if (typeof accountId !== "string" || !accountId) {
    return Response.json({ error: "Укажите счёт." }, { status: 400 });
  }
  const account = await prisma.cashAccount.findUnique({ where: { id: accountId } });
  if (!account) {
    return Response.json({ error: "Счёт не найден." }, { status: 400 });
  }
  const amount = Number(amountCny);
  if (!Number.isFinite(amount) || amount < 0) {
    return Response.json({ error: "Укажите сумму (неотрицательное число)." }, { status: 400 });
  }

  const row = await prisma.cashUnallocatedAmount.upsert({
    where: { accountId },
    update: { amountCny: amount, updatedByManagerId: session.managerId },
    create: { accountId, amountCny: amount, updatedByManagerId: session.managerId },
  });

  return Response.json({ amountCny: Number(row.amountCny) });
}
