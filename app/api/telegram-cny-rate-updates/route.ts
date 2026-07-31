import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { prisma } from "@/lib/prisma";

// Owner-only read-only log of what the Telegram rate webhook has done —
// same audience as Тарифы itself. Lets the owner confirm today's rate
// actually came through (and see why, if it didn't) without needing
// server/database access. See app/api/telegram-cny-rate-webhook/route.ts.
export async function GET(req: NextRequest) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }
  if (session.role !== "owner") {
    return Response.json({ error: "Доступно только руководителю." }, { status: 403 });
  }

  const updates = await prisma.telegramCnyRateUpdate.findMany({
    orderBy: { receivedAt: "desc" },
    take: 20,
  });

  return Response.json({ updates });
}
