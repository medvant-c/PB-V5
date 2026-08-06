import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { canViewCash } from "@/lib/manager-scope";
import { prisma } from "@/lib/prisma";
import { buildProfitReport } from "@/lib/desk-services/profit-report";

// Feeds the "Расходный ордер" dialog's amount auto-suggestion — for a
// статья explicitly linked to an investor or "менеджер, закреплённый за
// клиентом" (see CashCategory.payoutTarget in prisma/schema.prisma), how
// much that recipient is currently owed for the selected client's
// CONFIRMED deals (buyoutFactConfirmed — the same gate the dashboard's
// "факт" numbers use, real realized profit only). Reuses buildProfitReport
// so this can never drift from what the profit report itself would show
// for the same quotes. Returns applicable:false for a статья with no
// payout target (e.g. "Закупка товара" — a real cost, not a profit-share
// payout) so the dialog knows not to touch the amount field at all. See
// PB-V5 chat 2026-08-05.
export async function GET(req: NextRequest) {
  const session = await getManagerSessionFromRequest(req);
  if (!session || !(await canViewCash(session))) {
    return Response.json({ error: "Нет доступа к кассе." }, { status: 403 });
  }

  const categoryId = req.nextUrl.searchParams.get("categoryId");
  const clientId = req.nextUrl.searchParams.get("clientId");
  if (!categoryId || !clientId) {
    return Response.json({ error: "Укажите статью и клиента." }, { status: 400 });
  }

  const category = await prisma.cashCategory.findUnique({ where: { id: categoryId } });
  if (!category || category.type !== "expense" || !category.payoutTarget) {
    return Response.json({ applicable: false });
  }

  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) {
    return Response.json({ error: "Клиент не найден." }, { status: 404 });
  }

  const confirmedQuotes = await prisma.quote.findMany({
    where: { clientId, deletedAt: null, buyoutFactConfirmed: true },
    select: { id: true },
  });

  const tariffSettings = await prisma.tariffSettings.findFirst({ orderBy: { createdAt: "desc" } });
  const cnyRateRub = tariffSettings ? Number(tariffSettings.cnyRateRub) : null;

  if (confirmedQuotes.length === 0) {
    return Response.json({
      applicable: true,
      amountRub: 0,
      amountCny: null,
      note: "У клиента пока нет ни одной сделки с подтверждённым фактом выкупа.",
    });
  }

  const { totals } = await buildProfitReport(confirmedQuotes.map((q) => q.id));

  let amountRub = 0;
  if (category.payoutTarget === "assigned_manager") {
    amountRub = totals.managerPremiumRub;
  } else if (category.payoutTarget === "investor" && category.linkedInvestorId) {
    amountRub = totals.investorShares.find((s) => s.id === category.linkedInvestorId)?.shareRub ?? 0;
  }
  amountRub = Math.max(0, amountRub);

  return Response.json({
    applicable: true,
    amountRub,
    amountCny: cnyRateRub && cnyRateRub > 0 ? amountRub / cnyRateRub : null,
    note: `Рассчитано по ${confirmedQuotes.length} подтверждённой сделке (сделкам) клиента.`,
  });
}
