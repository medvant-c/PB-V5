import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { getVisibleManagerIds } from "@/lib/manager-scope";
import { prisma } from "@/lib/prisma";
import { renderBuyoutInvoiceListPdf, type BuyoutInvoiceListRow } from "@/lib/desk-services/buyout-invoice-list-pdf";
import type { BuyoutInvoiceCurrency } from "@/lib/desk-services/buyout-invoice-pdf";
import { buildBuyoutInvoiceRowAmounts, sumAlreadyPaidRubByCategory } from "@/lib/desk-services/buyout-invoice-calc";

const CURRENCY_FILE_SUFFIX: Record<BuyoutInvoiceCurrency, string> = { rub: "₽", usd: "$", usdt: "USDT" };

// Same as /api/manager-clients/[id]/buyout-invoice-pdf-bundle, just not
// anchored to one client — mirrors quotes-pdf-bundle's own "Все просчёты"
// vs. per-client split (see that route's comment). ONE compact table, one
// ROW per selected quote (not one page per quote — see
// lib/desk-services/buyout-invoice-list-pdf.tsx), same "печать списком"
// format as the existing "Скачать все просчёты клиента в PDF"
// (quotes-list-pdf.tsx). See PB-V5 chat 2026-08-03.
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
      deletedAt: null,
      ...(visibleManagerIds === "all" ? {} : { managerId: { in: visibleManagerIds } }),
    },
    include: { client: true },
    orderBy: { createdAt: "asc" },
  });
  if (quotes.length === 0) {
    return Response.json({ error: "Просчёты не найдены." }, { status: 404 });
  }

  const allRows: BuyoutInvoiceListRow[] = await Promise.all(
    quotes.map(async (quote) => {
      const [attachedServiceRecords, paymentAllocations] = await Promise.all([
        prisma.quoteAttachedService.findMany({ where: { quoteId: quote.id }, orderBy: { createdAt: "asc" } }),
        prisma.quotePaymentAllocation.findMany({ where: { quoteId: quote.id }, select: { category: true, amountRub: true } }),
      ]);

      const amounts = buildBuyoutInvoiceRowAmounts(
        {
          totalPriceRub: Number(quote.totalPriceRub),
          quantity: quote.quantity,
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
        sumAlreadyPaidRubByCategory(paymentAllocations),
      );

      return {
        displayId: quote.displayId,
        productName: quote.productName,
        clientName: quote.client.name,
        clientCompany: quote.client.company,
        ...amounts,
      };
    }),
  );

  // A fully paid quote has nothing left to bill — dropped rather than
  // shown as a 0-amount row, same "already-paid line disappears" rule as
  // the single-quote invoice (see buildBuyoutInvoiceAmounts).
  const rows = allRows.filter((row) => row.totalAmount > 0);
  if (rows.length === 0) {
    return Response.json({ error: "Все выбранные просчёты уже полностью оплачены — выставлять больше нечего." }, { status: 400 });
  }

  const buffer = await renderBuyoutInvoiceListPdf({ client: null, rows, currency });

  const fileName = `Счета на выкуп списком (${rows.length}, ${CURRENCY_FILE_SUFFIX[currency]}).pdf`;
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    },
  });
}
