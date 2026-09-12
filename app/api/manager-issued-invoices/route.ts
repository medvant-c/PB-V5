import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { canViewInvoices, getVisibleManagerIds } from "@/lib/manager-scope";
import { prisma } from "@/lib/prisma";

// "Выставленные счета" — по умолчанию (без ?kind=) company-wide лог (see
// IssuedInvoice's schema comment), гейтится canViewInvoices, той же
// "canViewX ⇒ видно всё, не только своё" границей, что и Касса/Отчёт о
// прибыли. search/type/currency/manager фильтрация — на клиенте, тот же
// convention, что trash-tab.tsx.
//
// ?kind=fulfillment — отдельный случай для новой вкладки «Выставленные
// счета» ВНУТРИ Фулфилмента: та секция открыта любому менеджеру в рамках
// его собственной зоны видимости (как и все остальные под-вкладки
// фулфилмента), а не canViewInvoices — это отдельное, owner/senior-
// выдаваемое право на company-wide просмотр счетов на выкуп, которое
// большинству рядовых менеджеров никогда не выдаётся. Поэтому здесь —
// scoping по getVisibleManagerIds через client.createdByManagerId, тот же
// принцип, что и у остальных fulfillment-роутов. См. PB-V5 chat
// 2026-09-12.
export async function GET(req: NextRequest) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  const kindParam = req.nextUrl.searchParams.get("kind");
  const kind = kindParam === "procurement" || kindParam === "fulfillment" ? kindParam : null;

  let clientScopeWhere: Record<string, unknown> = {};
  if (kind === "fulfillment") {
    const visibleManagerIds = await getVisibleManagerIds(session);
    clientScopeWhere = visibleManagerIds === "all" ? {} : { createdByManagerId: { in: visibleManagerIds } };
  } else if (!(await canViewInvoices(session))) {
    return Response.json({ error: "Нет доступа к этому разделу." }, { status: 403 });
  }

  const invoices = await prisma.issuedInvoice.findMany({
    where: kind ? { client: { kind, ...clientScopeWhere } } : {},
    orderBy: { createdAt: "desc" },
    include: {
      client: { select: { id: true, name: true, company: true } },
      manager: { select: { id: true, name: true } },
      quotes: { select: { quote: { select: { id: true, displayId: true } } } },
      fulfillmentOrders: { select: { fulfillmentOrder: { select: { id: true, displayId: true } } } },
    },
  });

  return Response.json({
    invoices: invoices.map((inv) => ({
      id: inv.id,
      displayId: inv.displayId,
      type: inv.type,
      currency: inv.currency,
      amountTotal: inv.amountTotal.toString(),
      fileName: inv.fileName,
      note: inv.note,
      cancelled: inv.cancelled,
      cancelledAt: inv.cancelledAt,
      createdAt: inv.createdAt,
      client: inv.client,
      manager: inv.manager,
      quotes: inv.quotes.map((q) => q.quote),
      fulfillmentOrders: inv.fulfillmentOrders.map((o) => o.fulfillmentOrder),
    })),
  });
}
