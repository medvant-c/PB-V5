import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { canAccessManagerQuote, canViewCash } from "@/lib/manager-scope";
import { prisma } from "@/lib/prisma";
import {
  getOrCreateExpenseCategory,
  GOODS_EXPENSE_CATEGORY_NAME,
  CHINA_DELIVERY_EXPENSE_CATEGORY_NAME,
  CARGO_EXPENSE_CATEGORY_NAME,
} from "@/lib/desk-services/cash-categories";
import { computeRealBuyoutProfit, computeRealCargoProfit } from "@/lib/desk-services/quote-profit";
import { fetchQuoteRealFinancials, emptyQuoteRealFinancials } from "@/lib/desk-services/quote-real-financials";
import { BUYOUT_REALIZED_STATUSES, CARGO_REALIZED_STATUSES } from "@/lib/quote-statuses";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// Прогресс оплаты блоков Выкуп/Карго для карточки просчёта (см.
// clients-tab.tsx) — сколько реально пришло/потрачено и покрыт ли блок
// полностью. Та же математика, что и в дашборде/отчётах (см.
// lib/desk-services/quote-profit.ts), просто на один просчёт за раз. См.
// PB-V5 chat 2026-08-11.
export async function GET(req: NextRequest, { params }: RouteParams) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }
  if (!(await canViewCash(session))) {
    return Response.json({ error: "Нет доступа к кассе." }, { status: 403 });
  }

  const { id } = await params;
  const quote = await prisma.quote.findUnique({
    where: { id },
    select: {
      managerId: true,
      deletedAt: true,
      status: true,
      totalPriceRub: true,
      chinaDeliveryRub: true,
      buyoutCommissionRub: true,
      cargoDeliveryRub: true,
      paymentAllocations: { select: { category: true, amountRub: true } },
    },
  });
  if (!quote || quote.deletedAt) {
    return Response.json({ error: "Просчёт не найден." }, { status: 404 });
  }
  if (!(await canAccessManagerQuote(session, quote.managerId))) {
    return Response.json({ error: "Нет доступа к этому просчёту." }, { status: 403 });
  }

  const [attachedServiceSum, financials] = await Promise.all([
    prisma.quoteAttachedService.aggregate({ where: { quoteId: id }, _sum: { priceRub: true } }),
    fetchQuoteRealFinancials([id]),
  ]);
  const attachedServicesTotalRub = Number(attachedServiceSum._sum.priceRub ?? 0);
  const fin = financials.get(id) ?? emptyQuoteRealFinancials();

  // "Реализован" — по статусу сделки (см. BUYOUT_REALIZED_STATUSES/
  // CARGO_REALIZED_STATUSES в lib/quote-statuses.ts), не по полноте
  // оплаты — как только менеджер перевёл сделку в этот статус, товар/
  // карго уже реально куплены. paidRub может быть меньше owedRub даже
  // после этого (например, аванс под производство под заказ) — это
  // нормально, отчёт просто показывает то, что реально прошло по Кассе.
  const real = computeRealBuyoutProfit({ allocations: quote.paymentAllocations, expenseRub: fin.buyoutExpenseRub });
  const realCargo = computeRealCargoProfit({ incomeRub: fin.cargoIncomeRub, expenseRub: fin.cargoExpenseRub });

  return Response.json({
    buyout: {
      paidRub: real.incomeRub,
      owedRub: Number(quote.totalPriceRub) + Number(quote.chinaDeliveryRub) + Number(quote.buyoutCommissionRub) + attachedServicesTotalRub,
      expenseRub: real.expenseRub,
      realized: BUYOUT_REALIZED_STATUSES.includes(quote.status),
    },
    cargo: {
      paidRub: realCargo.incomeRub,
      owedRub: Number(quote.cargoDeliveryRub),
      expenseRub: realCargo.expenseRub,
      realized: CARGO_REALIZED_STATUSES.includes(quote.status),
    },
  });
}

// "Расходный ордер" shortcut straight from a quote card — раньше это
// значило уйти во вкладку «Касса» и вручную найти там того же клиента и
// тот же просчёт заново. Заводит до трёх расходных ордеров сразу
// («Закупка товара» / «Доставка по Китаю» / «Расход по карго», все — то,
// что реально потратили, в ¥, минус со ВЫБРАННОГО счёта), привязанных к
// этому просчёту так же, как это уже делали вручную из Кассы — просто без
// повторного поиска клиента/просчёта. Это и есть источник "реального
// расхода" для нового расчёта прибыли (см. lib/desk-services/quote-real-
// financials.ts) — Quote.actualBuyoutCny/buyoutFactConfirmed для НОВЫХ
// сделок больше не используются вовсе. См. PB-V5 chat 2026-08-11.
export async function POST(req: NextRequest, { params }: RouteParams) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }
  if (!(await canViewCash(session))) {
    return Response.json({ error: "Нет доступа к кассе." }, { status: 403 });
  }

  const { id } = await params;
  const quote = await prisma.quote.findUnique({ where: { id } });
  if (!quote || quote.deletedAt) {
    return Response.json({ error: "Просчёт не найден." }, { status: 404 });
  }
  if (!(await canAccessManagerQuote(session, quote.managerId))) {
    return Response.json({ error: "Нет доступа к этому просчёту." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Некорректный запрос." }, { status: 400 });
  }
  const { accountId, date: dateRaw, goodsAmountCny, chinaDeliveryAmountCny, cargoAmountCny, comment: commentRaw } =
    (body as {
      accountId?: unknown;
      date?: unknown;
      goodsAmountCny?: unknown;
      chinaDeliveryAmountCny?: unknown;
      cargoAmountCny?: unknown;
      comment?: unknown;
    }) ?? {};

  if (typeof accountId !== "string" || !accountId) {
    return Response.json({ error: "Укажите счёт списания." }, { status: 400 });
  }
  const account = await prisma.cashAccount.findUnique({ where: { id: accountId } });
  if (!account) {
    return Response.json({ error: "Счёт не найден." }, { status: 400 });
  }
  const items: { amount: number; categoryName: string }[] = [];
  for (const [raw, categoryName] of [
    [goodsAmountCny, GOODS_EXPENSE_CATEGORY_NAME],
    [chinaDeliveryAmountCny, CHINA_DELIVERY_EXPENSE_CATEGORY_NAME],
    [cargoAmountCny, CARGO_EXPENSE_CATEGORY_NAME],
  ] as const) {
    const amount = Number(raw);
    if (Number.isFinite(amount) && amount > 0) items.push({ amount, categoryName });
  }
  if (items.length === 0) {
    return Response.json({ error: "Укажите сумму закупки товара, доставки по Китаю или расхода по карго." }, { status: 400 });
  }
  const date = typeof dateRaw === "string" && dateRaw ? new Date(dateRaw) : new Date();
  const comment = typeof commentRaw === "string" ? commentRaw.trim() : "";
  const defaultComment = `Просчёт №${quote.displayId} — ${quote.productName}`;

  const created = await prisma.$transaction(async (tx) => {
    const orders = [];
    for (const item of items) {
      const category = await getOrCreateExpenseCategory(item.categoryName);
      orders.push(
        await tx.cashOrder.create({
          data: {
            type: "expense",
            date,
            accountId,
            categoryId: category.id,
            clientId: quote.clientId,
            quoteId: quote.id,
            currency: "cny",
            amount: item.amount,
            cnyToCurrencyRate: 1,
            amountCny: item.amount,
            comment: comment || defaultComment,
            createdByManagerId: session.managerId,
          },
        }),
      );
    }
    return orders;
  });

  return Response.json({ orders: created }, { status: 201 });
}
