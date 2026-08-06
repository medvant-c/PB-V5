import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { canViewProfitReport } from "@/lib/manager-scope";
import { buildPeriodReport } from "@/lib/desk-services/period-report";

// "Реальные деньги за период" — same Manager.canViewProfitReport gate as
// /api/manager-profit-report (owner always; same confidentiality boundary —
// investor shares, manager premiums). See lib/desk-services/period-report.ts
// for what "period" actually means here (dated by real money/fact events,
// not by quote creation date).
export async function GET(req: NextRequest) {
  const session = await getManagerSessionFromRequest(req);
  if (session === null || !(await canViewProfitReport(session))) {
    return Response.json({ error: "Нет доступа к отчёту о прибыли." }, { status: 403 });
  }

  const fromParam = req.nextUrl.searchParams.get("from");
  const toParam = req.nextUrl.searchParams.get("to");
  const from = fromParam ? new Date(fromParam) : null;
  const to = toParam ? new Date(toParam) : null;
  if (!from || Number.isNaN(from.getTime()) || !to || Number.isNaN(to.getTime())) {
    return Response.json({ error: "Укажите корректный период (from/to)." }, { status: 400 });
  }
  if (from >= to) {
    return Response.json({ error: "Начало периода должно быть раньше конца." }, { status: 400 });
  }

  const report = await buildPeriodReport({ from, to });
  return Response.json(report);
}
