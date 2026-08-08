import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { canViewCash } from "@/lib/manager-scope";
import { prisma } from "@/lib/prisma";

// Перевод денег между СЧЕТАМИ (см. CashAccount/CashTransfer в
// prisma/schema.prisma) — НЕ доход/расход компании, отдельная модель и
// отдельная "история" (см. запрос пользователя "с записями в истории"),
// не смешанная с обычной лентой Приходных/Расходных ордеров. Тот же
// Manager.canViewCash gate, что и весь остальной раздел «Касса». См.
// PB-V5 chat 2026-08-08.
export async function GET(req: NextRequest) {
  const session = await getManagerSessionFromRequest(req);
  if (!session || !(await canViewCash(session))) {
    return Response.json({ error: "Нет доступа к кассе." }, { status: 403 });
  }

  // Необязательный — как и у /api/manager-cash-orders, "YYYY-MM" сужает до
  // одного месяца; без него отдаёт всю историю переводов (их объём в
  // принципе намного меньше, чем у обычных ордеров).
  const monthParam = req.nextUrl.searchParams.get("month");
  const match = monthParam?.match(/^(\d{4})-(\d{2})$/);
  const dateFilter = match
    ? { date: { gte: new Date(Number(match[1]), Number(match[2]) - 1, 1), lt: new Date(Number(match[1]), Number(match[2]), 1) } }
    : {};

  const transfers = await prisma.cashTransfer.findMany({
    where: dateFilter,
    include: {
      fromAccount: { select: { id: true, name: true } },
      toAccount: { select: { id: true, name: true } },
      createdByManager: { select: { name: true } },
    },
    orderBy: { date: "desc" },
  });

  return Response.json({ transfers });
}

export async function POST(req: NextRequest) {
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
  const { date, fromAccountId, toAccountId, currency, amount, cnyToCurrencyRate, comment } =
    (body as {
      date?: unknown;
      fromAccountId?: unknown;
      toAccountId?: unknown;
      currency?: unknown;
      amount?: unknown;
      cnyToCurrencyRate?: unknown;
      comment?: unknown;
    }) ?? {};

  const parsedDate = typeof date === "string" ? new Date(date) : null;
  if (!parsedDate || Number.isNaN(parsedDate.getTime())) {
    return Response.json({ error: "Укажите дату." }, { status: 400 });
  }
  if (typeof fromAccountId !== "string" || !fromAccountId) {
    return Response.json({ error: "Укажите счёт списания." }, { status: 400 });
  }
  if (typeof toAccountId !== "string" || !toAccountId) {
    return Response.json({ error: "Укажите счёт зачисления." }, { status: 400 });
  }
  if (fromAccountId === toAccountId) {
    return Response.json({ error: "Счета списания и зачисления должны различаться." }, { status: 400 });
  }
  const [fromAccount, toAccount] = await Promise.all([
    prisma.cashAccount.findUnique({ where: { id: fromAccountId } }),
    prisma.cashAccount.findUnique({ where: { id: toAccountId } }),
  ]);
  if (!fromAccount) return Response.json({ error: "Счёт списания не найден." }, { status: 400 });
  if (!toAccount) return Response.json({ error: "Счёт зачисления не найден." }, { status: 400 });

  if (currency !== "cny" && currency !== "usd" && currency !== "rub") {
    return Response.json({ error: "Некорректная валюта." }, { status: 400 });
  }
  const amountNum = Number(amount);
  if (!Number.isFinite(amountNum) || amountNum <= 0) {
    return Response.json({ error: "Укажите сумму." }, { status: 400 });
  }
  const rateNum = currency === "cny" ? 1 : Number(cnyToCurrencyRate);
  if (!Number.isFinite(rateNum) || rateNum <= 0) {
    return Response.json({ error: "Укажите курс." }, { status: 400 });
  }

  const transfer = await prisma.cashTransfer.create({
    data: {
      date: parsedDate,
      fromAccountId,
      toAccountId,
      currency,
      amount: amountNum,
      cnyToCurrencyRate: rateNum,
      amountCny: amountNum / rateNum,
      comment: typeof comment === "string" ? comment.trim() : "",
      createdByManagerId: session.managerId,
    },
    include: {
      fromAccount: { select: { id: true, name: true } },
      toAccount: { select: { id: true, name: true } },
      createdByManager: { select: { name: true } },
    },
  });

  return Response.json({ transfer }, { status: 201 });
}
