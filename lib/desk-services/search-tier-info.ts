// What each "Поиск товара" tier actually includes — the manager's exact
// wording. Shared between the manager-facing tooltip in quote-dialog.tsx
// and the client-facing PDF (clients should know what they're paying the
// search-service fee for, not just see a number).
interface SearchTierInfo {
  label: string;
  intro: string | null;
  bullets: string[];
}

const SEARCH_TIER_INFO: Record<"standard" | "expert" | "pro", SearchTierInfo> = {
  standard: {
    label: "Standart",
    intro: null,
    bullets: [
      "Товар массовый, есть у многих продавцов и фабрик",
      "Нужно проверить актуальность предложения",
      "Предоставление основных характеристик товара",
    ],
  },
  expert: {
    label: "Expert",
    intro: "Включает услуги тарифа Standart, а также:",
    bullets: [
      "Проведение переговоров с поставщиком",
      "Уточнение характеристик товара",
      "Запрос фото и видео товара",
      "Уточнение веса и габаритов",
      "Запрос информации об упаковке",
      "Уточнение сроков изготовления",
    ],
  },
  pro: {
    label: "Pro",
    intro: "Включает услуги тарифа Expert, а также:",
    bullets: [
      "Поиск альтернативных производителей",
      "Сравнение нескольких предложений",
      "Поиск товара по индивидуальному техническому заданию",
      "Поиск производителей для контрактного производства (OEM/ODM)",
      "Подготовка рекомендаций по выбору поставщика",
    ],
  },
};

export { SEARCH_TIER_INFO };
export type { SearchTierInfo };
