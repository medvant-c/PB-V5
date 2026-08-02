// One-off seed for Kazakhstan's real cargo tariffs (see PB-V5 chat
// 2026-08-02) — source: "Прайс_Казахстан_Алматы_перевод.docx" (398G
// International Logistics, Гуанчжоу/Иу → Алматы, автодоставка 10–12 дней,
// прайс датирован 08.05.2026). costPerKgUsd/costUsdPerCbm are exactly
// what the document says (наша закупка); ratePerKgUsd/rateUsdPerCbm are
// cost + the owner's confirmed markup: +$1.2/kg for density basis, +$50/m³
// for volume basis — same markup rule already used for Kyrgyzstan.
//
// The source splits by PRODUCT TYPE (metal goods / equipment /general
// goods), not by customs-duty class like Kyrgyzstan's sheet and not by
// Russia's product taxonomy (clothing/shoes/electronics/...) — none of
// these line up, so Kazakhstan gets its own category keys. Metal goods и
// "Оборудование/спорттовары/мебель/материалы/посуда" share one density
// ladder in the source; "Товары общего назначения" has its own, slightly
// different tier boundaries — kept exactly as given, not forced to match.
//
// Idempotent: skips any (destinationCountry, categoryKey, minDensity)
// density tier or (destinationCountry, categoryKey) volume tariff that
// already exists, so it's safe to re-run.
// Run with: npx tsx prisma/seed-kazakhstan-tariffs.ts
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
  volumeCostUsdPerCbm: number;
}

const CATEGORIES: CategorySeed[] = [
  {
    categoryKey: "metal_goods",
    categoryLabel: "Металлоизделия и фурнитура",
    densityTiers: [
      [400, null, 0.7],
      [350, 400, 0.8],
      [300, 350, 0.85],
      [250, 300, 0.9],
      [200, 250, 1.0],
      [180, 200, 1.1],
      [160, 180, 1.15],
      [150, 160, 1.2],
      [140, 150, 1.25],
      [130, 140, 1.3],
      [120, 130, 1.35],
      [110, 120, 1.4],
    ],
    volumeCostUsdPerCbm: 125,
  },
  {
    categoryKey: "equipment_goods",
    categoryLabel: "Оборудование, спорттовары, мебель, материалы, посуда",
    densityTiers: [
      [400, null, 0.6],
      [350, 400, 0.7],
      [300, 350, 0.75],
      [250, 300, 0.8],
      [200, 250, 0.85],
      [180, 200, 0.9],
      [160, 180, 0.95],
      [150, 160, 1.0],
      [140, 150, 1.05],
      [130, 140, 1.1],
      [120, 130, 1.15],
      [110, 120, 1.2],
    ],
    volumeCostUsdPerCbm: 120,
  },
  {
    // Own density boundaries — the source doesn't align this column's
    // tiers with the two above (e.g. 170–180/150–170/130–150/100–130
    // instead of 160–180/150–160/140–150/130–140/120–130/110–120).
    categoryKey: "general_goods",
    categoryLabel: "Товары общего назначения",
    densityTiers: [
      [400, null, 0.9],
      [350, 400, 1.0],
      [300, 350, 1.05],
      [250, 300, 1.1],
      [200, 250, 1.2],
      [180, 200, 1.3],
      [170, 180, 1.35],
      [150, 170, 1.4],
      [130, 150, 1.45],
      [100, 130, 1.5],
    ],
    volumeCostUsdPerCbm: 165,
  },
];

async function main() {
  for (const category of CATEGORIES) {
    for (const [minDensity, maxDensity, costPerKgUsd] of category.densityTiers) {
      const existing = await prisma.densityTariff.findFirst({
        where: { destinationCountry: "kazakhstan", categoryKey: category.categoryKey, minDensity },
      });
      if (existing) {
        console.log(`Skipping density tier ${category.categoryKey} ${minDensity}+ — already exists.`);
        continue;
      }
      const ratePerKgUsd = Number((costPerKgUsd + DENSITY_MARKUP_USD_PER_KG).toFixed(2));
      await prisma.densityTariff.create({
        data: {
          destinationCountry: "kazakhstan",
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

    const existingVolume = await prisma.volumeTariff.findUnique({
      where: { destinationCountry_categoryKey: { destinationCountry: "kazakhstan", categoryKey: category.categoryKey } },
    });
    if (existingVolume) {
      console.log(`Skipping volume tariff ${category.categoryKey} — already exists.`);
      continue;
    }
    const rateUsdPerCbm = category.volumeCostUsdPerCbm + VOLUME_MARKUP_USD_PER_CBM;
    await prisma.volumeTariff.create({
      data: {
        destinationCountry: "kazakhstan",
        categoryKey: category.categoryKey,
        categoryLabel: category.categoryLabel,
        rateUsdPerCbm,
        costUsdPerCbm: category.volumeCostUsdPerCbm,
      },
    });
    console.log(`Created volume tariff ${category.categoryLabel}: cost $${category.volumeCostUsdPerCbm}/m³, rate $${rateUsdPerCbm}/m³.`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
