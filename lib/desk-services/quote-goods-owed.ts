import "server-only";
import { prisma } from "@/lib/prisma";

// Остаток "сколько ещё должны поставщику за товар" по списку просчётов,
// переведённый в ₽ по СОБСТВЕННОМУ замороженному курсу каждого просчёта
// (Quote.cnyRateUsed) — не историческому, это не датированная транзакция,
// а текущее значение "на сейчас" (см. QuoteGoodsOwedAmount в
// prisma/schema.prisma). Один батч-запрос на весь список, не по одному на
// просчёт — тот же принцип, что и у fetchQuoteRealFinancials. См. PB-V5
// chat 2026-09-12.
async function fetchQuoteGoodsOwedRub(quotes: { id: string; cnyRateUsed: unknown }[]): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (quotes.length === 0) return result;

  const rows = await prisma.quoteGoodsOwedAmount.findMany({
    where: { quoteId: { in: quotes.map((q) => q.id) } },
    select: { quoteId: true, amountCny: true },
  });
  if (rows.length === 0) return result;

  const cnyRateByQuoteId = new Map(quotes.map((q) => [q.id, Number(q.cnyRateUsed)]));
  for (const row of rows) {
    const rate = cnyRateByQuoteId.get(row.quoteId);
    if (!rate) continue;
    result.set(row.quoteId, Number(row.amountCny) * rate);
  }
  return result;
}

export { fetchQuoteGoodsOwedRub };
