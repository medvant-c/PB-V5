import "server-only";

// Every manager-entered discount/individual-rate override on a Quote —
// enumerated in full (see feedback memory: never gloss over "и т.д." with a
// partial list) rather than just the cargo/buyout-commission examples the
// owner happened to name. Each is a distinct, independently settable field
// on Quote (prisma/schema.prisma) — a quote can trigger several of these at
// once, so the report is one ROW PER (quote, discount type), not one row
// per quote. Deliberately excludes searchFeeWaived-by-promo (the automatic
// first-3-Standard-quotes freebie) — only searchServiceFeeRubOverride being
// SET reflects an actual manager decision. See PB-V5 chat 2026-08-10.
type QuoteDiscountType =
  | "cargo_discount"
  | "cargo_rate"
  | "buyout_commission"
  | "search_fee"
  | "custom_production"
  | "cny_rate"
  | "usd_rate";

const QUOTE_DISCOUNT_TYPE_LABEL: Record<QuoteDiscountType, string> = {
  cargo_discount: "Скидка на карго",
  cargo_rate: "Индивидуальная ставка карго",
  buyout_commission: "Индивидуальная комиссия выкупа",
  search_fee: "Услуга поиска — скидка/своя цена",
  custom_production: "Производство под заказ — своя цена",
  cny_rate: "Индивидуальный курс ¥→₽",
  usd_rate: "Индивидуальный курс $→₽",
};

interface QuoteDiscountInput {
  cargoDiscountUsd: number;
  cargoRateUsdOverride: number | null;
  deliveryPricingMode: "density" | "volume";
  buyoutCommissionPercentOverride: number | null;
  buyoutCommissionRubOverride: number | null;
  searchServiceFeeRubOverride: number | null;
  customProductionFeeRubOverride: number | null;
  cnyRateRubOverride: number | null;
  usdRateRubOverride: number | null;
  // "Только карго" (Quote.isCargoOnly) — totalRub collapses to
  // cargoDeliveryRub alone; goods/China-delivery/search-fee/buyout-
  // commission/производство под заказ are still computed and stored for
  // record-keeping but never actually billed. An override on one of THOSE
  // fields is real data on the row but has zero effect on what this
  // specific client ends up paying — showing it here would fail the "open
  // the quote and you'll see this discount reflected in what's charged"
  // expectation, so those four are skipped entirely for a cargo-only quote.
  // cargo_discount/cargo_rate (cargoDeliveryRub itself) and usd_rate (the
  // $→₽ rate cargoDeliveryRub converts through) still genuinely apply.
  isCargoOnly: boolean;
}

interface QuoteDiscountEntry {
  type: QuoteDiscountType;
  label: string;
  valueLabel: string;
}

function computeQuoteDiscounts(quote: QuoteDiscountInput): QuoteDiscountEntry[] {
  const entries: QuoteDiscountEntry[] = [];

  if (quote.cargoDiscountUsd > 0) {
    entries.push({ type: "cargo_discount", label: QUOTE_DISCOUNT_TYPE_LABEL.cargo_discount, valueLabel: `−$${quote.cargoDiscountUsd.toFixed(2)}` });
  }
  if (quote.cargoRateUsdOverride !== null) {
    const basis = quote.deliveryPricingMode === "density" ? "кг" : "м³";
    entries.push({ type: "cargo_rate", label: QUOTE_DISCOUNT_TYPE_LABEL.cargo_rate, valueLabel: `$${quote.cargoRateUsdOverride}/${basis}` });
  }
  if (quote.usdRateRubOverride !== null) {
    entries.push({ type: "usd_rate", label: QUOTE_DISCOUNT_TYPE_LABEL.usd_rate, valueLabel: `${quote.usdRateRubOverride} ₽` });
  }

  // Inert for a cargo-only quote — see isCargoOnly's comment above.
  if (quote.isCargoOnly) return entries;

  if (quote.buyoutCommissionRubOverride !== null) {
    entries.push({
      type: "buyout_commission",
      label: QUOTE_DISCOUNT_TYPE_LABEL.buyout_commission,
      valueLabel: `${Math.round(quote.buyoutCommissionRubOverride).toLocaleString("ru-RU")} ₽`,
    });
  } else if (quote.buyoutCommissionPercentOverride !== null) {
    entries.push({ type: "buyout_commission", label: QUOTE_DISCOUNT_TYPE_LABEL.buyout_commission, valueLabel: `${quote.buyoutCommissionPercentOverride}%` });
  }
  if (quote.searchServiceFeeRubOverride !== null) {
    const valueLabel = quote.searchServiceFeeRubOverride === 0 ? "бесплатно" : `${Math.round(quote.searchServiceFeeRubOverride).toLocaleString("ru-RU")} ₽`;
    entries.push({ type: "search_fee", label: QUOTE_DISCOUNT_TYPE_LABEL.search_fee, valueLabel });
  }
  if (quote.customProductionFeeRubOverride !== null) {
    entries.push({
      type: "custom_production",
      label: QUOTE_DISCOUNT_TYPE_LABEL.custom_production,
      valueLabel: `${Math.round(quote.customProductionFeeRubOverride).toLocaleString("ru-RU")} ₽`,
    });
  }
  if (quote.cnyRateRubOverride !== null) {
    entries.push({ type: "cny_rate", label: QUOTE_DISCOUNT_TYPE_LABEL.cny_rate, valueLabel: `${quote.cnyRateRubOverride} ₽` });
  }

  return entries;
}

export { computeQuoteDiscounts, QUOTE_DISCOUNT_TYPE_LABEL };
export type { QuoteDiscountEntry, QuoteDiscountType };
