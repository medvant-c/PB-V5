import "server-only";
import { prisma } from "@/lib/prisma";

// Default hint-text seeds mirror exactly what used to be hardcoded JSX in
// components/manager/manager-dashboard.tsx before it moved here — see
// SystemSettings in prisma/schema.prisma. "**слово**" renders bold (see
// FormattedText in manager-dashboard.tsx); "\n\n" starts a new paragraph.
const DEFAULT_PREMIUM_EXPLANATION_TEXT =
  "**Просчёт** — 10% от прибыли для обычного клиента (лид компании), 100% для подтверждённого личного клиента " +
  "менеджера. **Выкуп и Скидка поставщика** — 10% для обычного клиента, 50% для личного клиента. Всё по факту, как " +
  "только старший менеджер или руководитель подтвердит реальную сумму выкупа.\n\n" +
  "**Карго и Фулфилмент** — премия менеджеру только для подтверждённого личного клиента: карго — фиксированная " +
  "ставка $/кг или $/м³ (задаётся во вкладке «Тарифы»), фулфилмент — 10% от выставленной суммы. Для лида компании " +
  "менеджер с карго и фулфилмента ничего не получает.";

const DEFAULT_INCOME_SUMMARY_TEXT =
  "«В работе» выше — это оборот (всё, что заплатит клиент). Здесь — сколько из него реальная прибыль компании, по " +
  "источникам (Просчёт + Выкуп, Скидка поставщика, Карго), и отдельно — что уже подтверждено (факт), а что ещё " +
  "оценка (потенциал).";

const DEFAULT_INCOME_DETAIL_TEXT =
  "**Просчёт** = услуга поиска (Standart/Expert/Pro). **Выкуп** = комиссия за организацию выкупа + доп. услуги из " +
  "прайс-листа + разница между плановой ценой товара и тем, что реально потрачено на выкуп.\n\n" +
  "**Скидка поставщика** — дополнительная скидка фабрики сверх плановой цены, вводится вручную вместе с фактом " +
  "выкупа. Отдельный источник, не входит в «Выкуп» выше.\n\n" +
  "Потенциал считает разницу план/факт как 0, пока старший менеджер или руководитель не подтвердит реальную сумму " +
  "выкупа — тогда просчёт переходит в факт.\n\n" +
  "**Карго** = то, что заплатил клиент за карго-доставку, минус её реальная себестоимость (задаётся во вкладке " +
  "«Тарифы»). В факт попадает только при статусе «Выдан клиенту» — до этого, даже если реальные габариты уже " +
  "внесены, доход числится в потенциале.\n\n" +
  "**Не считается доходом (100% расход, без наценки):** стоимость самого товара по плану и доставка по Китаю до " +
  "склада.";

// Singleton (unlike TariffSettings' append-only rows) — every read always
// reflects today's value, nothing here is ever snapshotted onto a Quote.
// Auto-creates the row with these defaults on first read so every other
// caller can assume it always exists, same "self-heals if missing"
// convention as getOrCreateBuyoutIncomeCategory in confirm-buyout/route.ts.
// ownerManagerId is only used the very first time, to satisfy the
// updatedByManagerId foreign key — after that the row is updated in place.
async function getSystemSettings(ownerManagerId?: string) {
  const existing = await prisma.systemSettings.findFirst();
  if (existing) return existing;

  const fallbackOwnerId = ownerManagerId ?? (await prisma.manager.findFirst({ where: { role: "owner" } }))?.id;
  if (!fallbackOwnerId) {
    throw new Error("Не удалось создать системные настройки — не найден руководитель.");
  }
  return prisma.systemSettings.create({
    data: {
      updatedByManagerId: fallbackOwnerId,
      premiumExplanationText: DEFAULT_PREMIUM_EXPLANATION_TEXT,
      incomeSummaryText: DEFAULT_INCOME_SUMMARY_TEXT,
      incomeDetailText: DEFAULT_INCOME_DETAIL_TEXT,
    },
  });
}

export { getSystemSettings };
