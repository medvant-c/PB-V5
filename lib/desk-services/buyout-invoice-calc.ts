import type { BuyoutInvoiceLineItem, BuyoutInvoiceCurrency } from "@/lib/desk-services/buyout-invoice-pdf";

const QUOTE_TYPE_LABEL: Record<string, string> = {
  standard: "Standart",
  expert: "Expert",
  pro: "Pro",
};

interface BuyoutInvoiceQuoteInput {
  totalPriceRub: number;
  // Штук товара в этой позиции — единственная сумма счёта, к которой
  // осмысленно относится количество (доставка/поиск/комиссия/доп. услуги —
  // денежные категории, не поштучные), поэтому "Кол-во" в PDF показывается
  // только у строки "Стоимость товара". See PB-V5 chat 2026-08-05.
  quantity: number;
  chinaDeliveryRub: number;
  searchServiceFeeRub: number;
  quoteType: string;
  isCustomProduction: boolean;
  customProductionFeeRub: number;
  buyoutCommissionPercent: number;
  buyoutCommissionRub: number;
  cargoDeliveryRub: number;
  totalRub: number;
  cnyRateUsed: number;
  usdRateUsed: number;
  attachedServices: { name: string; priceRub: number }[];
}

// How much of each category has already been paid so far, in ₽ — summed
// from QuotePaymentAllocation rows (see prisma/schema.prisma) by the
// caller. All-zero (the common case, nothing paid yet through this flow)
// makes every function below behave exactly as it did before this field
// existed. See PB-V5 chat 2026-08-04.
interface AlreadyPaidRubByCategory {
  goods: number;
  chinaDelivery: number;
  searchService: number;
  customProduction: number;
  buyoutCommission: number;
  attachedServices: number;
}

const NOTHING_PAID: AlreadyPaidRubByCategory = {
  goods: 0,
  chinaDelivery: 0,
  searchService: 0,
  customProduction: 0,
  buyoutCommission: 0,
  attachedServices: 0,
};

// Sums QuotePaymentAllocation.amountRub (see prisma/schema.prisma) into
// the shape buildBuyoutInvoiceAmounts/buildBuyoutInvoiceRowAmounts expect —
// the counterpart of sumAlreadyPaidPremium in quote-profit.ts, just for ₽
// already paid per category instead of premium already credited.
function sumAlreadyPaidRubByCategory(allocations: { category: string; amountRub: unknown }[]): AlreadyPaidRubByCategory {
  const result: AlreadyPaidRubByCategory = { ...NOTHING_PAID };
  for (const a of allocations) {
    const amount = Number(a.amountRub);
    switch (a.category) {
      case "goods":
        result.goods += amount;
        break;
      case "china_delivery":
        result.chinaDelivery += amount;
        break;
      case "search_service":
        result.searchService += amount;
        break;
      case "custom_production":
        result.customProduction += amount;
        break;
      case "buyout_commission":
        result.buyoutCommission += amount;
        break;
      case "attached_services":
        result.attachedServices += amount;
        break;
    }
  }
  return result;
}

interface BuyoutInvoiceAmounts {
  lineItems: BuyoutInvoiceLineItem[];
  totalAmount: number;
  rateNote: string | null;
}

