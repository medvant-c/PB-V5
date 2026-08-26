import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { getVisibleManagerIds } from "@/lib/manager-scope";
import { prisma } from "@/lib/prisma";
import { getSystemSettings } from "@/lib/system-settings";
import { getOrCreateBuyoutIncomeCategory, getDefaultCashAccount } from "@/lib/desk-services/cash-categories";
import {
  sumAlreadyPaidRubByCategory,
  isQuotePaymentCategory,
  rawQuotePaymentCategoryAmountRub,
  alreadyPaidRubForCategory,
  type QuotePaymentCategoryValue,
} from "@/lib/desk-services/buyout-invoice-calc";
import {
  computePaymentAllocationPremiumRub,
  isSelfSourcedFor,
  isPremiumEligiblePaymentCategory,
  type ManagerPremiumRates,
} from "@/lib/desk-services/quote-profit";

type Category = QuotePaymentCategoryValue;
const isCategory = isQuotePaymentCategory;

// Приходный ордер created straight from a quote card — owner/senior only
// (real money + immediate premium accrual, same trust level as
// confirm-buyout). One order can span several quotes/categories in a
// single dialog (e.g. one bank transfer covering "услуга поиска" on 3
// different quotes) — see QuotePaymentAllocation in prisma/schema.prisma
// for why the split lives in its own table instead of on CashOrder
// itself. Premium for each allocation is computed and frozen immediately
// (see computePaymentAllocationPremiumRub in quote-profit.ts — goods/
// china_delivery categories credit zero premium here, their real margin
// isn't known until confirm-buyout). See PB-V5 chat 2026-08-04.
export async function POST(req: NextRequest) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }
  if (session.role !== "owner" && session.role !== "senior") {
    return Response.json({ error: "Создавать приходные ордера может только старший менеджер или руководитель." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Некорректный запрос." }, { status: 400 });
  }
  const {
    amountRub: amountRubRaw,
    cnyToCurrencyRate: cnyToCurrencyRateRaw,
    date: dateRaw,
    comment: commentRaw,
    allocations: allocationsRaw,
    accountId: accountIdRaw,
  } = (body as Record<string, unknown>) ?? {};

  const amountRub = Number(amountRubRaw);
  if (!Number.isFinite(amountRub) || amountRub <= 0) {
    return Response.json({ error: "Укажите сумму оплаты в рублях." }, { status: 400 });
  }
  const cnyToCurrencyRate = Number(cnyToCurrencyRateRaw);
  if (!Number.isFinite(cnyToCurrencyRate) || cnyToCurrencyRate <= 0) {
    return Response.json({ error: "Укажите курс юаня." }, { status: 400 });
  }
  if (
    !Array.isArray(allocationsRaw) ||
    allocationsRaw.length === 0 ||
    !allocationsRaw.every(
      (a) =>
        a && typeof a === "object" && typeof (a as { quoteId?: unknown }).quoteId === "string" && isCategory((a as { category?: unknown }).category),
    )
  ) {
    return Response.json({ error: "Укажите хотя бы одно распределение по просчёту и услуге." }, { status: 400 });
  }
  const allocations = (allocationsRaw as { quoteId: string; category: Category; amountRub: unknown }[]).map((a) => ({
    quoteId: a.quoteId,
    category: a.category,
    amountRub: Number(a.amountRub),
  }));
  if (allocations.some((a) => !Number.isFinite(a.amountRub) || a.amountRub <= 0)) {
    return Response.json({ error: "Сумма по каждой строке должна быть положительным числом." }, { status: 400 });
  }
  const allocationsSumRub = allocations.reduce((sum, a) => sum + a.amountRub, 0);
  if (Math.abs(allocationsSumRub - amountRub) > 0.01) {
    return Response.json(
      { error: `Сумма по строкам (${Math.round(allocationsSumRub)} ₽) не совпадает с суммой ордера (${Math.round(amountRub)} ₽).` },
      { status: 400 },
    );
  }

  const visibleManagerIds = await getVisibleManagerIds(session);
  const quoteIds = [...new Set(allocations.map((a) => a.quoteId))];
  const quotes = await prisma.quote.findMany({
    where: {
      id: { in: quoteIds },
      deletedAt: null,
      ...(visibleManagerIds === "all" ? {} : { managerId: { in: visibleManagerIds } }),
    },
    include: { client: { select: { id: true, name: true, selfSourcedConfirmed: true, createdByManagerId: true } } },
  });
  if (quotes.length !== quoteIds.length) {
    return Response.json({ error: "Один или несколько просчётов не найдены или вне вашей зоны видимости." }, { status: 404 });
  }

  const quoteById = new Map(quotes.map((q) => [q.id, q]));
  const clientIds = new Set(quotes.map((q) => q.client.id));
  if (clientIds.size > 1) {
    return Response.json({ error: "Все выбранные просчёты должны принадлежать одному клиенту." }, { status: 400 });
  }
  const client = quotes[0].client;

  const [attachedServiceSums, existingAllocations, systemSettings] = await Promise.all([
    prisma.quoteAttachedService.groupBy({ by: ["quoteId"], where: { quoteId: { in: quoteIds } }, _sum: { priceRub: true } }),
    prisma.quotePaymentAllocation.findMany({ where: { quoteId: { in: quoteIds } }, select: { quoteId: true, category: true, amountRub: true } }),
    getSystemSettings(),
  ]);
  const attachedServicesTotalByQuoteId = new Map(attachedServiceSums.map((s) => [s.quoteId, Number(s._sum.priceRub ?? 0)]));
  const existingAllocationsByQuoteId = new Map<string, { category: string; amountRub: unknown }[]>();
  for (const a of existingAllocations) {
    const list = existingAllocationsByQuoteId.get(a.quoteId) ?? [];
    list.push(a);
    existingAllocationsByQuoteId.set(a.quoteId, list);
  }

  const premiumRates: ManagerPremiumRates = {
    normalRatePercent: Number(systemSettings.normalRatePercent),
    selfSourcedProscetRatePercent: Number(systemSettings.selfSourcedProscetRatePercent),
    selfSourcedBuyoutDiscountRatePercent: Number(systemSettings.selfSourcedBuyoutDiscountRatePercent),
  };

  // Validate every line against its own remaining balance BEFORE writing
  // anything — a partial success (some allocations saved, one rejected)
  // would leave the CashOrder's total out of sync with what actually got
  // recorded.
  const preparedAllocations: { quoteId: string; category: Category; amountRub: number; premiumRub: number; managerId: string }[] = [];
  for (const a of allocations) {
    const quote = quoteById.get(a.quoteId)!;
    const attachedServicesTotalRub = attachedServicesTotalByQuoteId.get(a.quoteId) ?? 0;
    const rawAmountRub = rawQuotePaymentCategoryAmountRub(quote, attachedServicesTotalRub, a.category);
    const alreadyPaidRub = sumAlreadyPaidRubByCategory(existingAllocationsByQuoteId.get(a.quoteId) ?? []);
    const remainingRub = Math.max(0, rawAmountRub - alreadyPaidRubForCategory(alreadyPaidRub, a.category));
    // "Товар"/"Доставка по Китаю" остаются жёстко привязаны к реальной
    // себестоимости — превысить остаток по ним нельзя. Безмаржинальные
    // категории (те же, что уже премируются — см.
    // PREMIUM_ELIGIBLE_PAYMENT_CATEGORIES в quote-profit.ts) можно
    // получить сверх расчётного остатка: округление в пользу клиента и
    // курсовая наценка бота иногда дают реально больше денег, чем сама
    // услуга стоит по тарифу — это чистая допприбыль, а не оплата сверх
    // цены за конкретный товар. См. PB-V5 chat 2026-08-26.
    if (a.amountRub > remainingRub + 0.01 && !isPremiumEligiblePaymentCategory(a.category)) {
      return Response.json(
        {
          error: `Просчёт №${quote.displayId}: остаток по «${a.category}» — ${Math.round(remainingRub)} ₽, а указано ${Math.round(a.amountRub)} ₽.`,
        },
        { status: 400 },
      );
    }

    const isBoosted = isSelfSourcedFor(quote.client, quote.managerId);
    const premiumRub = computePaymentAllocationPremiumRub(a.category, a.amountRub, isBoosted, premiumRates);
    preparedAllocations.push({ quoteId: a.quoteId, category: a.category, amountRub: a.amountRub, premiumRub, managerId: quote.managerId });
  }

  const category = await getOrCreateBuyoutIncomeCategory();
  // Explicit choice from the dialog wins; falls back to the same
  // self-healing default only for callers that don't pass one at all — see
  // getDefaultCashAccount's own comment.
  let resolvedAccountId: string;
  if (typeof accountIdRaw === "string" && accountIdRaw) {
    const account = await prisma.cashAccount.findUnique({ where: { id: accountIdRaw } });
    if (!account) {
      return Response.json({ error: "Счёт не найден." }, { status: 400 });
    }
    resolvedAccountId = account.id;
  } else {
    resolvedAccountId = (await getDefaultCashAccount()).id;
  }
  const date = typeof dateRaw === "string" && dateRaw ? new Date(dateRaw) : new Date();
  const quoteDisplayIds = quotes.map((q) => q.displayId).sort((a, b) => a - b);
  const comment =
    typeof commentRaw === "string" && commentRaw.trim()
      ? commentRaw.trim()
      : `Оплата по просчётам №${quoteDisplayIds.join(", №")} — ${client.name}`;

  const result = await prisma.$transaction(async (tx) => {
    const cashOrder = await tx.cashOrder.create({
      data: {
        type: "income",
        date,
        accountId: resolvedAccountId,
        categoryId: category.id,
        clientId: client.id,
        currency: "rub",
        amount: amountRub,
        cnyToCurrencyRate,
        amountCny: amountRub / cnyToCurrencyRate,
        comment,
        createdByManagerId: session.managerId,
      },
    });
    await tx.quotePaymentAllocation.createMany({
      data: preparedAllocations.map((a) => ({
        cashOrderId: cashOrder.id,
        quoteId: a.quoteId,
        category: a.category,
        amountRub: a.amountRub,
        premiumRub: a.premiumRub,
        createdByManagerId: session.managerId,
      })),
    });
    return cashOrder;
  });

  return Response.json({ cashOrder: result, allocationsCount: preparedAllocations.length });
}
