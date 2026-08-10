import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { canViewInvoices } from "@/lib/manager-scope";
import { prisma } from "@/lib/prisma";

// "Выставленные счета" — company-wide log (see IssuedInvoice's schema
// comment), same "canViewX ⇒ see everything, not just your own" scope as
// Касса/Отчёт о прибыли. Returns the whole log; search/type/currency/
// manager filtering happens client-side, same convention as trash-tab.tsx.
export async function GET(req: NextRequest) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }
  if (!(await canViewInvoices(session))) {
    return Response.json({ error: "Нет доступа к этому разделу." }, { status: 403 });
  }

  const invoices = await prisma.issuedInvoice.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      client: { select: { id: true, name: true, company: true } },
      manager: { select: { id: true, name: true } },
      quotes: { select: { quote: { select: { id: true, displayId: true } } } },
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
    })),
  });
}
