import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { canViewDiscounts } from "@/lib/manager-scope";
import { prisma } from "@/lib/prisma";
import { computeQuoteDiscounts } from "@/lib/desk-services/quote-discounts";

// "Скидки по клиентам" — company-wide report (same "canViewX ⇒ everything"
// scope as Касса/Отчёт о прибыли), one row per (quote, discount type) — see
// lib/desk-services/quote-discounts.ts for the full enumerated list.
// Filtering happens client-side, same convention as trash-tab.tsx.
export async function GET(req: NextRequest) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }
  if (!(await canViewDiscounts(session))) {
    return Response.json({ error: "Нет доступа к этому разделу." }, { status: 403 });
  }

  const quotes = await prisma.quote.findMany({
    where: {
      deletedAt: null,
      OR: [
        { cargoDiscountUsd: { gt: 0 } },
        { cargoRateUsdOverride: { not: null } },
        { buyoutCommissionPercentOverride: { not: null } },
        { searchServiceFeeRubOverride: { not: null } },
        { customProductionFeeRubOverride: { not: null } },
        { cnyRateRubOverride: { not: null } },
        { usdRateRubOverride: { not: null } },
      ],
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      displayId: true,
      productName: true,
      createdAt: true,
      deliveryPricingMode: true,
      cargoDiscountUsd: true,
      cargoRateUsdOverride: true,
      buyoutCommissionPercentOverride: true,
      searchServiceFeeRubOverride: true,
      customProductionFeeRubOverride: true,
      cnyRateRubOverride: true,
      usdRateRubOverride: true,
      client: { select: { id: true, name: true, company: true } },
      manager: { select: { id: true, name: true } },
    },
  });

  const rows = quotes.flatMap((quote) => {
    const entries = computeQuoteDiscounts({
      cargoDiscountUsd: Number(quote.cargoDiscountUsd),
      cargoRateUsdOverride: quote.cargoRateUsdOverride === null ? null : Number(quote.cargoRateUsdOverride),
      deliveryPricingMode: quote.deliveryPricingMode,
      buyoutCommissionPercentOverride: quote.buyoutCommissionPercentOverride === null ? null : Number(quote.buyoutCommissionPercentOverride),
      searchServiceFeeRubOverride: quote.searchServiceFeeRubOverride === null ? null : Number(quote.searchServiceFeeRubOverride),
      customProductionFeeRubOverride: quote.customProductionFeeRubOverride === null ? null : Number(quote.customProductionFeeRubOverride),
      cnyRateRubOverride: quote.cnyRateRubOverride === null ? null : Number(quote.cnyRateRubOverride),
      usdRateRubOverride: quote.usdRateRubOverride === null ? null : Number(quote.usdRateRubOverride),
    });

    return entries.map((entry) => ({
      quoteId: quote.id,
      quoteDisplayId: quote.displayId,
      productName: quote.productName,
      createdAt: quote.createdAt,
      client: quote.client,
      manager: quote.manager,
      ...entry,
    }));
  });

  return Response.json({ discounts: rows });
}
