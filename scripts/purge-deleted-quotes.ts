// Permanently removes quotes that have sat in «Корзина» (Quote.deletedAt
// set — see app/api/manager-quotes/[id]/route.ts's DELETE handler) for
// more than RETENTION_DAYS. Run daily via cron on the production server:
//   45 3 * * * cd /var/www/PB-V5 && npx tsx scripts/purge-deleted-quotes.ts >> /var/log/pb-v5-purge.log 2>&1
//
// Deliberately SKIPS (leaves soft-deleted indefinitely, never force-purges)
// any quote with real money already tied to it — clientPaymentCashOrderId
// set (confirm-buyout created a cash-ledger entry for it) or any
// QuotePaymentAllocation rows (paid via the "Счёт на выкуп" partial-payment
// flow, see prisma/schema.prisma) — permanently deleting the quote would
// leave that real income orphaned with no way to see what it was actually
// for. Those need a deliberate owner decision, not an automatic purge. See
// PB-V5 chat 2026-08-04.
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/generated/prisma/client";
import { storage } from "@/lib/storage";

const RETENTION_DAYS = 14;

const adapter = new PrismaBetterSqlite3({ url: process.env.DESK_DATABASE_URL ?? "file:./desk.db" });
const prisma = new PrismaClient({ adapter });

async function main() {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);

  const candidates = await prisma.quote.findMany({
    where: { deletedAt: { not: null, lt: cutoff } },
    select: { id: true, displayId: true, clientPaymentCashOrderId: true },
  });

  let purged = 0;
  let skipped = 0;

  for (const quote of candidates) {
    if (quote.clientPaymentCashOrderId) {
      console.log(`[skip] №${quote.displayId} — has a linked CashOrder (real payment), left in trash for manual review.`);
      skipped++;
      continue;
    }
    const allocationCount = await prisma.quotePaymentAllocation.count({ where: { quoteId: quote.id } });
    if (allocationCount > 0) {
      console.log(`[skip] №${quote.displayId} — has ${allocationCount} payment allocation(s), left in trash for manual review.`);
      skipped++;
      continue;
    }

    const photos = await prisma.deskFile.findMany({ where: { tab: "quotes", relatedId: quote.id } });
    for (const photo of photos) {
      try {
        await storage.delete(photo.storageKey);
      } catch (error) {
        console.error(`[warn] №${quote.displayId} — photo cleanup failed`, error);
      }
    }
    await prisma.deskFile.deleteMany({ where: { tab: "quotes", relatedId: quote.id } });
    await prisma.quoteAttachedService.deleteMany({ where: { quoteId: quote.id } });
    await prisma.quote.delete({ where: { id: quote.id } });
    console.log(`[purged] №${quote.displayId}`);
    purged++;
  }

  console.log(`Done: ${purged} purged, ${skipped} skipped (real money attached), ${candidates.length} candidates total.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
