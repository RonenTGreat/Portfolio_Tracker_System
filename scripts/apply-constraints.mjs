/**
 * Applies prisma/constraints.sql — the CHECK constraints Prisma's schema
 * language cannot express.
 *
 * Exists as a script rather than a documented psql one-liner because psql is not
 * installed on a default Windows dev machine (this project's environment) and is
 * not available in a Vercel build at all. `pg` is already a dependency, so this
 * is one less thing to have installed for setup to work.
 *
 *   npm run db:constraints
 *
 * Idempotent: every statement in the file is DROP-then-ADD, so running it after
 * each migration is the intended workflow.
 */

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";

const here = path.dirname(fileURLToPath(import.meta.url));
const sqlPath = path.join(here, "..", "prisma", "constraints.sql");

// Load .env without a hard dependency on dotenv's CLI wiring. Node 20.6+ has
// --env-file, but npm scripts should not need a flag to work.
const { config } = await import("dotenv");
config();

const connectionString =
  process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;

if (!connectionString) {
  console.error("DATABASE_URL is not set. Copy .env.example to .env first.");
  process.exit(1);
}

const sql = await readFile(sqlPath, "utf8");
const client = new pg.Client({ connectionString });

try {
  await client.connect();
  // One transaction: constraints are a set, and a half-applied set is a
  // confusing state to debug later.
  await client.query("BEGIN");
  await client.query(sql);
  await client.query("COMMIT");
  console.log("Constraints applied from prisma/constraints.sql");
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  console.error("Failed to apply constraints:");
  console.error(error.message);
  // A CHECK that fails to apply usually means existing rows violate it — worth
  // naming, since the fix is to correct the data, not to retry.
  if (error.code === "23514") {
    console.error(
      "\nExisting rows violate this constraint. Fix the offending data, " +
        "then re-run.",
    );
  }
  process.exitCode = 1;
} finally {
  await client.end();
}
