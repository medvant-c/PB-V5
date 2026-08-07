import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import {
  sumAlreadyPaidRubByCategory,
  rawQuotePaymentCategoryAmountRub,
  alreadyPaidRubForCategory,
  type QuotePaymentCategoryValue,
} from "@/lib/desk-services/buyout-invoice-calc";
import { computePaymentAllocationPremiumRub, isSelfSourcedFor, type ManagerPremiumRates } from "@/lib/desk-services/quote-profit";
import { getSystemSettings } from "@/lib/system-settings";

// Даёт обычному Приходному ордеру (CashOrder, из cash-tab.tsx) ту же
// мгновенную "засчитано в прибыль" силу, что уже есть у «Счёта на выкуп»
// (create-payment/route.ts) — но только когда для этого явно есть все три
// условия: статья помечена CashCategory.linkedProfitCategory, ордер
// привязан к конкретному Просчёту (CashOrder.quoteId), и сумма указана в ₽
// (currency="rub" — фактические поля просчёта типа searchServiceFeeRub
// хранятся в ₽, а курс ¥/$ этого конкретного ордера не обязан совпадать с
// курсом, по которому считался сам просчёт, так что конвертировать было бы
// гадать). Без всех трёх условий — просто обычная запись в кассовой книге,
// как и раньше. См. PB-V5 chat 2026-08-07.
//
// Вызывается и из POST (создание ордера), и из PATCH (редактирование) —
// PATCH сначала удаляет старое распределение этого ордера (см. вызывающий
// код), так что "уже оплачено" здесь всегда чистое, без риска посчитать
// собственную прежнюю сумму ордера как чужую уже оплаченную.
async function syncQuotePaymentAllocationForCashOrder(
  tx: Prisma.TransactionClient,
  params: {
    cashOrderId: string;
    quoteId: string;
    linkedProfitCategory: QuotePaymentCategoryValue;
    amountRub: number;
    createdByManagerId: string;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const quote = await tx.quote.findUnique({
    where: { id: params.quoteId },
    select: {
      displayId: true,
      managerId: true,
      totalPriceRub: true,
      chinaDeliveryRub: true,
      searchServiceFeeRub: true,
      isCustomProduction: true,
      customProductionFeeRub: true,
      buyoutCommissionRub: true,
      client: { select: { selfSourcedConfirmed: true, createdByManagerId: true } },
    },
  });
  if (!quote) return { ok: false, error: "Просчёт не найден." };

  const [attachedServicesSum, existingAllocations, systemSettings] = await Promise.all([
    tx.quoteAttachedService.aggregate({ where: { quoteId: params.quoteId }, _sum: { priceRub: true } }),
    tx.quotePaymentAllocation.findMany({ where: { quoteId: params.quoteId }, select: { category: true, amountRub: true } }),
    getSystemSettings(),
  ]);
  const attachedServicesTotalRub = Number(attachedServicesSum._sum.priceRub ?? 0);
  const rawAmountRub = rawQuotePaymentCategoryAmountRub(quote, attachedServicesTotalRub, params.linkedProfitCategory);
  const alreadyPaidRub = sumAlreadyPaidRubByCategory(existingAllocations);
  const remainingRub = Math.max(0, rawAmountRub - alreadyPaidRubForCategory(alreadyPaidRub, params.linkedProfitCategory));
  if (params.amountRub > remainingRub + 0.01) {
    return {
      ok: false,
      error: `Просчёт №${quote.displayId}: остаток по «${params.linkedProfitCategory}» — ${Math.round(remainingRub)} ₽, а указано ${Math.round(params.amountRub)} ₽.`,
    };
  }

  const premiumRates: ManagerPremiumRates = {
    normalRatePercent: Number(systemSettings.normalRatePercent),
    selfSourcedProscetRatePercent: Number(systemSettings.selfSourcedProscetRatePercent),
    selfSourcedBuyoutDiscountRatePercent: Number(systemSettings.selfSourcedBuyoutDiscountRatePercent),
  };
  const isBoosted = isSelfSourcedFor(quote.client, quote.managerId);
  const premiumRub = computePaymentAllocationPremiumRub(params.linkedProfitCategory, params.amountRub, isBoosted, premiumRates);

  await tx.quotePaymentAllocation.create({
    data: {
      cashOrderId: params.cashOrderId,
      quoteId: params.quoteId,
      category: params.linkedProfitCategory,
      amountRub: params.amountRub,
      premiumRub,
      createdByManagerId: params.createdByManagerId,
    },
  });
  return { ok: true };
}

export { syncQuotePaymentAllocationForCashOrder };
