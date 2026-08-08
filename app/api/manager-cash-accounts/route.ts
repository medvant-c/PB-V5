import { NextRequest } from "next/server";
import { getManagerSessionFromRequest } from "@/lib/manager-auth";
import { canViewCash } from "@/lib/manager-scope";
import { prisma } from "@/lib/prisma";
import { computeAllAccountBalances } from "@/lib/desk-services/cash-balance";

// Счета (см. CashAccount в prisma/schema.prisma) — "кто держит деньги"
// (Александр/Антон), отдельно от статей ("на что"). Тот же
// Manager.canViewCash gate, что и весь остальной раздел «Касса». См.
// PB-V5 chat 2026-08-08.
export async function GET(req: NextRequest) {
  const session = await getManagerSessionFromRequest(req);
  if (!session || !(await canViewCash(session))) {
    return Response.json({ error: "Нет доступа к кассе." }, { status: 403 });
  }

  const accounts = await prisma.cashAccount.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } });
  const { balances, totalBalanceCny } = await computeAllAccountBalances();
  const balanceByAccountId = new Map(balances.map((b) => [b.accountId, b.balanceCny]));

  return Response.json({
    accounts: accounts.map((a) => ({ id: a.id, name: a.name, balanceCny: balanceByAccountId.get(a.id) ?? 0 })),
    totalBalanceCny,
  });
}

export async function POST(req: NextRequest) {
  const session = await getManagerSessionFromRequest(req);
  if (!session || !(await canViewCash(session))) {
    return Response.json({ error: "Нет доступа к кассе." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Некорректный запрос." }, { status: 400 });
  }
  const { name } = (body as { name?: unknown }) ?? {};
  if (typeof name !== "string" || !name.trim()) {
    return Response.json({ error: "Укажите название счёта." }, { status: 400 });
  }

  const existing = await prisma.cashAccount.findUnique({ where: { name: name.trim() } });
  if (existing) {
    return Response.json({ error: "Такой счёт уже существует." }, { status: 409 });
  }

  const maxSortOrder = await prisma.cashAccount.aggregate({ _max: { sortOrder: true } });
  const account = await prisma.cashAccount.create({
    data: { name: name.trim(), sortOrder: (maxSortOrder._max.sortOrder ?? -1) + 1 },
  });

  return Response.json({ account: { id: account.id, name: account.name, balanceCny: 0 } }, { status: 201 });
}
