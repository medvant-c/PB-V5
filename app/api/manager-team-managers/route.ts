import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { getTeamManagers } from "@/lib/manager-scope";

// Лёгкий эндпоинт для clients-tab.tsx — раньше вместо этого дёргался
// весь /api/manager-confirmations только чтобы достать teamManagers и
// проверить "старший/руководитель ли я" по факту успешного ответа, при
// этом реально считались ещё 9 разных очередей на подтверждение (карго,
// курсы, комиссия за выкуп, услуга поиска, производство под заказ,
// клиенты и т.д.), которые здесь никогда не показывались. См. PB-V5 chat
// 2026-08-07.
export async function GET(req: NextRequest) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }
  if (session.role !== "owner" && session.role !== "senior") {
    return Response.json({ error: "Доступно только старшему менеджеру и руководителю." }, { status: 403 });
  }

  const teamManagers = await getTeamManagers(session);
  return Response.json({ teamManagers });
}
