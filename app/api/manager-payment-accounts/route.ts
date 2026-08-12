import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { canViewCash } from "@/lib/manager-scope";
import { prisma } from "@/lib/prisma";

// Лёгкий список счетов (только id/name, без баланса) для выбора "на какой
// счёт пойдёт приход/расход" в CreatePaymentDialog и в "Расходный ордер" на
// карточке просчёта — owner/senior (тот же gate, что и у самого создания
// приходного ордера, app/api/manager-quotes/create-payment) ИЛИ явно
// выданный canViewCash (тот же gate, что и у самой записи в Кассу,
// app/api/manager-quotes/[id]/expense-order) — старший менеджер/менеджер с
// canViewCash всё равно должен видеть, куда заводит ордер, который сам же
// создаёт. Балансы (реально денежно-чувствительные) остаются только в
// /api/manager-cash-accounts. См. PB-V5 chat 2026-08-10/2026-08-11.
export async function GET(req: NextRequest) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }
  if (session.role !== "owner" && session.role !== "senior" && !(await canViewCash(session))) {
    return Response.json({ error: "Нет доступа." }, { status: 403 });
  }

  const accounts = await prisma.cashAccount.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true },
  });
  return Response.json({ accounts });
}
