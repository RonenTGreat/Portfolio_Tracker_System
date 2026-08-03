/**
 * Quarters and their entries — reads and writes (FR-1).
 *
 * Two rules this module exists to hold:
 *
 *  1. Money leaves here as a decimal STRING. Prisma returns Decimal objects,
 *     and `JSON.stringify` turns those into floats — the exact loss
 *     src/lib/money.ts and the Decimal columns exist to prevent. Conversion
 *     happens once, here, via `.toString()`.
 *
 *  2. Dates leave here as `YYYY-MM-DD` strings. A `@db.Date` column comes back
 *     as a Date at UTC midnight, which serialises to an ISO timestamp and then
 *     shifts a day when a client re-parses it in a negative-offset timezone.
 *     Quarters are calendar days, so they travel as calendar strings.
 */

import { db } from "@/lib/db";
import { sumMoney, type MoneyString } from "@/lib/money";
import { parseISODate, toISODate } from "@/lib/quarters";
import type {
  CreateQuarterInput,
  QuarterEntryInput,
  UpdateQuarterInput,
} from "@/lib/validation";

export interface QuarterEntryDTO {
  holdingId: string;
  valueGHS: MoneyString;
}

/** A quarter in the FR-1 history list: date, provenance, total, entry count. */
export interface QuarterSummaryDTO {
  quarterDate: string;
  isPreMigration: boolean;
  /** Exact sum of every entry, computed with sumMoney — never a float add. */
  totalGHS: MoneyString;
  entryCount: number;
  /** §2's stamp tooltip shows "the exact date entered". */
  recordedAt: string;
}

export interface QuarterDetailDTO extends QuarterSummaryDTO {
  entries: QuarterEntryDTO[];
}

/* -------------------------------------------------------------------------- */
/* Reads                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Every quarter, newest first (§6.2: "reverse-chronological").
 *
 * Entries are fetched alongside rather than aggregated in SQL because the total
 * must be summed with sumMoney's exact pesewa arithmetic. Postgres SUM on a
 * Decimal column would also be exact, but it returns a Decimal that has to be
 * stringified anyway, and the entry rows are needed for the count regardless.
 * At ~10 years x ~13 holdings this is a few hundred rows — the NFR's "<2s with
 * up to ~10 years of quarterly data" is not in danger.
 */
export async function listQuarters(): Promise<QuarterSummaryDTO[]> {
  const rows = await db.quarter.findMany({
    orderBy: { quarterDate: "desc" },
    select: {
      quarterDate: true,
      isPreMigration: true,
      createdAt: true,
      entries: { select: { valueGHS: true } },
    },
  });

  return rows.map((row) => ({
    quarterDate: toISODate(row.quarterDate),
    isPreMigration: row.isPreMigration,
    totalGHS: sumMoney(row.entries.map((e) => e.valueGHS.toString())),
    entryCount: row.entries.length,
    recordedAt: row.createdAt.toISOString(),
  }));
}

/** One quarter with its figures — the edit form's initial state. */
export async function getQuarter(
  isoDate: string,
): Promise<QuarterDetailDTO | null> {
  const row = await db.quarter.findUnique({
    where: { quarterDate: parseISODate(isoDate) },
    select: {
      quarterDate: true,
      isPreMigration: true,
      createdAt: true,
      entries: {
        select: { holdingId: true, valueGHS: true },
        orderBy: { holdingId: "asc" },
      },
    },
  });

  if (!row) return null;

  const entries = row.entries.map((e) => ({
    holdingId: e.holdingId,
    valueGHS: e.valueGHS.toString(),
  }));

  return {
    quarterDate: toISODate(row.quarterDate),
    isPreMigration: row.isPreMigration,
    totalGHS: sumMoney(entries.map((e) => e.valueGHS)),
    entryCount: entries.length,
    recordedAt: row.createdAt.toISOString(),
    entries,
  };
}

export async function quarterExists(isoDate: string): Promise<boolean> {
  const found = await db.quarter.findUnique({
    where: { quarterDate: parseISODate(isoDate) },
    select: { quarterDate: true },
  });
  return found !== null;
}

