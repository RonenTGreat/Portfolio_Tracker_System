import "dotenv/config";
import { defineConfig, env } from "prisma/config";

/**
 * Prisma 7 moves connection configuration out of schema.prisma: the datasource
 * block no longer takes a `url`, and `env()` is resolved here instead. One
 * consequence worth knowing — the CLI reads this file, the running app does
 * not, so the app's connection string is read separately in src/lib/db.ts.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",

  migrations: {
    path: "prisma/migrations",
    seed: "npx tsx prisma/seed.ts",
  },

  datasource: {
    /**
     * Migrations and introspection need a direct connection. If the deployment
     * uses a pooled URL (PgBouncer / Neon pooler), point DIRECT_DATABASE_URL at
     * the unpooled endpoint — DDL over a transaction pooler fails in ways that
     * are tedious to diagnose. Falls back to DATABASE_URL when they're the same.
     */
    url: process.env.DIRECT_DATABASE_URL
      ? env("DIRECT_DATABASE_URL")
      : env("DATABASE_URL"),
  },
});