// Shared by the single-quote route (app/api/manager-quotes/[id]/buyout-invoice)
// and the multi-quote bundle route (app/api/manager-quotes/buyout-invoice-pdf-bundle
// / app/api/manager-clients/[id]/buyout-invoice-pdf-bundle) so the ₽→$→USDT
// math can't drift between "one at a time" and "several at once" — see
// PB-V5 chat 2026-08-03 for the original single-quote design (totalRub -
// cargoDeliveryRub = everything except cargo, guaranteed by quote-engine's
// own totalRub formula to equal the sum of every line item below).
//
// `usdt` is null when the shared TariffSettings.usdtRateCny rate isn't
// set/confirmed yet — callers must check this and refuse currency="usdt"
// BEFORE calling this function for that quote (see the two routes above);
// it's not re-validated here since a bundle only wants to fetch/check that
// once for the whole batch, not once per quote.
//
// alreadyPaidRub (default: nothing paid) — a category already fully paid
// is dropped from the invoice entirely (not shown as "0 ₽"); a partially
// paid one shows only its remaining balance. See PB-V5 chat 2026-08-04.
function buildBuyoutInvoiceAmounts(
  quote: BuyoutInvoiceQuoteInput,
  currency: BuyoutInvoiceCurrency,
  usdt: { usdtRateCny: number } | null,
  alreadyPaidRub: AlreadyPaidRubByCategory = NOTHING_PAID,
): BuyoutInvoiceAmounts {
  const remainingGoodsRub = Math.max(0, quote.totalPriceRub - alreadyPaidRub.goods);
  const remainingChinaDeliveryRub = Math.max(0, quote.chinaDeliveryRub - alreadyPaidRub.chinaDelivery);
  const remainingSearchServiceRub = Math.max(0, quote.searchServiceFeeRub - alreadyPaidRub.searchService);
  const remainingCustomProductionRub = quote.isCustomProduction
    ? Math.max(0, quote.customProductionFeeRub - alreadyPaidRub.customProduction)
    : 0;
  const remainingBuyoutCommissionRub = Math.max(0, quote.buyoutCommissionRub - alreadyPaidRub.buyoutCommission);
  const attachedServicesTotalRub = quote.attachedServices.reduce((sum, s) => sum + s.priceRub, 0);
  const remainingAttachedServicesRub = Math.max(0, attachedServicesTotalRub - alreadyPaidRub.attachedServices);

  const rubLineItems: BuyoutInvoiceLineItem[] = [];
  if (remainingGoodsRub > 0) rubLineItems.push({ label: "Стоимость товара", amount: remainingGoodsRub, quantity: quote.quantity });
  if (remainingChinaDeliveryRub > 0) rubLineItems.push({ label: "Доставка по Китаю", amount: remainingChinaDeliveryRub });
  if (remainingSearchServiceRub > 0) {
    rubLineItems.push({
      label: `Услуга поиска товара (${QUOTE_TYPE_LABEL[quote.quoteType] ?? quote.quoteType})`,
      amount: remainingSearchServiceRub,
    });
  }
  if (remainingCustomProductionRub > 0) rubLineItems.push({ label: "Производство под заказ", amount: remainingCustomProductionRub });
  if (remainingBuyoutCommissionRub > 0) {
    rubLineItems.push({ label: `Организация выкупа (${quote.buyoutCommissionPercent}%)`, amount: remainingBuyoutCommissionRub });
  }
  if (remainingAttachedServicesRub > 0) {
    if (alreadyPaidRub.attachedServices > 0) {
      // Partially paid — the payment only tracks one lump "Доп. услуги"
      // category (not per-named-service), so there's no way to say exactly
      // which named service the remainder belongs to. Falls back to one
      // combined line instead of the itemized list below.
      rubLineItems.push({ label: "Доп. услуги (остаток)", amount: remainingAttachedServicesRub });
    } else {
      for (const service of quote.attachedServices) {
        if (service.priceRub > 0) rubLineItems.push({ label: service.name, amount: service.priceRub });
      }
    }
  }

  const totalAmountRub = rubLineItems.reduce((sum, item) => sum + item.amount, 0);

  if (currency === "rub") {
    return { lineItems: rubLineItems, totalAmount: totalAmountRub, rateNote: null };
  }

  if (currency === "usd") {
    return {
      lineItems: rubLineItems.map((item) => ({ label: item.label, amount: item.amount / quote.usdRateUsed, quantity: item.quantity })),
      totalAmount: totalAmountRub / quote.usdRateUsed,
      rateNote: `Курс на момент расчёта: 1$ = ${quote.usdRateUsed.toFixed(2)} ₽.`,
    };
  }

  if (currency === "cny") {
    return {
      lineItems: rubLineItems.map((item) => ({ label: item.label, amount: item.amount / quote.cnyRateUsed, quantity: item.quantity })),
      totalAmount: totalAmountRub / quote.cnyRateUsed,
      rateNote: `Курс на момент расчёта: 1¥ = ${quote.cnyRateUsed.toFixed(2)} ₽.`,
    };
  }

  // currency === "usdt" — caller guarantees `usdt` is non-null (see doc comment above).
  if (!usdt) {
    throw new Error("buildBuyoutInvoiceAmounts called with currency=usdt but no usdtRateCny — caller must validate this first.");
  }
  const usdtRate = usdt.usdtRateCny;
  const totalAmountCny = totalAmountRub / quote.cnyRateUsed;
  return {
    lineItems: rubLineItems.map((item) => ({
      label: item.label,
      amount: item.amount / quote.cnyRateUsed / usdtRate,
      quantity: item.quantity,
    })),
    totalAmount: totalAmountCny / usdtRate,
    rateNote: `Курс на момент выставления счёта: 1¥ = ${quote.cnyRateUsed.toFixed(2)} ₽, 1 USDT = ${usdtRate.toFixed(2)} ¥.`,
  };
}

