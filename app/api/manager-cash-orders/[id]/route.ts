import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { canViewCash } from "@/lib/manager-scope";
import { prisma } from "@/lib/prisma";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// Full-record edit — accepts the same shape as POST and recomputes
// amountCny, rather than a partial patch, since every field can change
// together (e.g. correcting both the currency and the amount at once).
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const session = await getManagerSessionFromRequest(req);
  if (!session || !(await canViewCash(session))) {
    return Response.json({ error: "Нет доступа к кассе." }, { status: 403 });
  }

  const { id } = await params;
  const existing = await prisma.cashOrder.findUnique({ where: { id } });
  if (!existing) return Response.json({ error: "Ордер не найден." }, { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Некорректный запрос." }, { status: 400 });
  }
  const { date, categoryId, clientId, quoteId, currency, amount, cnyToCurrencyRate, comment } =
    (body as {
      date?: unknown;
      categoryId?: unknown;
      clientId?: unknown;
      quoteId?: unknown;
      currency?: unknown;
      amount?: unknown;
      cnyToCurrencyRate?: unknown;
      comment?: unknown;
    }) ?? {};

  const parsedDate = typeof date === "string" ? new Date(date) : null;
  if (!parsedDate || Number.isNaN(parsedDate.getTime())) {
    return Response.json({ error: "Укажите дату." }, { status: 400 });
  }
  if (typeof categoryId !== "string" || !categoryId) {
    return Response.json({ error: "Укажите статью." }, { status: 400 });
  }
  const category = await prisma.cashCategory.findUnique({ where: { id: categoryId } });
  if (!category || category.type !== existing.type) {
    return Response.json({ error: "Статья не соответствует типу ордера." }, { status: 400 });
  }
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

  let resolvedClientId: string | null = null;
  if (typeof clientId === "string" && clientId) {
    const client = await prisma.client.findUnique({ where: { id: clientId } });
    if (!client) return Response.json({ error: "Клиент не найден." }, { status: 400 });
    resolvedClientId = clientId;
  }

  let resolvedQuoteId: string | null = null;
  if (typeof quoteId === "string" && quoteId) {
    const quote = await prisma.quote.findUnique({ where: { id: quoteId }, select: { id: true, deletedAt: true, clientId: true } });
    if (!quote || quote.deletedAt) return Response.json({ error: "Просчёт не найден." }, { status: 400 });
    if (!resolvedClientId || quote.clientId !== resolvedClientId) {
      return Response.json({ error: "Просчёт должен принадлежать выбранному клиенту." }, { status: 400 });
    }
    resolvedQuoteId = quoteId;
  }

  const order = await prisma.cashOrder.update({
    where: { id },
    data: {
      date: parsedDate,
      categoryId,
      clientId: resolvedClientId,
      quoteId: resolvedQuoteId,
      currency,
      amount: amountNum,
      cnyToCurrencyRate: rateNum,
      amountCny: amountNum / rateNum,
      comment: typeof comment === "string" ? comment.trim() : "",
    },
    include: {
      category: true,
      client: { select: { id: true, name: true } },
      quote: { select: { id: true, displayId: true, productName: true } },
      createdByManager: { select: { name: true } },
    },
  });

  return Response.json({ order });
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const session = await getManagerSessionFromRequest(req);
  if (!session || !(await canViewCash(session))) {
    return Response.json({ error: "Нет доступа к кассе." }, { status: 403 });
  }

  const { id } = await params;
  const existing = await prisma.cashOrder.findUnique({ where: { id } });
  if (!existing) return Response.json({ error: "Ордер не найден." }, { status: 404 });

  await prisma.cashOrder.delete({ where: { id } });
  return Response.json({ ok: true });
}
