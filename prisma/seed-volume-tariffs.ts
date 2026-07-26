// Seeds the six "по объёму" ($/m³) category rates — same categories as
// DensityTariff, but VolumeTariff is one flat row per category (no density
// tiers). Idempotent: skips any category that already has a row, so it's
// safe to re-run after the owner has tuned rates by hand.
// Run with: npx tsx prisma/seed-volume-tariffs.ts
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/generated/prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaBetterSqlite3({ url: process.env.DESK_DATABASE_URL! }),
});

// [categoryKey, categoryLabel, rateUsdPerCbm, costUsdPerCbm] — cost here is
// rate minus the $50/m³ default margin (owner-confirmed for every category
// except small_household, which quotes $330 instead of the usual $340).
const VOLUME_TARIFFS: [string, string, number, number][] = [
  ["small_household", "Мелкий хозяйственный товар", 330, 280],
  ["large_household", "Большой хозяйственный товар", 340, 290],
  ["electronics", "Электроника", 340, 290],
  ["clothing", "Одежда", 340, 290],
  ["shoes", "Обувь", 340, 290],
  ["consolidated", "Сборный груз", 340, 290],
];

async function main() {
  for (const [categoryKey, categoryLabel, rateUsdPerCbm, costUsdPerCbm] of VOLUME_TARIFFS) {
    const existing = await prisma.volumeTariff.findUnique({ where: { categoryKey } });
    if (existing) {
      console.log(`Skipping ${categoryKey} — already has a volume tariff.`);
      continue;
    }
    await prisma.volumeTariff.create({
      data: { categoryKey, categoryLabel, rateUsdPerCbm, costUsdPerCbm },
    });
    console.log(`Created volume tariff for ${categoryLabel}: $${rateUsdPerCbm}/m³.`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
