import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { canAccessManagerQuote } from "@/lib/manager-scope";
import { prisma } from "@/lib/prisma";
import { renderFulfillmentInvoicePdf, type FulfillmentInvoiceCurrency } from "@/lib/desk-services/fulfillment-invoice-pdf";
import { recordIssuedInvoice, uploadInvoiceFile } from "@/lib/desk-services/issued-invoices";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// «Выставить счёт» по заявке на обработку — смоделировано на
// app/api/manager-quotes/[id]/buyout-invoice/route.ts, но без курсовой
// механики квоты (usd/usdt): у заявки только totalRub и уже зафиксированный
// cnyRateUsed, поэтому валюта счёта — только rub или cny. type всегда
// "services" (фулфилмент — услуга, не выкуп товара). См. PB-V5 chat
// 2026-09-12.
export async function GET(req: NextRequest, { params }: RouteParams) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  const currencyParam = req.nextUrl.searchParams.get("currency");
  if (currencyParam !== "rub" && currencyParam !== "cny") {
    return Response.json({ error: "Укажите валюту счёта: rub или cny." }, { status: 400 });
  }
  const currency: FulfillmentInvoiceCurrency = currencyParam;

  const { id } = await params;
  const order = await prisma.fulfillmentOrder.findUnique({
    where: { id },
    include: {
      client: { select: { id: true, name: true, company: true } },
      items: { orderBy: { createdAt: "asc" }, include: { services: true } },
      orderServices: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!order) {
    return Response.json({ error: "Заявка не найдена." }, { status: 404 });
  }
  if (!(await canAccessManagerQuote(session, order.managerId))) {
    return Response.json({ error: "Нет доступа к этой заявке." }, { status: 403 });
  }

  const cnyRateUsed = Number(order.cnyRateUsed);
  const toCurrency = (rub: number) => (currency === "cny" ? rub / cnyRateUsed : rub);

  const lineItems = [
    ...order.items.map((item) => ({
      label: item.name,
      quantity: item.plannedQuantity,
      amount: toCurrency(item.services.reduce((sum, s) => sum + Number(s.priceRub) * s.quantity, 0)),
    })),
    ...order.orderServices.map((s) => ({
      label: s.name,
      quantity: s.quantity,
      amount: toCurrency(Number(s.priceRub) * s.quantity),
    })),
  ];
  if (lineItems.length === 0) {
    return Response.json({ error: "В заявке нет позиций для выставления счёта." }, { status: 400 });
  }
  const totalAmount = toCurrency(Number(order.totalRub));

  const buffer = await renderFulfillmentInvoicePdf({
    displayId: order.displayId,
    client: { name: order.client.name, company: order.client.company },
    currency,
    lineItems,
    totalAmount,
  });

  const CURRENCY_FILE_SUFFIX: Record<FulfillmentInvoiceCurrency, string> = { rub: "₽", cny: "¥" };
  const fileName = `Счёт на обработку — заявка №${order.displayId} (${CURRENCY_FILE_SUFFIX[currency]}).pdf`;

  const { storageKey } = await uploadInvoiceFile(buffer, fileName);
  await recordIssuedInvoice({
    type: "services",
    currency,
    clientId: order.client.id,
    managerId: session.managerId,
    amountTotal: totalAmount,
    fulfillmentOrderIds: [order.id],
    storageKey,
    fileName,
    mimeType: "application/pdf",
  });

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    },
  });
}
