// One-off (re-runnable) backfill: reformats every existing Client.phone
// into the same "+7 (XXX) XXX-XX-XX" shape the manager cabinet, the older
// /desk tool, and self-registration now all enforce on save (see
// lib/phone.ts) — otherwise old rows entered "как попало" would keep
// breaking future filtering/export even after new entries got fixed.
// Run with: DESK_DATABASE_URL='file:./desk.db' npx tsx prisma/normalize-phones.ts
//
// Anything that isn't exactly 10 significant digits (e.g. test junk like
// "тест3") is left untouched and printed at the end — normalizePhone
// deliberately refuses to guess at those rather than silently mangling a
// value that might not even be a real phone number.
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/generated/prisma/client";
import { normalizePhone } from "@/lib/phone";

const prisma = new PrismaClient({
  adapter: new PrismaBetterSqlite3({ url: process.env.DESK_DATABASE_URL! }),
});

async function main() {
  const clients = await prisma.client.findMany({
    where: { phone: { not: null } },
    select: { id: true, displayId: true, phone: true },
  });

  let updated = 0;
  const unnormalizable: { displayId: number; phone: string }[] = [];

  for (const client of clients) {
    const phone = client.phone!;
    const normalized = normalizePhone(phone);
    if (!normalized) {
      unnormalizable.push({ displayId: client.displayId, phone });
      continue;
    }
    if (normalized === phone) continue;
    await prisma.client.update({ where: { id: client.id }, data: { phone: normalized } });
    updated++;
    console.log(`№${client.displayId}: "${phone}" -> "${normalized}"`);
  }

  console.log(`\nNormalized ${updated} of ${clients.length} phone numbers.`);
  if (unnormalizable.length > 0) {
    console.log(`\nCouldn't normalize (left untouched — review by hand):`);
    for (const { displayId, phone } of unnormalizable) {
      console.log(`  №${displayId}: "${phone}"`);
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