interface BuyoutInvoiceRowAmounts {
  // Штук товара — pass-through, не денежная величина, поэтому не участвует
  // в divisor-конвертации ниже, в отличие от всех остальных полей.
  quantity: number;
  totalPriceAmount: number;
  chinaDeliveryAmount: number;
  searchServiceAmount: number;
  customProductionAmount: number;
  buyoutCommissionAmount: number;
  attachedServicesAmount: number;
  totalAmount: number;
}

// Same ₽→$→USDT conversion as buildBuyoutInvoiceAmounts above (including
// the same already-paid-per-category subtraction), but keeps each category
// as its own field instead of a flat labeled list — used by the compact
// "Счёт на выкуп списком" table (one row per quote, fixed columns), where
// a dynamic per-quote label list doesn't fit a table's fixed column set.
// See lib/desk-services/buyout-invoice-list-pdf.tsx.
function buildBuyoutInvoiceRowAmounts(
  quote: BuyoutInvoiceQuoteInput,
  currency: BuyoutInvoiceCurrency,
  usdt: { usdtRateCny: number } | null,
  alreadyPaidRub: AlreadyPaidRubByCategory = NOTHING_PAID,
): BuyoutInvoiceRowAmounts {
  const attachedServicesTotalRub = quote.attachedServices.reduce((sum, s) => sum + s.priceRub, 0);
  const rub = {
    totalPriceAmount: Math.max(0, quote.totalPriceRub - alreadyPaidRub.goods),
    chinaDeliveryAmount: Math.max(0, quote.chinaDeliveryRub - alreadyPaidRub.chinaDelivery),
    searchServiceAmount: Math.max(0, quote.searchServiceFeeRub - alreadyPaidRub.searchService),
    customProductionAmount: quote.isCustomProduction ? Math.max(0, quote.customProductionFeeRub - alreadyPaidRub.customProduction) : 0,
    buyoutCommissionAmount: Math.max(0, quote.buyoutCommissionRub - alreadyPaidRub.buyoutCommission),
    attachedServicesAmount: Math.max(0, attachedServicesTotalRub - alreadyPaidRub.attachedServices),
  };
  const totalAmountRub =
    rub.totalPriceAmount +
    rub.chinaDeliveryAmount +
    rub.searchServiceAmount +
    rub.customProductionAmount +
    rub.buyoutCommissionAmount +
    rub.attachedServicesAmount;

  let divisor = 1;
  if (currency === "usd") {
    divisor = quote.usdRateUsed;
  } else if (currency === "cny") {
    divisor = quote.cnyRateUsed;
  } else if (currency === "usdt") {
    if (!usdt) {
      throw new Error("buildBuyoutInvoiceRowAmounts called with currency=usdt but no usdtRateCny — caller must validate this first.");
    }
    divisor = quote.cnyRateUsed * usdt.usdtRateCny;
  }

  return {
    quantity: quote.quantity,
    totalPriceAmount: rub.totalPriceAmount / divisor,
    chinaDeliveryAmount: rub.chinaDeliveryAmount / divisor,
    searchServiceAmount: rub.searchServiceAmount / divisor,
    customProductionAmount: rub.customProductionAmount / divisor,
    buyoutCommissionAmount: rub.buyoutCommissionAmount / divisor,
    attachedServicesAmount: rub.attachedServicesAmount / divisor,
    totalAmount: totalAmountRub / divisor,
  };
}

