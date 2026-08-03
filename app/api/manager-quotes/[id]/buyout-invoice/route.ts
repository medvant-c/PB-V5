import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { canAccessManagerQuote } from "@/lib/manager-scope";
import { prisma } from "@/lib/prisma";
import { renderBuyoutInvoicePdf, type BuyoutInvoiceLineItem, type BuyoutInvoiceCurrency } from "@/lib/desk-services/buyout-invoice-pdf";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const QUOTE_TYPE_LABEL: Record<string, string> = {
  standard: "Standart",
  expert: "Expert",
  pro: "Pro",
};

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
  if (!quote) {
    return Response.json({ error: "Просчёт не найден." }, { status: 404 });
  }
  if (!(await canAccessManagerQuote(session, quote.managerId))) {
    return Response.json({ error: "Нет доступа к этому просчёту." }, { status: 403 });
  }

  const attachedServiceRecords = await prisma.quoteAttachedService.findMany({
    where: { quoteId: quote.id },
    orderBy: { createdAt: "asc" },
  });

  const totalPriceRub = Number(quote.totalPriceRub);
  const chinaDeliveryRub = Number(quote.chinaDeliveryRub);
  const searchServiceFeeRub = Number(quote.searchServiceFeeRub);
  const customProductionFeeRub = Number(quote.customProductionFeeRub);
  const buyoutCommissionRub = Number(quote.buyoutCommissionRub);
  const buyoutCommissionPercent = Number(quote.buyoutCommissionPercent);
  const cargoDeliveryRub = Number(quote.cargoDeliveryRub);
  const totalRub = Number(quote.totalRub);
  const cnyRateUsed = Number(quote.cnyRateUsed);
  const usdRateUsed = Number(quote.usdRateUsed);

  const rubLineItems: BuyoutInvoiceLineItem[] = [
    { label: "Стоимость товара", amount: totalPriceRub },
    { label: "Доставка по Китаю", amount: chinaDeliveryRub },
    {
      label: `Услуга поиска товара (${QUOTE_TYPE_LABEL[quote.quoteType] ?? quote.quoteType})`,
      amount: searchServiceFeeRub,
    },
  ];
  if (quote.isCustomProduction) {
    rubLineItems.push({ label: "Производство под заказ", amount: customProductionFeeRub });
  }
  rubLineItems.push({ label: `Организация выкупа (${buyoutCommissionPercent}%)`, amount: buyoutCommissionRub });
  for (const service of attachedServiceRecords) {
    rubLineItems.push({ label: service.name, amount: Number(service.priceRub) });
  }

  const totalAmountRub = totalRub - cargoDeliveryRub;

  let lineItems = rubLineItems;
  let totalAmount = totalAmountRub;
  let rateNote: string | null = null;

  if (currency === "usd") {
    lineItems = rubLineItems.map((item) => ({ label: item.label, amount: item.amount / usdRateUsed }));
    totalAmount = totalAmountRub / usdRateUsed;
    rateNote = `Курс на момент расчёта: 1$ = ${usdRateUsed.toFixed(2)} ₽.`;
  } else if (currency === "usdt") {
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
    const usdtRate = Number(currentTariffs.usdtRateCny);
    const totalAmountCny = totalAmountRub / cnyRateUsed;
    lineItems = rubLineItems.map((item) => ({ label: item.label, amount: item.amount / cnyRateUsed / usdtRate }));
    totalAmount = totalAmountCny / usdtRate;
    rateNote = `Курс на момент выставления счёта: 1¥ = ${cnyRateUsed.toFixed(2)} ₽, 1 USDT = ${usdtRate.toFixed(2)} ¥.`;
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
