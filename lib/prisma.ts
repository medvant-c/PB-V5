import "server-only";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/generated/prisma/client";

function createPrismaClient() {
  const url = process.env.DESK_DATABASE_URL;
  if (!url) {
    throw new Error("DESK_DATABASE_URL is not set");
  }
  return new PrismaClient({ adapter: new PrismaBetterSqlite3({ url }) });
}

// Standard Next.js dev-mode singleton — without this, hot-reload would spin
// up a fresh PrismaClient (and a fresh SQLite connection) on every edit.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export { prisma };
