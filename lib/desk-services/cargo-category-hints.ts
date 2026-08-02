// What products belong to each cargo category — for categories whose
// meaning isn't obvious from the label alone (Kyrgyzstan/Kazakhstan are
// grouped by customs-duty class or broad product type, not by the intuitive
// product names Russia uses). Transcribed from the same supplier price-list
// docs the tariffs themselves were seeded from (see prisma/seed-kyrgyzstan
// -tariffs.ts, prisma/seed-kazakhstan-tariffs.ts). Shown as a hint next to
// the category picker in quote-dialog.tsx so a manager can tell which
// category a product actually falls into.
const CARGO_CATEGORY_HINTS: Record<string, Record<string, string>> = {
  kyrgyzstan: {
    category_1:
      "Мебель, кухонные принадлежности, канцелярия, ткани, велосипеды, зонты, обувная фурнитура, средства личной гигиены, одноразовые товары, крепёж, рабочие перчатки.",
    category_2:
      "Автозапчасти, механические детали, детские товары, спортивный инвентарь, освещение, обои, ручной инструмент, зажигалки, батарейки, игрушки, украшения, постельные принадлежности, товары для ванной, благовония, зубная паста.",
    category_3:
      "Мелкая бытовая техника, электроника и комплектующие, компьютерные комплектующие, музыкальная техника, автомобильные аккумуляторы, электробритвы, газовые плиты, электроинструмент, колонки, электронные замки, LED-светильники, камеры, принтеры, картриджи.",
    regular_goods:
      "Мотоциклы, электровелосипеды, электросамокаты, косметика, аксессуары для телефонов, головные уборы, сумки, товары для животных, часы, очки, кожаные перчатки, ремни, нижнее бельё, меховые изделия.",
  },
  kazakhstan: {
    metal_goods: "Металлоизделия, крепёж, фурнитура.",
    equipment_goods: "Оборудование, спортивный инвентарь, посуда, строительные материалы, мебель.",
    general_goods: "Общая категория — товары, не подходящие под остальные (по умолчанию).",
  },
};

function cargoCategoryHint(country: string, categoryKey: string): string | null {
  return CARGO_CATEGORY_HINTS[country]?.[categoryKey] ?? null;
}

export { cargoCategoryHint };
