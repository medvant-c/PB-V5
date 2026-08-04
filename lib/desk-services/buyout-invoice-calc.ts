import type { BuyoutInvoiceLineItem, BuyoutInvoiceCurrency } from "@/lib/desk-services/buyout-invoice-pdf";

const QUOTE_TYPE_LABEL: Record<string, string> = {
  standard: "Standart",
  expert: "Expert",
  pro: "Pro",
};

interface BuyoutInvoiceQuoteInput {
  totalPriceRub: number;
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
function buildBuyoutInvoiceAmounts(
  quote: BuyoutInvoiceQuoteInput,
  currency: BuyoutInvoiceCurrency,
  usdt: { usdtRateCny: number } | null,
): BuyoutInvoiceAmounts {
  const rubLineItems: BuyoutInvoiceLineItem[] = [
    { label: "Стоимость товара", amount: quote.totalPriceRub },
    { label: "Доставка по Китаю", amount: quote.chinaDeliveryRub },
    {
      label: `Услуга поиска товара (${QUOTE_TYPE_LABEL[quote.quoteType] ?? quote.quoteType})`,
      amount: quote.searchServiceFeeRub,
    },
  ];
  if (quote.isCustomProduction) {
    rubLineItems.push({ label: "Производство под заказ", amount: quote.customProductionFeeRub });
  }
  rubLineItems.push({ label: `Организация выкупа (${quote.buyoutCommissionPercent}%)`, amount: quote.buyoutCommissionRub });
  for (const service of quote.attachedServices) {
    rubLineItems.push({ label: service.name, amount: service.priceRub });
  }

  const totalAmountRub = quote.totalRub - quote.cargoDeliveryRub;

  if (currency === "rub") {
    return { lineItems: rubLineItems, totalAmount: totalAmountRub, rateNote: null };
  }

  if (currency === "usd") {
    return {
      lineItems: rubLineItems.map((item) => ({ label: item.label, amount: item.amount / quote.usdRateUsed })),
      totalAmount: totalAmountRub / quote.usdRateUsed,
      rateNote: `Курс на момент расчёта: 1$ = ${quote.usdRateUsed.toFixed(2)} ₽.`,
    };
  }

  // currency === "usdt" — caller guarantees `usdt` is non-null (see doc comment above).
  if (!usdt) {
    throw new Error("buildBuyoutInvoiceAmounts called with currency=usdt but no usdtRateCny — caller must validate this first.");
  }
  const usdtRate = usdt.usdtRateCny;
  const totalAmountCny = totalAmountRub / quote.cnyRateUsed;
  return {
    lineItems: rubLineItems.map((item) => ({ label: item.label, amount: item.amount / quote.cnyRateUsed / usdtRate })),
    totalAmount: totalAmountCny / usdtRate,
    rateNote: `Курс на момент выставления счёта: 1¥ = ${quote.cnyRateUsed.toFixed(2)} ₽, 1 USDT = ${usdtRate.toFixed(2)} ¥.`,
  };
}

interface BuyoutInvoiceRowAmounts {
  totalPriceAmount: number;
  chinaDeliveryAmount: number;
  searchServiceAmount: number;
  customProductionAmount: number;
  buyoutCommissionAmount: number;
  attachedServicesAmount: number;
  totalAmount: number;
}

// Same ₽→$→USDT conversion as buildBuyoutInvoiceAmounts above, but keeps
// each category as its own field instead of a flat labeled list — used by
// the compact "Счёт на выкуп списком" table (one row per quote, fixed
// columns), where a dynamic per-quote label list doesn't fit a table's
// fixed column set. See lib/desk-services/buyout-invoice-list-pdf.tsx.
function buildBuyoutInvoiceRowAmounts(
  quote: BuyoutInvoiceQuoteInput,
  currency: BuyoutInvoiceCurrency,
  usdt: { usdtRateCny: number } | null,
): BuyoutInvoiceRowAmounts {
  const attachedServicesRub = quote.attachedServices.reduce((sum, s) => sum + s.priceRub, 0);
  const rub: Omit<BuyoutInvoiceRowAmounts, "totalAmount"> & { totalAmountRub: number } = {
    totalPriceAmount: quote.totalPriceRub,
    chinaDeliveryAmount: quote.chinaDeliveryRub,
    searchServiceAmount: quote.searchServiceFeeRub,
    customProductionAmount: quote.isCustomProduction ? quote.customProductionFeeRub : 0,
    buyoutCommissionAmount: quote.buyoutCommissionRub,
    attachedServicesAmount: attachedServicesRub,
    totalAmountRub: quote.totalRub - quote.cargoDeliveryRub,
  };

  let divisor = 1;
  if (currency === "usd") {
    divisor = quote.usdRateUsed;
  } else if (currency === "usdt") {
    if (!usdt) {
      throw new Error("buildBuyoutInvoiceRowAmounts called with currency=usdt but no usdtRateCny — caller must validate this first.");
    }
    divisor = quote.cnyRateUsed * usdt.usdtRateCny;
  }

  return {
    totalPriceAmount: rub.totalPriceAmount / divisor,
    chinaDeliveryAmount: rub.chinaDeliveryAmount / divisor,
    searchServiceAmount: rub.searchServiceAmount / divisor,
    customProductionAmount: rub.customProductionAmount / divisor,
    buyoutCommissionAmount: rub.buyoutCommissionAmount / divisor,
    attachedServicesAmount: rub.attachedServicesAmount / divisor,
    totalAmount: rub.totalAmountRub / divisor,
  };
}

export { buildBuyoutInvoiceAmounts, buildBuyoutInvoiceRowAmounts };
export type { BuyoutInvoiceQuoteInput, BuyoutInvoiceAmounts, BuyoutInvoiceRowAmounts };
