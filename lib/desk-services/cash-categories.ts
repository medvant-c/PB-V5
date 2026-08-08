import "server-only";
import { prisma } from "@/lib/prisma";

// The single income статья that both confirm-buyout AND the "Счёт на
// выкуп" partial-payment order route (app/api/manager-quotes/[id]/
// create-payment/route.ts) land client-payment entries in — flagged (not
// name-matched) so the owner can rename it freely. Self-heals if the
// flagged row is ever missing (e.g. deleted by mistake) instead of
// hard-failing whichever route needed it. Extracted from confirm-buyout's
// own copy of this function so both routes share exactly one category
// instead of silently creating two. See PB-V5 chat 2026-08-04.
async function getOrCreateBuyoutIncomeCategory() {
  const existing = await prisma.cashCategory.findFirst({ where: { type: "income", isBuyoutIncomeDefault: true } });
  if (existing) return existing;
  return prisma.cashCategory.create({
    data: { type: "income", name: "Приход от клиента на выкуп и услуги", isBuyoutIncomeDefault: true },
  });
}

// Счёт (см. CashAccount в prisma/schema.prisma), на который автоматически
// созданные приходные ордера (confirm-buyout, "Счёт на выкуп" через
// create-payment/route.ts) записываются по умолчанию — обе точки не имеют
// собственного UI для выбора счёта (это побочный эффект подтверждения
// факта/частичной оплаты, а не ручной ввод ордера), так что запись всегда
// уходит на счёт с наименьшим sortOrder ("Александр" — тот, на который
// перенесена вся история при введении счетов). Руководитель может потом
// вручную сделать перевод между счетами, если деньги реально пришли не
// туда. Самовосстанавливается, если счетов вообще ещё нет — тот же приём,
// что и у getOrCreateBuyoutIncomeCategory выше. См. PB-V5 chat 2026-08-08.
async function getDefaultCashAccount() {
  const existing = await prisma.cashAccount.findFirst({ where: { active: true }, orderBy: { sortOrder: "asc" } });
  if (existing) return existing;
  return prisma.cashAccount.create({ data: { name: "Александр", sortOrder: 0 } });
}

export { getOrCreateBuyoutIncomeCategory, getDefaultCashAccount };
