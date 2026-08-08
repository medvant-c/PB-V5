import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { canViewCash } from "@/lib/manager-scope";
import { prisma } from "@/lib/prisma";
import { renderCashReportExcel } from "@/lib/desk-services/cash-report-excel";
import { computeAccountBalanceCny, computeAllAccountBalances } from "@/lib/desk-services/cash-balance";

function parseMonthRange(monthParam: string | null): [Date, Date] {
  const match = monthParam?.match(/^(\d{4})-(\d{2})$/);
  const now = new Date();
  const year = match ? Number(match[1]) : now.getFullYear();
  const monthIndex = match ? Number(match[2]) - 1 : now.getMonth();
  return [new Date(year, monthIndex, 1), new Date(year, monthIndex + 1, 1)];
}

const MONTH_LABEL = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь",
];

interface OrderForSum {
  type: string;
  amountCny: unknown;
}
function sumByType(orders: OrderForSum[], type: "income" | "expense"): number {
  return orders.filter((o) => o.type === type).reduce((sum, o) => sum + Number(o.amountCny), 0);
}

// Same balance/breakdown math as GET /api/manager-cash-orders — duplicated
// rather than shared because the two routes return different shapes
// (Prisma records for the UI vs. a rendered .xlsx buffer here).
export async function GET(req: NextRequest) {
  const session = await getManagerSessionFromRequest(req);
  if (!session || !(await canViewCash(session))) {
    return Response.json({ error: "Нет доступа к кассе." }, { status: 403 });
  }

  const [monthStart, monthEnd] = parseMonthRange(req.nextUrl.searchParams.get("month"));
  // Необязательный — тот же фильтр по счёту (см. CashAccount в
  // prisma/schema.prisma), что и основная лента в интерфейсе. См. PB-V5
  // chat 2026-08-08.
  const accountIdFilter = req.nextUrl.searchParams.get("accountId");

  const openingBalanceCny = accountIdFilter
    ? await computeAccountBalanceCny(accountIdFilter, monthStart)
    : (await computeAllAccountBalances(monthStart)).totalBalanceCny;

  const monthOrders = await prisma.cashOrder.findMany({
    where: { date: { gte: monthStart, lt: monthEnd }, ...(accountIdFilter ? { accountId: accountIdFilter } : {}) },
    include: { category: true, client: { select: { name: true } }, createdByManager: { select: { name: true } } },
    orderBy: { date: "asc" },
  });

  const incomeCny = sumByType(monthOrders, "income");
  const expenseCny = sumByType(monthOrders, "expense");
  const closingBalanceCny = openingBalanceCny + incomeCny - expenseCny;

  const breakdownMap = new Map<string, { name: string; type: "income" | "expense"; totalCny: number }>();
  for (const order of monthOrders) {
    const entry = breakdownMap.get(order.categoryId) ?? { name: order.category.name, type: order.type, totalCny: 0 };
    entry.totalCny += Number(order.amountCny);
    breakdownMap.set(order.categoryId, entry);
  }

  const monthLabel = `${MONTH_LABEL[monthStart.getMonth()]} ${monthStart.getFullYear()}`;

  const buffer = await renderCashReportExcel({
    monthLabel,
    openingBalanceCny,
    incomeCny,
    expenseCny,
    closingBalanceCny,
    categoryBreakdown: [...breakdownMap.values()],
    orders: monthOrders.map((order) => ({
      date: order.date,
      type: order.type,
      categoryName: order.category.name,
      clientName: order.client?.name ?? null,
      amount: Number(order.amount),
      currency: order.currency,
      cnyToCurrencyRate: Number(order.cnyToCurrencyRate),
      amountCny: Number(order.amountCny),
      comment: order.comment,
      createdByName: order.createdByManager.name,
    })),
  });

  const fileName = `Кассовый отчёт — ${monthLabel}.xlsx`;
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    },
  });
}
