import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { prisma } from "@/lib/prisma";

// Лёгкий список счетов (только id/name, без баланса) для выбора "на какой
// счёт пойдёт приход" в CreatePaymentDialog — тот же owner/senior gate, что
// и у самого создания приходного ордера (app/api/manager-quotes/create-
// payment), а не canViewCash от полноценной вкладки «Касса»: старший
// менеджер без явно выданного canViewCash всё равно должен видеть, куда
// заводит платёж, который сам же создаёт. Балансы (реально денежно-
// чувствительные) остаются только в /api/manager-cash-accounts. См. PB-V5
// chat 2026-08-10.
export async function GET(req: NextRequest) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }
  if (session.role !== "owner" && session.role !== "senior") {
    return Response.json({ error: "Доступно только старшему менеджеру и руководителю." }, { status: 403 });
  }

  const accounts = await prisma.cashAccount.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true },
  });
  return Response.json({ accounts });
}
