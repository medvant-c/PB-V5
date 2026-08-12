import "server-only";
import { prisma } from "@/lib/prisma";

// TariffSettings — курс ¥→₽ на КАЖДЫЙ момент времени, а не только "сейчас"
// (см. schema-комментарий: append-only/версионируемые строки, не
// singleton). Нужен везде, где переводим реальную ¥-сумму историческим
// событием (выплата, расходный ордер) в ₽ — брать "сегодняшний" курс для
// события месячной давности искажает цифру, которая должна оставаться
// стабильной независимо от того, когда на неё посмотрели. Вынесено сюда
// одной копией — раньше был свой inline-вариант в period-report.ts (см.
// PB-V5 chat 2026-08-10), теперь им же пользуется и
// quote-real-financials.ts. См. PB-V5 chat 2026-08-11.
interface CnyRateHistoryEntry {
  cnyRateRub: number;
  createdAt: Date;
}

async function loadCnyRateHistory(): Promise<CnyRateHistoryEntry[]> {
  const rows = await prisma.tariffSettings.findMany({
    orderBy: { createdAt: "asc" },
    select: { cnyRateRub: true, createdAt: true },
  });
  return rows.map((r) => ({ cnyRateRub: Number(r.cnyRateRub), createdAt: r.createdAt }));
}

// Курс, действовавший НА дату date (последний заведённый курс с
// createdAt <= date) — если событие старше самой ранней записи в
// TariffSettings, откатывается к самой ранней (лучше приблизительный
// курс, чем ничего). null только если курсов вообще ещё ни разу не
// заводили.
function cnyRateRubAsOf(history: CnyRateHistoryEntry[], date: Date): number | null {
  let rate: number | null = null;
  for (const entry of history) {
    if (entry.createdAt > date) break;
    rate = entry.cnyRateRub;
  }
  return rate ?? (history.length > 0 ? history[0].cnyRateRub : null);
}

export { loadCnyRateHistory, cnyRateRubAsOf };
export type { CnyRateHistoryEntry };
