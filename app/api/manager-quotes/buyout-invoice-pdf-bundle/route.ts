import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { getVisibleManagerIds } from "@/lib/manager-scope";
import { prisma } from "@/lib/prisma";
import { renderBuyoutInvoiceBundlePdf, type BuyoutInvoicePdfProps, type BuyoutInvoiceCurrency } from "@/lib/desk-services/buyout-invoice-pdf";
import { buildBuyoutInvoiceAmounts } from "@/lib/desk-services/buyout-invoice-calc";

const CURRENCY_FILE_SUFFIX: Record<BuyoutInvoiceCurrency, string> = { rub: "₽", usd: "$", usdt: "USDT" };

// Same as /api/manager-clients/[id]/buyout-invoice-pdf-bundle, just not
// anchored to one client — mirrors quotes-pdf-bundle's own "Все просчёты"
// vs. per-client split (see that route's comment). One счёт per selected
// quote, merged into a single PDF (one page each) via
// renderBuyoutInvoiceBundlePdf, same "Page is the merge unit" pattern as
// the existing quote-detail bundle. See PB-V5 chat 2026-08-03.
export async function POST(req: NextRequest) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Некорректный запрос." }, { status: 400 });
  }
  const { quoteIds, currency: currencyParam } = (body as { quoteIds?: unknown; currency?: unknown }) ?? {};
  if (!Array.isArray(quoteIds) || quoteIds.length === 0 || !quoteIds.every((id) => typeof id === "string")) {
    return Response.json({ error: "Выберите хотя бы один просчёт." }, { status: 400 });
  }
  if (currencyParam !== "rub" && currencyParam !== "usd" && currencyParam !== "usdt") {
    return Response.json({ error: "Укажите валюту счёта: rub, usd или usdt." }, { status: 400 });
  }
  const currency: BuyoutInvoiceCurrency = currencyParam;

  // Checked ONCE for the whole batch, not per quote — same rate applies to
  // all of them (it's a single shared TariffSettings field, not per-quote).
  let usdt: { usdtRateCny: number } | null = null;
  if (currency === "usdt") {
    const currentTariffs = await prisma.tariffSettings.findFirst({ orderBy: { createdAt: "desc" } });
    if (!currentTariffs || currentTariffs.usdtRateCny === null) {
      return Response.json(
        { error: "Курс USDT ещё не задан руководителем — выставите счёт в ₽ или $, либо обратитесь к руководителю." },
        { status: 400 },
      );
    }
    if (!currentTariffs.usdtRateCnyConfirmed) {
      return Response.json(
        { error: "Курс USDT задан, но ещё не подтверждён руководителем — счёт в USDT пока недоступен." },
        { status: 400 },
      );
    }
    usdt = { usdtRateCny: Number(currentTariffs.usdtRateCny) };
  }

  const visibleManagerIds = await getVisibleManagerIds(session);
  const quotes = await prisma.quote.findMany({
    where: {
      id: { in: quoteIds },
      ...(visibleManagerIds === "all" ? {} : { managerId: { in: visibleManagerIds } }),
    },
    include: { client: true },
    orderBy: { createdAt: "asc" },
  });
  if (quotes.length === 0) {
    return Response.json({ error: "Просчёты не найдены." }, { status: 404 });
  }

  const invoices: BuyoutInvoicePdfProps[] = await Promise.all(
    quotes.map(async (quote) => {
      const attachedServiceRecords = await prisma.quoteAttachedService.findMany({
        where: { quoteId: quote.id },
        orderBy: { createdAt: "asc" },
      });

      const { lineItems, totalAmount, rateNote } = buildBuyoutInvoiceAmounts(
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
        currency,
        usdt,
      );

      return {
        displayId: quote.displayId,
        client: { name: quote.client.name, company: quote.client.company },
        productName: quote.productName,
        currency,
        lineItems,
        totalAmount,
        rateNote,
      };
    }),
  );

  const buffer = await renderBuyoutInvoiceBundlePdf(invoices);

  const fileName = `Счета на выкуп (${quotes.length}, ${CURRENCY_FILE_SUFFIX[currency]}).pdf`;
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    },
  });
}
