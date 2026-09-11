import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { prisma } from "@/lib/prisma";

// Лёгкий список счетов (только id/name, без баланса) для выбора "на какой
// счёт пойдёт приход/расход" в CreatePaymentDialog и в "Расходный ордер" на
// карточке просчёта — любая залогиненная сессия менеджера (создание самого
// прихода/расхода теперь тоже доступно любому менеджеру по своим
// просчётам, см. app/api/manager-quotes/create-payment и
// app/api/manager-quotes/[id]/expense-order); id/name счёта не секретны,
// секретен только баланс, который остаётся только в
// /api/manager-cash-accounts. См. PB-V5 chat 2026-08-10/2026-08-11,
// 2026-09-11.
export async function GET(req: NextRequest) {
  const session = await getManagerSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Не авторизовано." }, { status: 401 });
  }

  const accounts = await prisma.cashAccount.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true },
  });
  return Response.json({ accounts });
}
