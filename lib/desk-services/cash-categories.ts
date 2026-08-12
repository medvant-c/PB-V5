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

// Well-known статья names shared between the write side (this file's
// self-heal creators, the "Расходный ордер"/"Приходный ордер" shortcuts on
// a quote card) and the read side (lib/desk-services/quote-real-financials.ts,
// which looks these up WITHOUT creating them — a report must never have the
// side effect of creating a Касса статья just because someone viewed it).
const GOODS_EXPENSE_CATEGORY_NAME = "Закупка товара";
const CHINA_DELIVERY_EXPENSE_CATEGORY_NAME = "Доставка по Китаю";
const CARGO_EXPENSE_CATEGORY_NAME = "Расход по карго";
const CARGO_INCOME_CATEGORY_NAME = "Приход карго";

// Same self-heal idea as getOrCreateBuyoutIncomeCategory above, but
// name-matched instead of flag-matched — used for the two расходный статьи
// the "Расходный ордер" shortcut on a quote card writes to ("Закупка
// товара"/"Доставка по Китаю"), which the owner already had a real
// "Закупка товара" статья for before this shortcut existed (managers were
// creating these by hand from Касса). Matching by name reuses that
// existing row instead of creating a duplicate; a flag column wasn't worth
// a schema migration for two statically-named categories. If the owner
// ever renames one, this just creates a fresh row under the new name next
// time — no worse than the category picker itself already behaves for any
// other статья. See PB-V5 chat 2026-08-11.
async function getOrCreateExpenseCategory(name: string) {
  const existing = await prisma.cashCategory.findFirst({ where: { type: "expense", name } });
  if (existing) return existing;
  return prisma.cashCategory.create({ data: { type: "expense", name } });
}

// Same name-matched self-heal, income side — "Приход карго" already
// existed as a real статья before this (managers billed cargo separately
// from the main "Счёт на выкуп", see buyout-invoice-calc.ts's own comment
// on why cargo is excluded from that invoice). Formalizing the name here
// so lib/desk-services/quote-real-financials.ts can reliably find the same
// row a "Приходный ордер" for cargo would have used. See PB-V5 chat
// 2026-08-11.
async function getOrCreateCargoIncomeCategory() {
  const existing = await prisma.cashCategory.findFirst({ where: { type: "income", name: CARGO_INCOME_CATEGORY_NAME } });
  if (existing) return existing;
  return prisma.cashCategory.create({ data: { type: "income", name: CARGO_INCOME_CATEGORY_NAME } });
}

export {
  getOrCreateBuyoutIncomeCategory,
  getDefaultCashAccount,
  getOrCreateExpenseCategory,
  getOrCreateCargoIncomeCategory,
  GOODS_EXPENSE_CATEGORY_NAME,
  CHINA_DELIVERY_EXPENSE_CATEGORY_NAME,
  CARGO_EXPENSE_CATEGORY_NAME,
  CARGO_INCOME_CATEGORY_NAME,
};
