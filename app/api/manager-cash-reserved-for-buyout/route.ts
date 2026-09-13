import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { canViewCash } from "@/lib/manager-scope";
import { fetchQuoteReserveRows } from "@/lib/desk-services/quote-reserve";

// Резерв под выкуп, компания целиком — read-only аннотация к остатку
// Кассы, доступна только тем, у кого canViewCash. Формула — см.
// lib/desk-services/quote-reserve.ts.
export async function GET(req: NextRequest) {
  const session = await getManagerSessionFromRequest(req);
  if (!session || !(await canViewCash(session))) {
    return Response.json({ error: "Нет доступа к кассе." }, { status: 403 });
  }

  const { reservedCny, rows } = await fetchQuoteReserveRows({});
  return Response.json({ reservedCny, rows });
}
