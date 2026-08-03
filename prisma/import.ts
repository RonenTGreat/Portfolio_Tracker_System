/**
 * One-time importer for the spreadsheet's history (SRS §8).
 *
 * Usage:
 *   npx tsx prisma/import.ts path/to/history.csv
 *   npx tsx prisma/import.ts path/to/history.csv --dry-run
 *
 * Expected CSV — first column the quarter end date, one further column per
 * bucket or ticker, header row required:
 *
 *   quarter,ETFs,Mutual Funds,Crypto,Emergency Fund,T-Bills
 *   2025-03-31,12400.00,9800.00,6200.50,1500.00,3000.00
 *   2025-06-30,13100.00,10250.00,9400.75,1500.00,3000.00
 *
 * Column headers are matched against bucket names first, then holding tickers,
 * so the same importer handles both the pre-migration bucket totals and any
 * later per-holding export without a flag to say which is which. A file mixing
 * both is accepted: bucket columns land on that bucket's aggregate holding,
 * ticker columns on the holding itself.
 *
 * Rows are upserted, so re-running a corrected file fixes figures rather than
 * duplicating them. `--dry-run` reports exactly what would change and writes
 * nothing — worth using first, since this touches real financial history.
 */

import { PrismaPg } from "@prisma/adapter-pg";
import { readFile } from "node:fs/promises";
import { PrismaClient } from "../src/generated/prisma/client.js";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env first.");
}

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

/* -------------------------------------------------------------------------- */
/* CSV parsing                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Minimal RFC-4180 reader: quoted fields, escaped quotes, CRLF or LF.
 * Written out rather than pulling in a CSV dependency for one throwaway import
 * — and a quoted field is not optional, since "1,234.00" is exactly the shape a
 * spreadsheet exports GHS figures in.
 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\r") {
      // handled by the \n that follows
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  // Trailing line with no newline terminator.
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

/**
 * Accepts `1234.5`, `1,234.50`, `GHS 1,234.50`, `(500.00)` for negatives, and
 * blank for "not held this quarter". Returns a 2dp decimal string — money never
 * becomes a float on the way in, per src/lib/money.ts.
 *
 * Deliberately strict: an unparseable cell aborts the import rather than being
 * coerced to 0, because a silent zero in a portfolio history is indistinguishable
 * from a real "I sold everything" and would corrupt every QoQ figure after it.
 */
function parseMoney(raw: string): string | null {
  let cleaned = raw.replace(/\s|,|GHS/gi, "").trim();
  if (cleaned === "" || cleaned === "-") return null;

  let negative = false;
  if (cleaned.startsWith("(") && cleaned.endsWith(")")) {
    negative = true;
    cleaned = cleaned.slice(1, -1);
  }
  if (cleaned.startsWith("-")) {
    negative = true;
    cleaned = cleaned.slice(1);
  }

  if (!/^\d+(\.\d+)?$/.test(cleaned)) {
    throw new Error(`Cannot read "${raw}" as a GHS amount`);
  }

  const [whole, frac = ""] = cleaned.split(".");
  const amount = `${whole}.${(frac + "00").slice(0, 2)}`;
  return negative ? `-${amount}` : amount;
}

/** Quarter ends only — the same rule the Quarter_is_quarter_end constraint holds. */
function parseQuarterDate(raw: string): Date {
  const trimmed = raw.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) {
    throw new Error(
      `Quarter must be a YYYY-MM-DD date, got "${raw}". ` +
        `Use the quarter's END date, e.g. 2026-06-30 for Q2 2026.`,
    );
  }

  const [, y, m, d] = match;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  const month = date.getUTCMonth() + 1;

  // Day 0 of the next month is the last day of this one.
  const lastDay = new Date(Date.UTC(Number(y), month, 0)).getUTCDate();
  if (![3, 6, 9, 12].includes(month) || date.getUTCDate() !== lastDay) {
    throw new Error(
      `"${raw}" is not a quarter end. Expected the last day of March, June, ` +
        `September or December (e.g. 2026-06-30).`,
    );
  }

  return date;
}

