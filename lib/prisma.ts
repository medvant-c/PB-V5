import "server-only";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/generated/prisma/client";

function createPrismaClient() {
  const url = process.env.DESK_DATABASE_URL;
  if (!url) {
    throw new Error("DESK_DATABASE_URL is not set");
  }
  const client = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url }) });
  // По умолчанию SQLite использует journal_mode=delete — читатели и
  // писатель блокируют друг друга. При нескольких открытых вкладках
  // менеджеров (а «Клиенты» сама по себе шлёт ~9 запросов на каждое
  // открытие/действие) это реальная причина ощутимых подвисаний — не
  // размер таблиц (они крошечные), а конкуренция за блокировку. WAL даёт
  // читателям работать параллельно с одним писателем. busy_timeout —
  // подстраховка сверху: конфликт блокировки ждёт до 5с и повторяет
  // попытку, вместо мгновенного падения (SQLITE_BUSY -> Prisma P1008).
  // journal_mode персистентен в самом файле БД, busy_timeout — нет
  // (привязан к соединению), поэтому обе PRAGMA выставляются на каждом
  // старте процесса. См. PB-V5 chat 2026-08-07.
  client.$executeRawUnsafe("PRAGMA journal_mode = WAL;").catch((err) => console.error("Failed to enable WAL mode:", err));
  client.$executeRawUnsafe("PRAGMA busy_timeout = 5000;").catch((err) => console.error("Failed to set busy_timeout:", err));
  return client;
}

// Standard Next.js dev-mode singleton — without this, hot-reload would spin
// up a fresh PrismaClient (and a fresh SQLite connection) on every edit.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export { prisma };
