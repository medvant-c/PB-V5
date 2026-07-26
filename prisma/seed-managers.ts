// One-time (re-runnable) seed: creates the owner's own Manager row so
// Anton can log into /desk/manager immediately, without waiting on an
// activation email. Safe to re-run — skips if a Manager with this email
// already exists. Run with: npx tsx prisma/seed-managers.ts
import { randomBytes, scryptSync } from "crypto";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/generated/prisma/client";

// Standalone client + inlined password hashing (not lib/prisma.ts /
// lib/password.ts) — both have a "server-only" guard that throws outside of
// Next.js's own module graph, which this script (run via `npx tsx`) isn't
// part of. Same reasoning already established in seed-service-catalog.ts
// for DIRECTION_CODE_PREFIX.
const prisma = new PrismaClient({
  adapter: new PrismaBetterSqlite3({ url: process.env.DESK_DATABASE_URL! }),
});

const KEY_LENGTH = 64;

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, KEY_LENGTH).toString("hex");
  return `${salt}:${hash}`;
}

// Owner's real login email (changed from the original info@panda-bridges.com
// stopgap address) — kept in sync here so re-seeding a fresh database
// creates the owner with the email actually in use, not the old one.
const OWNER_EMAIL = "medvant@gmail.com";
const OWNER_NAME = "Антон";
// Never hardcode a real login password in a committed file — reuses the
// same DESK_MANAGER_PASSWORD env var every deploy's .env.local already
// carries (originally the old /desk shared-tool password), so this script
// needs no new secret wired up anywhere.
if (!process.env.DESK_MANAGER_PASSWORD) {
  throw new Error("DESK_MANAGER_PASSWORD is not set — required to seed the owner Manager account.");
}
const OWNER_PASSWORD: string = process.env.DESK_MANAGER_PASSWORD;

async function nextManagerDisplayId(): Promise<number> {
  const last = await prisma.manager.findFirst({ orderBy: { displayId: "desc" } });
  return (last?.displayId ?? 0) + 1;
}

async function main() {
  const existing = await prisma.manager.findUnique({ where: { email: OWNER_EMAIL } });
  if (existing) {
    console.log(`Skipping — manager ${OWNER_EMAIL} already exists (id ${existing.id}).`);
    return;
  }

  const manager = await prisma.manager.create({
    data: {
      displayId: await nextManagerDisplayId(),
      email: OWNER_EMAIL,
      name: OWNER_NAME,
      role: "owner",
      passwordHash: hashPassword(OWNER_PASSWORD),
    },
  });
  console.log(`Created owner Manager ${manager.name} <${manager.email}> (id ${manager.id}).`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