/**
 * Which of the given holding ids don't exist, or aren't eligible for hand entry.
 *
 * Checked before a write so a bad id is a sentence naming the problem rather
 * than a foreign-key violation. Aggregates are excluded for the same reason
 * listEntryHoldings excludes them: recording a bucket total beside the holdings
 * inside it double-counts the bucket (SRS §8).
 */
export async function findIneligibleHoldingIds(
  holdingIds: readonly string[],
): Promise<string[]> {
  if (holdingIds.length === 0) return [];

  const eligible = await db.holding.findMany({
    where: { id: { in: [...holdingIds] }, isAggregate: false },
    select: { id: true },
  });

  const found = new Set(eligible.map((h) => h.id));
  return holdingIds.filter((id) => !found.has(id));
}

/* -------------------------------------------------------------------------- */
/* Writes                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Create a quarter and its entries in one transaction.
 *
 * Atomic on purpose: a half-written quarter renders a wrong total on the
 * dashboard, which is worse than a quarter that isn't there yet — a missing
 * quarter is visibly missing, a wrong total is not.
 *
 * `isPreMigration` is false for anything entered by hand: the flag means
 * "bucket-level figures imported from the spreadsheet" (SRS §8), and a
 * hand-entered quarter is per-holding by construction.
 */
export async function createQuarter(
  input: CreateQuarterInput,
): Promise<QuarterDetailDTO> {
  const quarterDate = parseISODate(input.quarterDate);

  await db.$transaction(async (tx) => {
    await tx.quarter.create({
      data: { quarterDate, isPreMigration: false },
    });
    await tx.quarterEntry.createMany({
      data: input.entries.map((entry) => ({
        quarterDate,
        holdingId: entry.holdingId,
        valueGHS: entry.valueGHS,
      })),
    });
  });

  const created = await getQuarter(input.quarterDate);
  if (!created) {
    // Unreachable: the transaction above committed. Thrown rather than
    // non-null-asserted so a future change that breaks the invariant says so.
    throw new Error(`Quarter ${input.quarterDate} vanished after creation.`);
  }
  return created;
}

/**
 * Replace a quarter's figures with the submitted set.
 *
 * The submitted array is authoritative: a holding absent from it has its entry
 * DELETED. That is what makes a mistaken entry fixable from the same form that
 * created it — the alternative (upsert-only) would leave a figure the user had
 * cleared still sitting in the total, with no way to remove it short of
 * deleting the whole quarter.
 *
 * Delete-then-insert rather than diffing: at ~13 rows the write is trivial, and
 * the alternative is three code paths (insert / update / delete) whose bugs
 * only show up in the total.
 */
export async function replaceQuarterEntries(
  isoDate: string,
  input: UpdateQuarterInput,
): Promise<QuarterDetailDTO> {
  const quarterDate = parseISODate(isoDate);

  await db.$transaction(async (tx) => {
    await tx.quarterEntry.deleteMany({ where: { quarterDate } });
    if (input.entries.length > 0) {
      await tx.quarterEntry.createMany({
        data: input.entries.map((entry: QuarterEntryInput) => ({
          quarterDate,
          holdingId: entry.holdingId,
          valueGHS: entry.valueGHS,
        })),
      });
    }
    // Touch the parent so `updatedAt` reflects the edit — the quarter row is
    // what the history list reads, and a stale timestamp there would misreport
    // when the figures were last changed.
    await tx.quarter.update({
      where: { quarterDate },
      data: { updatedAt: new Date() },
    });
  });

  const updated = await getQuarter(isoDate);
  if (!updated) throw new Error(`Quarter ${isoDate} vanished after update.`);
  return updated;
}

/**
 * Delete a quarter and, by cascade, its entries (schema: onDelete: Cascade).
 * Returns false when there was nothing to delete, so the route can answer 404
 * instead of reporting a success that didn't happen.
 */
export async function deleteQuarter(isoDate: string): Promise<boolean> {
  const quarterDate = parseISODate(isoDate);
  const result = await db.quarter.deleteMany({ where: { quarterDate } });
  return result.count > 0;
}
