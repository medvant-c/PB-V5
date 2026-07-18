// One-time (re-runnable) seed: populates ServiceCatalogItem from the site's
// real pricing data (data/pricing.ts) so the desk's "add order" dropdown
// starts with the actual service list instead of empty. Safe to re-run —
// skips directions that already have catalog items instead of duplicating.
// Run with: npx tsx prisma/seed-service-catalog.ts
import { pricing } from "@/data/pricing";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/generated/prisma/client";

// Standalone client (not lib/prisma.ts) — that file has a "server-only"
// guard that throws outside of Next.js's own module graph, which this
// script (run via `npx tsx`) isn't part of. Same reason DIRECTION_CODE_PREFIX
// is duplicated here rather than imported from lib/display-ids.ts.
const prisma = new PrismaClient({
  adapter: new PrismaBetterSqlite3({ url: process.env.DESK_DATABASE_URL! }),
});

const DIRECTION_CODE_PREFIX: Record<string, string> = {
  start: "ST",
  business: "BU",
  factory: "FA",
  logistics: "LO",
  fulfillment: "FU",
  ai: "AI",
  academy: "AC",
};

async function main() {
  for (const direction of pricing) {
    const existingCount = await prisma.serviceCatalogItem.count({
      where: { direction: direction.id as never },
    });
    if (existingCount > 0) {
      console.log(`Skipping ${direction.id} — already has ${existingCount} catalog items.`);
      continue;
    }

    const items = direction.categories.flatMap((category) => category.items);
    const prefix = DIRECTION_CODE_PREFIX[direction.id];
    await prisma.serviceCatalogItem.createMany({
      data: items.map((item, index) => ({
        code: `${prefix}-${String(index + 1).padStart(3, "0")}`,
        direction: direction.id as never,
        name: item.service,
        price: item.price,
      })),
    });
    console.log(`Seeded ${items.length} services for ${direction.id}.`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
