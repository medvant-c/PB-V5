import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { canViewCash } from "@/lib/manager-scope";
import { prisma } from "@/lib/prisma";
import { syncQuotePaymentAllocationForCashOrder } from "@/lib/desk-services/cash-order-profit-sync";

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
  // Если этот ордер УЖЕ реально засчитан в прибыль (см.
  // cash-order-profit-sync.ts) — premiumRub там заморожен на момент
  // создания, как и у «Счёта на выкуп»; редактирование суммы/категории
  // задним числом означало бы либо тихо пересчитывать чужую уже
  // выплаченную премию, либо расходиться с ней. Проще и безопаснее
  // запретить редактирование целиком — удалить и завести заново (каскадно
  // удалит и распределение, см. QuotePaymentAllocation.cashOrder onDelete:
  // Cascade). См. PB-V5 chat 2026-08-07.
  const alreadyCreditsProfit = (await prisma.quotePaymentAllocation.count({ where: { cashOrderId: id } })) > 0;
  if (alreadyCreditsProfit) {
    return Response.json(
      { error: "Этот ордер уже засчитан в прибыль — редактирование недоступно, чтобы не исказить уже начисленную премию. Удалите и создайте заново." },
      { status: 400 },
    );
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

  // Та же логика, что в POST (см. manager-cash-orders/route.ts) — только
  // здесь `existing` уже гарантированно без начисленной прибыли (проверено
  // выше), так что просто создаём распределение, если новые данные под
  // него подходят.
  const shouldCreditProfit =
    existing.type === "income" &&
    resolvedQuoteId !== null &&
    category.linkedProfitCategory !== null &&
    currency === "rub" &&
    (session.role === "owner" || session.role === "senior");

  try {
    await prisma.$transaction(async (tx) => {
      await tx.cashOrder.update({
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
      });
      if (shouldCreditProfit) {
        const result = await syncQuotePaymentAllocationForCashOrder(tx, {
          cashOrderId: id,
          quoteId: resolvedQuoteId!,
          linkedProfitCategory: category.linkedProfitCategory!,
          amountRub: amountNum,
          createdByManagerId: session.managerId,
        });
        if (!result.ok) throw new Error(result.error);
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось сохранить ордер.";
    return Response.json({ error: message }, { status: 400 });
  }

  const order = await prisma.cashOrder.findUnique({
    where: { id },
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
