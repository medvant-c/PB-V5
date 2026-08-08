import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { canAccessManagerClient } from "@/lib/manager-scope";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";
import { renderManagerQuotesListPdf, type ManagerQuoteListRow } from "@/lib/desk-services/quotes-list-pdf";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// «Список для менеджера» — узкий внутренний формат (не клиентский расчёт):
// количество, закупочная цена, цена доставки по Китаю, описание, габариты,
// цвет — то, что нужно для согласования заказа с фабрикой/логистикой, без
// клиентских итогов/тарифов. Тот же необязательный `ids` фильтр, что и у
// /api/manager-clients/[id]/quotes-pdf — весь список клиента либо только
// отмеченные. См. PB-V5 chat 2026-08-08.
export async function GET(req: NextRequest, { params }: RouteParams) {
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

  const idsParam = req.nextUrl.searchParams.get("ids");
  const idsFilter = idsParam ? idsParam.split(",").filter(Boolean) : null;

  const quotes = await prisma.quote.findMany({
    where: { clientId, deletedAt: null, ...(idsFilter ? { id: { in: idsFilter } } : {}) },
    orderBy: { createdAt: "asc" },
  });
  if (quotes.length === 0) {
    return Response.json({ error: idsFilter ? "Выбранные просчёты не найдены." : "У клиента пока нет просчётов." }, { status: 404 });
  }

  // Первое фото на просчёт, как в /api/manager-clients/[id]/quotes-pdf —
  // без него список для менеджера бесполезен для сверки с фабрикой. См.
  // PB-V5 chat 2026-08-08.
  const rows: ManagerQuoteListRow[] = await Promise.all(
    quotes.map(async (quote) => {
      const firstPhoto = await prisma.deskFile.findFirst({
        where: { tab: "quotes", relatedId: quote.id },
        orderBy: { uploadedAt: "asc" },
      });
      return {
        displayId: quote.displayId,
        productName: quote.productName,
        productDescription: quote.productDescription,
        color: quote.color,
        dimensions: quote.dimensions,
        quantity: quote.quantity,
        priceCnyPerUnit: Number(quote.priceCnyPerUnit),
        chinaDeliveryCny: Number(quote.chinaDeliveryCny),
        photoBuffer: firstPhoto ? await storage.get(firstPhoto.storageKey) : null,
      };
    }),
  );

  const buffer = await renderManagerQuotesListPdf({ client: { name: client.name, company: client.company }, rows });

  const fileName = `Список для менеджера${idsFilter ? " (выбранные)" : ""} — ${client.name}.pdf`;
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    },
  });
}
