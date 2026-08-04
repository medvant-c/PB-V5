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

export { getOrCreateBuyoutIncomeCategory };
