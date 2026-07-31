import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { buildProfitReport, parseQuoteIds } from "@/lib/desk-services/profit-report";
import { renderProfitReportPdf } from "@/lib/desk-services/profit-report-pdf";

// Same POST-with-body shape as quotes-pdf-bundle — the owner checkbox-
// selects a subset in the profit-report tab, this downloads exactly the
// same numbers the on-screen report shows (both call buildProfitReport).
export async function POST(req: NextRequest) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }
  if (session.role !== "owner") {
    return Response.json({ error: "Доступно только руководителю." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Некорректный запрос." }, { status: 400 });
  }
  const quoteIds = parseQuoteIds(body);
  if (!quoteIds) {
    return Response.json({ error: "Выберите хотя бы один просчёт." }, { status: 400 });
  }

  const report = await buildProfitReport(quoteIds);
  const buffer = await renderProfitReportPdf(report);

  const fileName = `Отчёт о прибыли (${report.rows.length}).pdf`;
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    },
  });
}