// Шесть категорий QuotePaymentAllocation/QuotePaymentCategory (см.
// prisma/schema.prisma) — вынесено сюда одной копией, чтобы
// create-payment/route.ts и manager-cash-orders/[..]/route.ts (обычный
// приходный ордер, привязанный к статье с CashCategory.linkedProfitCategory)
// не держали каждый свою версию. См. PB-V5 chat 2026-08-07.
const QUOTE_PAYMENT_CATEGORIES = ["goods", "china_delivery", "search_service", "custom_production", "buyout_commission", "attached_services"] as const;
type QuotePaymentCategoryValue = (typeof QUOTE_PAYMENT_CATEGORIES)[number];
function isQuotePaymentCategory(value: unknown): value is QuotePaymentCategoryValue {
  return typeof value === "string" && (QUOTE_PAYMENT_CATEGORIES as readonly string[]).includes(value);
}

// Сколько ₽ у этого просчёта вообще числится по одной категории (до вычета
// уже оплаченного) — те же шесть полей, что buildBuyoutInvoiceAmounts/
// buildBuyoutInvoiceRowAmounts выше режут по счёту на выкуп.
function rawQuotePaymentCategoryAmountRub(
  quote: {
    totalPriceRub: unknown;
    chinaDeliveryRub: unknown;
    searchServiceFeeRub: unknown;
    isCustomProduction: boolean;
    customProductionFeeRub: unknown;
    buyoutCommissionRub: unknown;
  },
  attachedServicesTotalRub: number,
  category: QuotePaymentCategoryValue,
): number {
  switch (category) {
    case "goods":
      return Number(quote.totalPriceRub);
    case "china_delivery":
      return Number(quote.chinaDeliveryRub);
    case "search_service":
      return Number(quote.searchServiceFeeRub);
    case "custom_production":
      return quote.isCustomProduction ? Number(quote.customProductionFeeRub) : 0;
    case "buyout_commission":
      return Number(quote.buyoutCommissionRub);
    case "attached_services":
      return attachedServicesTotalRub;
  }
}

// Выбирает нужное поле из AlreadyPaidRubByCategory по той же категории —
// избавляет вызывающий код от ручной цепочки тернарников.
function alreadyPaidRubForCategory(alreadyPaidRub: AlreadyPaidRubByCategory, category: QuotePaymentCategoryValue): number {
  switch (category) {
    case "goods":
      return alreadyPaidRub.goods;
    case "china_delivery":
      return alreadyPaidRub.chinaDelivery;
    case "search_service":
      return alreadyPaidRub.searchService;
    case "custom_production":
      return alreadyPaidRub.customProduction;
    case "buyout_commission":
      return alreadyPaidRub.buyoutCommission;
    case "attached_services":
      return alreadyPaidRub.attachedServices;
  }
}

export {
  buildBuyoutInvoiceAmounts,
  buildBuyoutInvoiceRowAmounts,
  sumAlreadyPaidRubByCategory,
  isQuotePaymentCategory,
  rawQuotePaymentCategoryAmountRub,
  alreadyPaidRubForCategory,
};
export type { BuyoutInvoiceQuoteInput, BuyoutInvoiceAmounts, BuyoutInvoiceRowAmounts, AlreadyPaidRubByCategory, QuotePaymentCategoryValue };
