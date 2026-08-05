import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { canAccessManagerQuote } from "@/lib/manager-scope";
import { prisma } from "@/lib/prisma";
import { renderBuyoutInvoicePdf, type BuyoutInvoiceCurrency } from "@/lib/desk-services/buyout-invoice-pdf";
import { buildBuyoutInvoiceAmounts, sumAlreadyPaidRubByCategory } from "@/lib/desk-services/buyout-invoice-calc";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// "Счёт на выкуп" — everything the client owes EXCEPT cargo delivery
// (goods, China-domestic delivery, search fee, buyout commission,
// производство под заказ, attached services), issued once the calculation
// is final and it's time to actually buy the goods. Cargo is billed
// separately at shipping time — same "goods vs. cargo are two different
// invoices" split already used by the Отчёты по дням buyout flow. Amount
// is therefore totalRub - cargoDeliveryRub, which the quote-engine's own
// totalRub formula guarantees equals the sum of every line item below. See
// PB-V5 chat 2026-08-03.
export async function GET(req: NextRequest, { params }: RouteParams) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  const currencyParam = req.nextUrl.searchParams.get("currency");
  if (currencyParam !== "rub" && currencyParam !== "usd" && currencyParam !== "usdt") {
    return Response.json({ error: "Укажите валюту счёта: rub, usd или usdt." }, { status: 400 });
  }
  const currency: BuyoutInvoiceCurrency = currencyParam;

  const { id } = await params;
  const quote = await prisma.quote.findUnique({ where: { id }, include: { client: true } });
  if (!quote || quote.deletedAt) {
    return Response.json({ error: "Просчёт не найден." }, { status: 404 });
  }
  if (!(await canAccessManagerQuote(session, quote.managerId))) {
    return Response.json({ error: "Нет доступа к этому просчёту." }, { status: 403 });
  }

  const [attachedServiceRecords, paymentAllocations] = await Promise.all([
    prisma.quoteAttachedService.findMany({ where: { quoteId: quote.id }, orderBy: { createdAt: "asc" } }),
    prisma.quotePaymentAllocation.findMany({ where: { quoteId: quote.id }, select: { category: true, amountRub: true } }),
  ]);
  const alreadyPaidRub = sumAlreadyPaidRubByCategory(paymentAllocations);

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

  const { lineItems, totalAmount, rateNote } = buildBuyoutInvoiceAmounts(
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
    alreadyPaidRub,
  );

  if (lineItems.length === 0) {
    return Response.json({ error: "Этот просчёт уже полностью оплачен — выставлять больше нечего." }, { status: 400 });
  }

  const buffer = await renderBuyoutInvoicePdf({
    displayId: quote.displayId,
    client: { name: quote.client.name, company: quote.client.company },
    productName: quote.productName,
    currency,
    lineItems,
    totalAmount,
    rateNote,
  });

  const CURRENCY_FILE_SUFFIX: Record<BuyoutInvoiceCurrency, string> = { rub: "₽", usd: "$", usdt: "USDT" };
  const fileName = `Счёт на выкуп — №${quote.displayId} (${CURRENCY_FILE_SUFFIX[currency]}).pdf`;
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    },
  });
}
