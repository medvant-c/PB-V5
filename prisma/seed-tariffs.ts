// One-time (re-runnable) seed: starting values for the "Тарифы" tab so the
// quote calculator has something to compute with on day one. Every number
// here is editable afterwards from the Тарифы tab — this just avoids an
// empty-tariffs error the first time a manager tries to create a quote.
// Run with: npx tsx prisma/seed-tariffs.ts
//
// What's real vs placeholder:
// - Одежда/Обувь density tiers: real numbers from the manager-supplied
//   price list (ascending by density; the "меньше 100" tier was written as
//   "480$" with no decimal comma unlike every other entry in the same list
//   — interpreted as "48,0$" i.e. 48.0, consistent with that list's own
//   one-decimal formatting. Flag to double-check with the source.
// - "Хозтовары/электроника" (A) and "мелкие хозтовары" (B) categories are
//   NOT seeded — the spec referenced an attachment with their base numbers
//   that never actually came through, only a "+1.2$ on top" adjustment.
//   Rather than guess real client-facing pricing, these two categories are
//   left for the manager to add from the Тарифы tab once the real numbers
//   are available.
// - CNY/USD rates, buyout commission %: demo placeholders (matches the
//   existing calculators-tab.tsx CNY_RATE convention) — replace on first
//   real use, same as every other "заполните реальным" constant in this repo.
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/generated/prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaBetterSqlite3({ url: process.env.DESK_DATABASE_URL! }),
});

// [minDensity, maxDensity, ratePerKgUsd] — ascending, matches both Одежда
// and Обувь tables from the spec (identical numbers in both).
const CLOTHING_SHOE_TIERS: [number, number | null, number][] = [
  [0, 100, 48.0],
  [100, 110, 4.6],
  [110, 120, 4.5],
  [120, 130, 4.4],
  [130, 140, 4.3],
  [140, 150, 4.2],
  [150, 160, 4.1],
  [160, 170, 4.0],
  [170, 180, 3.9],
  [180, 190, 3.8],
  [190, 200, 3.7],
  [200, 250, 3.6],
  [250, 300, 3.5],
  [300, null, 3.4],
];

async function main() {
  const owner = await prisma.manager.findFirst({ where: { role: "owner" } });
  if (!owner) {
    throw new Error("No owner Manager found — run seed-managers.ts first.");
  }

  const existingSettings = await prisma.tariffSettings.count();
  if (existingSettings === 0) {
    await prisma.tariffSettings.create({
      data: {
        cnyRateRub: 12.6,
        usdRateRub: 95,
        volumeRateUsdPerCbm: 340,
        buyoutCommissionPercent: 5,
        standardPriceRub: 500,
        expertPriceRub: 1000,
        proPriceRub: 2000,
        createdByManagerId: owner.id,
      },
    });
    console.log("Seeded initial TariffSettings.");
  } else {
    console.log("Skipping TariffSettings — a row already exists.");
  }

  for (const [categoryKey, categoryLabel] of [
    ["clothing", "Одежда"],
    ["shoes", "Обувь"],
  ] as const) {
    const existingCount = await prisma.densityTariff.count({ where: { categoryKey } });
    if (existingCount > 0) {
      console.log(`Skipping ${categoryKey} — already has ${existingCount} tiers.`);
      continue;
    }
    await prisma.densityTariff.createMany({
      data: CLOTHING_SHOE_TIERS.map(([minDensity, maxDensity, ratePerKgUsd]) => ({
        categoryKey,
        categoryLabel,
        minDensity,
        maxDensity,
        ratePerKgUsd,
      })),
    });
    console.log(`Seeded ${CLOTHING_SHOE_TIERS.length} density tiers for ${categoryKey}.`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
