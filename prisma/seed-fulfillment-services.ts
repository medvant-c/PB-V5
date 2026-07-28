// One-time (re-runnable) seed: populates the starting Фулфилмент service
// price list so the tab isn't empty on first use. Safe to re-run — skips
// names that already exist instead of duplicating.
// Run with: npx tsx prisma/seed-fulfillment-services.ts
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/generated/prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaBetterSqlite3({ url: process.env.DESK_DATABASE_URL! }),
});

const SERVICES: { name: string; priceRub: number }[] = [
  { name: "Приёмка", priceRub: 5 },
  { name: "Сортировка", priceRub: 10 },
  { name: "Проверка на брак", priceRub: 15 },
  { name: "Маркировка стикер", priceRub: 6 },
  { name: "Маркировка 2 стикера", priceRub: 10 },
  { name: "Маркировка ЧЗ", priceRub: 9 },
  { name: "Маркировка 2 ЧЗ", priceRub: 14 },
];

async function main() {
  for (const service of SERVICES) {
    const existing = await prisma.fulfillmentServiceItem.findFirst({ where: { name: service.name } });
    if (existing) {
      console.log(`Skipping "${service.name}" — already exists.`);
      continue;
    }
    await prisma.fulfillmentServiceItem.create({ data: service });
    console.log(`Created "${service.name}" — ${service.priceRub}₽.`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
