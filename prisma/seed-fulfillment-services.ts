// One-time (re-runnable) seed: populates the starting Фулфилмент service
// price list so the tab isn't empty on first use. Safe to re-run — skips
// names that already exist instead of duplicating.
// Run with: npx tsx prisma/seed-fulfillment-services.ts
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/generated/prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaBetterSqlite3({ url: process.env.DESK_DATABASE_URL! }),
});

// ¥-цены — грубая оценка (курс ~13₽/¥ на момент, когда были заведены
// исходные ₽-цены ниже), это лишь начальное заполнение прайс-листа,
// который менеджер и так правит вручную. См. PB-V5 chat 2026-09-11.
const SERVICES: { name: string; priceCny: number; priceRub: number }[] = [
  { name: "Приёмка", priceCny: 0.38, priceRub: 5 },
  { name: "Сортировка", priceCny: 0.77, priceRub: 10 },
  { name: "Проверка на брак", priceCny: 1.15, priceRub: 15 },
  { name: "Маркировка стикер", priceCny: 0.46, priceRub: 6 },
  { name: "Маркировка 2 стикера", priceCny: 0.77, priceRub: 10 },
  { name: "Маркировка ЧЗ", priceCny: 0.69, priceRub: 9 },
  { name: "Маркировка 2 ЧЗ", priceCny: 1.08, priceRub: 14 },
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
