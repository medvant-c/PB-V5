import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// Next.js's own env loading (.env.local) doesn't apply here — this file runs
// standalone via `npx prisma`, so load the same file explicitly.
config({ path: ".env.local" });

// Used by the Prisma CLI (generate/migrate) — Next.js loads .env.local on its
// own for the running app, but this file runs standalone via `npx prisma`.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DESK_DATABASE_URL,
  },
});
