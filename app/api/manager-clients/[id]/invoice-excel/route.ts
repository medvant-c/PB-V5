import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { canAccessManagerClient } from "@/lib/manager-scope";
import { prisma } from "@/lib/prisma";
import { renderInvoiceExcel, type InvoiceRow } from "@/lib/desk-services/invoice-excel";
import { recordIssuedInvoice, uploadInvoiceFile } from "@/lib/desk-services/issued-invoices";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST (not GET) for the same reason as quotes-excel — the manager
// checkbox-selects which quotes go on the invoice, so the selection is a
// body, not a query string.
export async function POST(req: NextRequest, { params }: RouteParams) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  const { id: clientId } = await params;
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) {
    return Response.json({ error: "Клиент не найден." }, { status: 404 });
  }

  if (!(await canAccessManagerClient(session, client))) {
    return Response.json({ error: "Этот клиент вне вашей зоны видимости." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Некорректный запрос." }, { status: 400 });
  }
  const { quoteIds } = (body as { quoteIds?: unknown }) ?? {};
  if (!Array.isArray(quoteIds) || quoteIds.length === 0 || !quoteIds.every((id) => typeof id === "string")) {
    return Response.json({ error: "Выберите хотя бы один просчёт." }, { status: 400 });
  }

  const quotes = await prisma.quote.findMany({
    where: { id: { in: quoteIds }, clientId, deletedAt: null },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      displayId: true,
      productName: true,
      quoteType: true,
      searchServiceFeeRub: true,
      searchFeeWaived: true,
      isCustomProduction: true,
      customProductionFeeRub: true,
    },
  });
  if (quotes.length === 0) {
    return Response.json({ error: "Просчёты не найдены." }, { status: 404 });
  }

  const rows: InvoiceRow[] = quotes.map((quote) => ({
    displayId: quote.displayId,
    productName: quote.productName,
    quoteType: quote.quoteType,
    searchServiceFeeRub: Number(quote.searchServiceFeeRub),
    searchFeeWaived: quote.searchFeeWaived,
    isCustomProduction: quote.isCustomProduction,
    customProductionFeeRub: Number(quote.customProductionFeeRub),
  }));

  const { buffer, totalRub } = await renderInvoiceExcel({ client: { name: client.name, phone: client.phone }, rows });

  const fileName = `Счёт на услуги — ${client.name}.xlsx`;

  const { storageKey } = await uploadInvoiceFile(buffer, fileName);
  await recordIssuedInvoice({
    type: "services",
    currency: "rub",
    clientId,
    managerId: session.managerId,
    amountTotal: totalRub,
    quoteIds: quotes.map((q) => q.id),
    storageKey,
    fileName,
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    },
  });
}
