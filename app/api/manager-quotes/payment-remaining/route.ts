import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { getVisibleManagerIds } from "@/lib/manager-scope";
import { prisma } from "@/lib/prisma";
import { buildBuyoutInvoiceRowAmounts, sumAlreadyPaidRubByCategory } from "@/lib/desk-services/buyout-invoice-calc";

// Feeds the "Приходный ордер" dialog (see create-payment/route.ts) — for
// each requested quote, how much of each "Счёт на выкуп" category is still
// unpaid, in ₽. Reuses buildBuyoutInvoiceRowAmounts with currency="rub"
// (divisor 1) so this can never drift from what the invoice itself shows
// as remaining. See PB-V5 chat 2026-08-04.
export async function GET(req: NextRequest) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }
  if (session.role !== "owner" && session.role !== "senior") {
    return Response.json({ error: "Доступно только старшему менеджеру и руководителю." }, { status: 403 });
  }

  const quoteIdsParam = req.nextUrl.searchParams.get("quoteIds");
  const quoteIds = quoteIdsParam ? quoteIdsParam.split(",").filter(Boolean) : [];
  if (quoteIds.length === 0) {
    return Response.json({ error: "Укажите хотя бы один просчёт." }, { status: 400 });
  }

  const visibleManagerIds = await getVisibleManagerIds(session);
  const quotes = await prisma.quote.findMany({
    where: {
      id: { in: quoteIds },
      deletedAt: null,
      ...(visibleManagerIds === "all" ? {} : { managerId: { in: visibleManagerIds } }),
    },
    include: { client: { select: { id: true, name: true, company: true } } },
  });
  if (quotes.length === 0) {
    return Response.json({ error: "Просчёты не найдены." }, { status: 404 });
  }

  const clientIds = new Set(quotes.map((q) => q.client.id));
  if (clientIds.size > 1) {
    return Response.json({ error: "Все выбранные просчёты должны принадлежать одному клиенту." }, { status: 400 });
  }

  const rows = await Promise.all(
    quotes.map(async (quote) => {
      const [attachedServiceRecords, paymentAllocations] = await Promise.all([
        prisma.quoteAttachedService.findMany({ where: { quoteId: quote.id } }),
        prisma.quotePaymentAllocation.findMany({ where: { quoteId: quote.id }, select: { category: true, amountRub: true } }),
      ]);
      const remaining = buildBuyoutInvoiceRowAmounts(
        {
          totalPriceRub: Number(quote.totalPriceRub),
          chinaDeliveryRub: Number(quote.chinaDeliveryRub),
          searchServiceFeeRub: Number(quote.searchServiceFeeRub),
          quoteType: quote.quoteType,
          isCustomProduction: quote.isCustomProduction,
          customProductionFeeRub: Number(quote.customProductionFeeRub),
          buyoutCommissionPercent: Number(quote.buyoutCommissionPercent),
          buyoutCommissionRub: Number(quote.buyoutCommissionRub),
          cargoDeliveryRub: Number(quote.cargoDeliveryRub),
          totalRub: Number(quote.totalRub),
          cnyRateUsed: Number(quote.cnyRateUsed),
          usdRateUsed: Number(quote.usdRateUsed),
          attachedServices: attachedServiceRecords.map((s) => ({ name: s.name, priceRub: Number(s.priceRub) })),
        },
        "rub",
        null,
        sumAlreadyPaidRubByCategory(paymentAllocations),
      );

      return {
        quoteId: quote.id,
        displayId: quote.displayId,
        productName: quote.productName,
        remaining: {
          goods: remaining.totalPriceAmount,
          china_delivery: remaining.chinaDeliveryAmount,
          search_service: remaining.searchServiceAmount,
          custom_production: remaining.customProductionAmount,
          buyout_commission: remaining.buyoutCommissionAmount,
          attached_services: remaining.attachedServicesAmount,
        },
      };
    }),
  );

  return Response.json({
    client: { id: quotes[0].client.id, name: quotes[0].client.name, company: quotes[0].client.company },
    quotes: rows,
  });
}
