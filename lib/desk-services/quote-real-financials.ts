import "server-only";
import { prisma } from "@/lib/prisma";
import {
  GOODS_EXPENSE_CATEGORY_NAME,
  CHINA_DELIVERY_EXPENSE_CATEGORY_NAME,
  CARGO_EXPENSE_CATEGORY_NAME,
  CARGO_INCOME_CATEGORY_NAME,
} from "@/lib/desk-services/cash-categories";
import { loadCnyRateHistory, cnyRateRubAsOf } from "@/lib/desk-services/historical-cny-rate";

// Реальные деньги в Кассе по блокам "Выкуп"/"Карго" для НЕ подтверждённых
// по старой схеме сделок (buyoutFactConfirmed: false) — приход для блока
// "Выкуп" уже есть в QuotePaymentAllocation (см. вызывающий код), здесь
// только расход (реальные расходные CashOrder — "Закупка товара"/
// "Доставка по Китаю") и весь блок "Карго" (свой приход И расход — карго
// выставляется отдельным счётом от "Счёта на выкуп", см. buyout-invoice-
// calc.ts). Читает категории ПО ИМЕНИ, ничего не создаёт — self-heal
// (getOrCreate...) живёт только на стороне записи (lib/desk-services/
// cash-categories.ts), просмотр отчёта не должен иметь побочных эффектов.
// Один батч-запрос на весь набор просчётов, не один на просчёт. См. PB-V5
// chat 2026-08-11.
interface QuoteRealFinancials {
  buyoutExpenseRub: number;
  cargoIncomeRub: number;
  cargoExpenseRub: number;
}

function emptyQuoteRealFinancials(): QuoteRealFinancials {
  return { buyoutExpenseRub: 0, cargoIncomeRub: 0, cargoExpenseRub: 0 };
}

async function fetchQuoteRealFinancials(quoteIds: string[]): Promise<Map<string, QuoteRealFinancials>> {
  const result = new Map<string, QuoteRealFinancials>();
  if (quoteIds.length === 0) return result;

  const [goodsCategory, chinaCategory, cargoExpenseCategory, cargoIncomeCategory, tariffHistory] = await Promise.all([
    prisma.cashCategory.findFirst({ where: { type: "expense", name: GOODS_EXPENSE_CATEGORY_NAME } }),
    prisma.cashCategory.findFirst({ where: { type: "expense", name: CHINA_DELIVERY_EXPENSE_CATEGORY_NAME } }),
    prisma.cashCategory.findFirst({ where: { type: "expense", name: CARGO_EXPENSE_CATEGORY_NAME } }),
    prisma.cashCategory.findFirst({ where: { type: "income", name: CARGO_INCOME_CATEGORY_NAME } }),
    loadCnyRateHistory(),
  ]);
  const buyoutExpenseCategoryIds = new Set([goodsCategory?.id, chinaCategory?.id].filter((id): id is string => Boolean(id)));
  const cargoExpenseCategoryId = cargoExpenseCategory?.id ?? null;
  const cargoIncomeCategoryId = cargoIncomeCategory?.id ?? null;
  const relevantCategoryIds = [...buyoutExpenseCategoryIds, cargoExpenseCategoryId, cargoIncomeCategoryId].filter(
    (id): id is string => Boolean(id),
  );
  // Ни одна из этих статей ещё ни разу не создавалась (совсем новая
  // база/тест) — расходов/прихода по ним точно нет, не тратим запрос.
  if (relevantCategoryIds.length === 0) return result;

  const orders = await prisma.cashOrder.findMany({
    where: { quoteId: { in: quoteIds }, categoryId: { in: relevantCategoryIds } },
    select: { quoteId: true, categoryId: true, currency: true, amount: true, amountCny: true, date: true },
  });

  for (const order of orders) {
    if (!order.quoteId) continue;
    // ₽ напрямую, без конверсии — уже реальная сумма. Иначе — курс,
    // действовавший НА ДАТУ этого расхода/прихода (не сегодняшний, та же
    // причина, что и в lib/desk-services/period-report.ts).
    const rub =
      order.currency === "rub"
        ? Number(order.amount)
        : (() => {
            const rate = cnyRateRubAsOf(tariffHistory, order.date);
            return rate === null ? 0 : Number(order.amountCny) * rate;
          })();

    const entry = result.get(order.quoteId) ?? emptyQuoteRealFinancials();
    if (buyoutExpenseCategoryIds.has(order.categoryId)) entry.buyoutExpenseRub += rub;
    else if (order.categoryId === cargoExpenseCategoryId) entry.cargoExpenseRub += rub;
    else if (order.categoryId === cargoIncomeCategoryId) entry.cargoIncomeRub += rub;
    result.set(order.quoteId, entry);
  }

  return result;
}

export { fetchQuoteRealFinancials, emptyQuoteRealFinancials };
export type { QuoteRealFinancials };