/* -------------------------------------------------------------------------- */

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const path = args.find((a) => !a.startsWith("--"));

  if (!path) {
    console.error("Usage: npx tsx prisma/import.ts <file.csv> [--dry-run]");
    process.exit(1);
  }

  const rows = parseCsv(await readFile(path, "utf8"));
  if (rows.length < 2) {
    throw new Error("CSV needs a header row and at least one data row.");
  }

  const [header, ...dataRows] = rows;
  const columns = header.slice(1).map((h) => h.trim());

  // --- Resolve every column to a holding id before writing anything ---------
  const buckets = await db.bucket.findMany({ select: { id: true, name: true } });
  const holdings = await db.holding.findMany({
    select: { id: true, ticker: true, isAggregate: true },
  });

  const byTicker = new Map(holdings.map((h) => [h.ticker.toLowerCase(), h]));
  const aggregateByBucket = new Map(
    buckets.map((b) => [
      b.name.toLowerCase(),
      byTicker.get(`agg:${b.name}`.toLowerCase()),
    ]),
  );

  const resolved: { column: string; holdingId: string; aggregate: boolean }[] =
    [];
  const unknown: string[] = [];

  for (const column of columns) {
    const key = column.toLowerCase();
    const aggregate = aggregateByBucket.get(key);
    const holding = byTicker.get(key);

    if (aggregate) {
      resolved.push({ column, holdingId: aggregate.id, aggregate: true });
    } else if (holding) {
      resolved.push({ column, holdingId: holding.id, aggregate: false });
    } else {
      unknown.push(column);
    }
  }

  if (unknown.length > 0) {
    console.error(`Unrecognised column(s): ${unknown.join(", ")}`);
    console.error("\nColumns must match a bucket name or a holding ticker.");
    console.error(`  Buckets: ${buckets.map((b) => b.name).join(", ")}`);
    console.error(
      `  Tickers: ${holdings
        .filter((h) => !h.isAggregate)
        .map((h) => h.ticker)
        .join(", ")}`,
    );
    console.error("\nRun the seed first if this database is empty.");
    process.exit(1);
  }

  // A file whose columns are all buckets is pre-migration history by definition
  // (SRS §8) — flag the quarter so the UI can say so, rather than asking the
  // user to remember which quarters were imported at which granularity.
  const allAggregate = resolved.every((r) => r.aggregate);

  // --- Write ---------------------------------------------------------------
  let quarterCount = 0;
  let entryCount = 0;

  for (const row of dataRows) {
    const quarterDate = parseQuarterDate(row[0]);
    const label = row[0].trim();

    const values: { holdingId: string; column: string; value: string }[] = [];
    for (const [index, target] of resolved.entries()) {
      const cell = row[index + 1] ?? "";
      let value: string | null;
      try {
        value = parseMoney(cell);
      } catch (error) {
        throw new Error(
          `${label}, column "${target.column}": ${(error as Error).message}`,
        );
      }
      if (value === null) continue;
      if (value.startsWith("-")) {
        throw new Error(
          `${label}, column "${target.column}": value is negative (${cell}). ` +
            `A holding cannot be worth less than nothing.`,
        );
      }
      values.push({ holdingId: target.holdingId, column: target.column, value });
    }

    if (dryRun) {
      const total = values.reduce(
        (sum, v) => sum + Math.round(Number(v.value) * 100),
        0,
      );
      console.log(
        `${label}  ${values.length} entries  total GHS ${(total / 100).toFixed(2)}` +
          `${allAggregate ? "  [pre-migration]" : ""}`,
      );
      continue;
    }

    // One transaction per quarter: a partially written quarter would show a
    // wrong total on the dashboard, which is worse than a missing one.
    await db.$transaction(async (tx) => {
      await tx.quarter.upsert({
        where: { quarterDate },
        update: { isPreMigration: allAggregate },
        create: { quarterDate, isPreMigration: allAggregate },
      });

      for (const { holdingId, value } of values) {
        await tx.quarterEntry.upsert({
          where: { quarterDate_holdingId: { quarterDate, holdingId } },
          update: { valueGHS: value },
          create: { quarterDate, holdingId, valueGHS: value },
        });
      }
    });

    quarterCount++;
    entryCount += values.length;
    console.log(`${label}  ${values.length} entries written`);
  }

  if (dryRun) {
    console.log(`\nDry run — nothing written. ${dataRows.length} quarters read.`);
  } else {
    console.log(`\nImported ${entryCount} entries across ${quarterCount} quarters.`);
    if (allAggregate) {
      console.log("Flagged as pre-migration (bucket-level only, SRS §8).");
    }
  }
}

main()
  .then(() => db.$disconnect())
  .catch(async (error) => {
    console.error(`\n${(error as Error).message}`);
    await db.$disconnect();
    process.exit(1);
  });
