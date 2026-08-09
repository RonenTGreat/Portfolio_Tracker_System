import "dotenv/config";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

/**
 * The Prisma client and pg connection pool singletons.
 *
 * Both the PrismaClient and pg.Pool are cached on globalThis in development mode.
 * This prevents Next.js dev-server hot reloads (HMR) from instantiating new pools
 * and opening new TCP/SSL sockets on every module evaluation.
 */

const globalForDb = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  pool: Pool | undefined;
};

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. Copy .env.example to .env and fill it in.",
  );
}

export const pool: Pool =
  globalForDb.pool ??
  new Pool({
    connectionString,
    max: 10,
  });

const adapter = new PrismaPg(pool as any);

export const db: PrismaClient =
  globalForDb.prisma ??
  new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? ["warn", "error"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.prisma = db;
  globalForDb.pool = pool;
}
