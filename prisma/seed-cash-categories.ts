// One-time (re-runnable) seed: populates the starting "статьи" for the
// owner's cash ledger (Отчёты по дням) so the tab isn't empty on first use.
// Safe to re-run — skips names that already exist instead of duplicating.
// Run with: npx tsx prisma/seed-cash-categories.ts
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/generated/prisma/client";

// Standalone client (not lib/prisma.ts) — that file has a "server-only"
// guard that throws outside of Next.js's own module graph, which this
// script (run via `npx tsx`) isn't part of. Same pattern as the other
// prisma/seed-*.ts scripts.
const prisma = new PrismaClient({
  adapter: new PrismaBetterSqlite3({ url: process.env.DESK_DATABASE_URL! }),
});

const INCOME_CATEGORIES = [
  "Приход на услуги от клиента по выкупу",
  "Приход комиссия",
  "Приход фулфилмент",
  "Приход карго",
];

const EXPENSE_CATEGORIES = ["Выплата Саше", "Выплата Владу", "Выплата менеджеру", "Закупка товара"];

async function seed(type: "income" | "expense", names: string[]) {
  for (const name of names) {
    const existing = await prisma.cashCategory.findUnique({ where: { type_name: { type, name } } });
    if (existing) {
      console.log(`Skipping "${name}" (${type}) — already exists.`);
      continue;
    }
    await prisma.cashCategory.create({ data: { type, name } });
    console.log(`Created "${name}" (${type}).`);
  }
}

async function main() {
  await seed("income", INCOME_CATEGORIES);
  await seed("expense", EXPENSE_CATEGORIES);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
