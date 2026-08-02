// One-off seed for Kyrgyzstan's real cargo tariffs (see PB-V5 chat
// 2026-08-02) — source: "Прайс_Бишкек_перевод_русский.docx" (Guangzhou
// Hongji International Logistics, действует с 07.03.2026), 10–12 days.
// costPerKgUsd/costUsdPerCbm are exactly what the document says (наша
// закупка); ratePerKgUsd/rateUsdPerCbm are cost + the owner's confirmed
// markup: +$1.2/kg for density-basis, +$50/m³ for volume-basis.
//
// Категория 1/2/3/Обычные товары are the source doc's own customs-duty
// classes — deliberately NOT mapped onto Russia's product-type categories
// (clothing/shoes/electronics/...), which mean something different and
// don't line up 1:1. Одежда and Обувь DO get their own line in the source
// (a separate special-rate table for Одежда, a dedicated column for
// Обувь), so those reuse the same categoryKey Russia already uses.
//
// Idempotent: skips any (destinationCountry, categoryKey, minDensity)
// density tier or (destinationCountry, categoryKey) volume tariff that
// already exists, so it's safe to re-run.
// Run with: npx tsx prisma/seed-kyrgyzstan-tariffs.ts
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/generated/prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaBetterSqlite3({ url: process.env.DESK_DATABASE_URL! }),
});

const DENSITY_MARKUP_USD_PER_KG = 1.2;
const VOLUME_MARKUP_USD_PER_CBM = 50;

// [minDensity, maxDensity, costPerKgUsd]
type DensityRow = [number, number | null, number];

interface CategorySeed {
  categoryKey: string;
  categoryLabel: string;
  densityTiers: DensityRow[];
  // Cost per m³ for density < 100 (the source doc's own "Менее 100" row,
  // priced по объёму) — null when the source gives no rate at all for
  // this category at that density.
  volumeCostUsdPerCbm: number | null;
}

const CATEGORIES: CategorySeed[] = [
  {
    categoryKey: "category_1",
    categoryLabel: "Категория 1 (низкая пошлина)",
    densityTiers: [
      [600, null, 0.8],
      [400, 600, 0.9],
      [300, 400, 1.0],
      [200, 300, 1.1],
      [180, 200, 1.2],
      [160, 180, 1.3],
      [140, 160, 1.4],
      [120, 140, 1.5],
      [100, 120, 1.6],
    ],
    volumeCostUsdPerCbm: 160,
  },
  {
    categoryKey: "category_2",
    categoryLabel: "Категория 2",
    densityTiers: [
      [600, null, 0.9],
      [400, 600, 1.0],
      [300, 400, 1.1],
      [200, 300, 1.2],
      [180, 200, 1.3],
      [160, 180, 1.4],
      [140, 160, 1.5],
      [120, 140, 1.6],
      [100, 120, 1.7],
    ],
    volumeCostUsdPerCbm: 170,
  },
  {
    categoryKey: "category_3",
    categoryLabel: "Категория 3",
    densityTiers: [
      [600, null, 1.1],
      [400, 600, 1.2],
      [300, 400, 1.3],
      [200, 300, 1.4],
      [180, 200, 1.5],
      [160, 180, 1.6],
      [140, 160, 1.7],
      [120, 140, 1.8],
      [100, 120, 1.9],
    ],
    volumeCostUsdPerCbm: 190,
  },
  {
    categoryKey: "regular_goods",
    categoryLabel: "Обычные товары",
    densityTiers: [
      [600, null, 1.5],
      [400, 600, 1.6],
      [300, 400, 1.7],
      [200, 300, 1.8],
      [180, 200, 1.9],
      [160, 180, 2.0],
      [140, 160, 2.1],
      [120, 140, 2.2],
      [100, 120, 2.3],
    ],
    volumeCostUsdPerCbm: 230,
  },
  {
    // No source rate above 200 kg/m³ (the document leaves those cells
    // blank for Обувь) — only the tiers actually given are seeded.
    categoryKey: "shoes",
    categoryLabel: "Обувь",
    densityTiers: [
      [200, 300, 1.4],
      [180, 200, 1.5],
      [160, 180, 1.6],
      [140, 160, 1.7],
      [120, 140, 1.8],
      [100, 120, 1.9],
    ],
    volumeCostUsdPerCbm: 190,
  },
  {
    // Одежда gets its own special rate table in the source (separate from
    // the "Дополнительные условия" section, coarser tiers than the main
    // table). The source gives no <100 kg/m³ rate for clothing
    // specifically — falls back to Обычные товары's $230/m³ per the
    // owner's own call (2026-08-02).
    categoryKey: "clothing",
    categoryLabel: "Одежда",
    densityTiers: [
      [200, null, 2.35],
      [180, 200, 2.4],
      [150, 180, 2.45],
      [100, 150, 2.5],
    ],
    volumeCostUsdPerCbm: 230,
  },
];

async function main() {
  for (const category of CATEGORIES) {
    for (const [minDensity, maxDensity, costPerKgUsd] of category.densityTiers) {
      const existing = await prisma.densityTariff.findFirst({
        where: { destinationCountry: "kyrgyzstan", categoryKey: category.categoryKey, minDensity },
      });
      if (existing) {
        console.log(`Skipping density tier ${category.categoryKey} ${minDensity}+ — already exists.`);
        continue;
      }
      const ratePerKgUsd = Number((costPerKgUsd + DENSITY_MARKUP_USD_PER_KG).toFixed(2));
      await prisma.densityTariff.create({
        data: {
          destinationCountry: "kyrgyzstan",
          categoryKey: category.categoryKey,
          categoryLabel: category.categoryLabel,
          minDensity,
          maxDensity,
          ratePerKgUsd,
          costPerKgUsd,
        },
      });
      console.log(
        `Created density tier ${category.categoryLabel} [${minDensity}, ${maxDensity ?? "∞"}): cost $${costPerKgUsd}/kg, rate $${ratePerKgUsd}/kg.`,
      );
    }

    if (category.volumeCostUsdPerCbm !== null) {
      const existing = await prisma.volumeTariff.findUnique({
        where: { destinationCountry_categoryKey: { destinationCountry: "kyrgyzstan", categoryKey: category.categoryKey } },
      });
      if (existing) {
        console.log(`Skipping volume tariff ${category.categoryKey} — already exists.`);
        continue;
      }
      const rateUsdPerCbm = category.volumeCostUsdPerCbm + VOLUME_MARKUP_USD_PER_CBM;
      await prisma.volumeTariff.create({
        data: {
          destinationCountry: "kyrgyzstan",
          categoryKey: category.categoryKey,
          categoryLabel: category.categoryLabel,
          rateUsdPerCbm,
          costUsdPerCbm: category.volumeCostUsdPerCbm,
        },
      });
      console.log(`Created volume tariff ${category.categoryLabel}: cost $${category.volumeCostUsdPerCbm}/m³, rate $${rateUsdPerCbm}/m³.`);
    }
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
