import "server-only";
import { prisma } from "@/lib/prisma";

interface AccountBalance {
  accountId: string;
  name: string;
  balanceCny: number;
}

// Баланс ОДНОГО счёта по состоянию на asOfDate (по умолчанию — прямо
// сейчас): якорь этого счёта (если задан, см. CashOpeningBalance.accountId)
// + все его ордера после даты якоря и до asOfDate + переводы в/из этого
// счёта в том же окне (см. CashTransfer). Без якоря — просто вся история
// счёта с нуля. Один и тот же расчёт используется и для "сколько там денег
// сейчас" (cash-accounts route), и для "какой был остаток НА НАЧАЛО месяца"
// (cash-orders route, при выбранном счёте) — второе просто передаёт
// monthStart как asOfDate. См. PB-V5 chat 2026-08-08.
async function computeAccountBalanceCny(accountId: string, asOfDate?: Date): Promise<number> {
  const anchor = await prisma.cashOpeningBalance.findFirst({ where: { accountId }, orderBy: { updatedAt: "desc" } });
  const sinceDate = anchor?.effectiveDate;
  const dateWhere = {
    ...(sinceDate ? { gte: sinceDate } : {}),
    ...(asOfDate ? { lt: asOfDate } : {}),
  };
  const dateFilter = Object.keys(dateWhere).length > 0 ? { date: dateWhere } : {};

  const [orders, transfersIn, transfersOut] = await Promise.all([
    prisma.cashOrder.findMany({ where: { accountId, ...dateFilter }, select: { type: true, amountCny: true } }),
    prisma.cashTransfer.findMany({ where: { toAccountId: accountId, ...dateFilter }, select: { amountCny: true } }),
    prisma.cashTransfer.findMany({ where: { fromAccountId: accountId, ...dateFilter }, select: { amountCny: true } }),
  ]);

  const incomeCny = orders.filter((o) => o.type === "income").reduce((sum, o) => sum + Number(o.amountCny), 0);
  const expenseCny = orders.filter((o) => o.type === "expense").reduce((sum, o) => sum + Number(o.amountCny), 0);
  const transfersInCny = transfersIn.reduce((sum, t) => sum + Number(t.amountCny), 0);
  const transfersOutCny = transfersOut.reduce((sum, t) => sum + Number(t.amountCny), 0);

  return Number(anchor?.amountCny ?? 0) + incomeCny - expenseCny + transfersInCny - transfersOutCny;
}

// Баланс каждого активного счёта (по состоянию на asOfDate, по умолчанию
// сейчас) + их сумма ("Итого"). Перевод между счетами никогда не меняет
// эту сумму (см. CashTransfer) — только то, как она разложена по счетам,
// поэтому "итого" всегда ровно равно сумме per-account балансов ниже, без
// отдельного пересчёта другим способом.
async function computeAllAccountBalances(asOfDate?: Date): Promise<{ balances: AccountBalance[]; totalBalanceCny: number }> {
  const accounts = await prisma.cashAccount.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } });
  const balances = await Promise.all(
    accounts.map(async (account) => ({
      accountId: account.id,
      name: account.name,
      balanceCny: await computeAccountBalanceCny(account.id, asOfDate),
    })),
  );
  const totalBalanceCny = balances.reduce((sum, b) => sum + b.balanceCny, 0);
  return { balances, totalBalanceCny };
}

export { computeAccountBalanceCny, computeAllAccountBalances };
export type { AccountBalance };
