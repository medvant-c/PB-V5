// One-time (re-runnable) migration: introduces СЧЕТА (CashAccount) into the
// existing Касса ledger. Creates "Александр" and "Антон", then backfills
// every pre-existing CashOrder/CashOpeningBalance row (which predates the
// concept of an account) onto "Александр" — that's the account users asked
// to keep the existing history on. Safe to re-run: only touches rows whose
// accountId is still NULL, via raw SQL (never resets an already-assigned/
// manually-corrected row back to Александр). Run with:
//   npx tsx prisma/migrate-cash-accounts.ts
//
// Deliberately raw SQL rather than `prisma.cashOrder.updateMany({ where:
// { accountId: null }, ... })` — this script has to run BEFORE accountId
// becomes a required column (see schema.prisma's own note: push with it
// optional, run this, THEN push again with it required), and Prisma's
// generated `where` type for a required field doesn't accept `null` at
// all — a typed query here would only type-check in one of those two
// schema states, not both. Raw SQL isn't checked against the schema either
// way. See PB-V5 chat 2026-08-08.
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/generated/prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaBetterSqlite3({ url: process.env.DESK_DATABASE_URL! }),
});

async function main() {
  const alexander = await prisma.cashAccount.upsert({
    where: { name: "Александр" },
    update: {},
    create: { name: "Александр", sortOrder: 0 },
  });
  const anton = await prisma.cashAccount.upsert({
    where: { name: "Антон" },
    update: {},
    create: { name: "Антон", sortOrder: 1 },
  });
  console.log(`Счета готовы: Александр=${alexander.id}, Антон=${anton.id}`);

  const ordersUpdated = await prisma.$executeRawUnsafe(
    `UPDATE "CashOrder" SET "accountId" = ? WHERE "accountId" IS NULL`,
    alexander.id,
  );
  console.log(`Перенесено на Александра: ${ordersUpdated} ордер(ов)`);

  const balancesUpdated = await prisma.$executeRawUnsafe(
    `UPDATE "CashOpeningBalance" SET "accountId" = ? WHERE "accountId" IS NULL`,
    alexander.id,
  );
  console.log(`Перенесено на Александра: ${balancesUpdated} строка(и) начального остатка`);
}

main()
  .catch((err) => {
    console.error("FAILED:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
