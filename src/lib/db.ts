import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

/**
 * The Prisma client singleton.
 *
 * Two things Prisma 7 changed that shape this file:
 *
 *  1. A driver adapter is required — `new PrismaClient()` with no adapter throws.
 *     Postgres means `@prisma/adapter-pg`, constructed with the connection
 *     string directly (prisma.config.ts is read by the CLI, not by the app).
 *
 *  2. The generated client is imported from its `output` path, not from
 *     `@prisma/client`.
 *
 * The global cache is the standard Next.js dev-server workaround: every hot
 * reload re-evaluates this module, and without it each reload opens a new pool
 * until Postgres refuses connections. Guarded to development so production gets
 * exactly one client per process and no global leak.
 */

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;

  // Fail loudly at startup rather than on the first query, where the error
  // surfaces as an opaque adapter failure inside a page render.
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env and fill it in.",
    );
  }

  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
    // Queries are noisy in the terminal and useful only when debugging; warnings
    // and errors are always worth seeing.
    log:
      process.env.NODE_ENV === "development"
        ? ["warn", "error"]
        : ["error"],
  });
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const db: PrismaClient = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
