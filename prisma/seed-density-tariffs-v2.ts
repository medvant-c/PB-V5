// Second density-tariff seed pass. Run with: npx tsx prisma/seed-density-tariffs-v2.ts
//
// Two things happen here:
// 1. Deletes any existing "<100" tier (minDensity 0, maxDensity 100) from
//    every category, including the ones seed-tariffs.ts already put in for
//    Одежда/Обувь — the manager's later instruction was explicit that
//    density below 100 kg/m³ is priced by volume (the flat
//    volumeRateUsdPerCbm rate) uniformly across every category, not a
//    per-category $/kg tier. lib/quote-engine.ts now enforces this in code
//    (it never looks up a density tier below 100 kg/m³ at all), so a
//    leftover "<100" row would just be dead data that misleads whoever
//    reads the Тарифы tab into thinking it's still in effect.
// 2. Seeds four new categories from the manager-supplied table: Большой
//    хозяйственный товар, Мелкий хозяйственный товар (real numbers),
//    Электроника (explicitly "такой же как большой хоз" — identical rates),
//    Сборный груз (flat $4/кг regardless of density — one tier, no upper
//    bound).
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/generated/prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaBetterSqlite3({ url: process.env.DESK_DATABASE_URL! }),
});

// [minDensity, maxDensity, ratePerKgUsd] — insertion order doesn't matter
// for lookupDensityRate (it scans all rows for the matching range), written
// ascending here just for readability against the source table.
const LARGE_HOUSEHOLD_TIERS: [number, number | null, number][] = [
  [100, 110, 4.3],
  [110, 120, 4.2],
  [120, 130, 4.1],
  [130, 140, 4.0],
  [140, 150, 3.9],
  [150, 160, 3.8],
  [160, 170, 3.7],
  [170, 180, 3.6],
  [180, 190, 3.5],
  [190, 200, 3.4],
  [200, 250, 3.3],
  [250, 300, 3.2],
  [300, 350, 3.1],
  [350, 400, 3.0],
  [400, 500, 2.9],
  [500, null, 2.8],
];

const SMALL_HOUSEHOLD_TIERS: [number, number | null, number][] = [
  [100, 110, 4.2],
  [110, 120, 4.1],
  [120, 130, 4.0],
  [130, 140, 3.9],
  [140, 150, 3.8],
  [150, 160, 3.7],
  [160, 170, 3.5],
  [170, 180, 3.4],
  [180, 190, 3.3],
  [190, 200, 3.2],
  [200, 250, 3.1],
  [250, 300, 3.0],
  [300, 350, 2.9],
  [350, 400, 2.8],
  [400, 500, 2.7],
  [500, null, 2.6],
];

async function main() {
  const deletedLowTiers = await prisma.densityTariff.deleteMany({
    where: { minDensity: 0, maxDensity: 100 },
  });
  console.log(`Removed ${deletedLowTiers.count} stale "<100" tier row(s) — now handled globally in code.`);

  const categoriesToSeed: [string, string, [number, number | null, number][]][] = [
    ["large_household", "Большой хозяйственный товар", LARGE_HOUSEHOLD_TIERS],
    ["small_household", "Мелкий хозяйственный товар", SMALL_HOUSEHOLD_TIERS],
    ["electronics", "Электроника", LARGE_HOUSEHOLD_TIERS],
    ["consolidated", "Сборный груз", [[0, null, 4.0]]],
  ];

  for (const [categoryKey, categoryLabel, tiers] of categoriesToSeed) {
    const existingCount = await prisma.densityTariff.count({ where: { categoryKey } });
    if (existingCount > 0) {
      console.log(`Skipping ${categoryKey} — already has ${existingCount} tiers.`);
      continue;
    }
    await prisma.densityTariff.createMany({
      data: tiers.map(([minDensity, maxDensity, ratePerKgUsd]) => ({
        categoryKey,
        categoryLabel,
        minDensity,
        maxDensity,
        ratePerKgUsd,
      })),
    });
    console.log(`Seeded ${tiers.length} density tiers for ${categoryKey}.`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
