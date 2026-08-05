/**
 * Quarters and their entries — reads and writes (FR-1), scoped per user.
 */

import { db } from "@/lib/db";
import { sumMoney, type MoneyString } from "@/lib/money";
import { parseISODate, toISODate } from "@/lib/quarters";
import { requireSessionUser } from "@/server/auth";
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

export async function listQuarters(userIdParam?: string): Promise<QuarterSummaryDTO[]> {
  const userId = userIdParam ?? (await requireSessionUser()).id;
  const rows = await db.quarter.findMany({
    where: { userId },
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
  userIdParam?: string,
): Promise<QuarterDetailDTO | null> {
  const userId = userIdParam ?? (await requireSessionUser()).id;
  const row = await db.quarter.findFirst({
    where: { userId, quarterDate: parseISODate(isoDate) },
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

export async function quarterExists(isoDate: string, userIdParam?: string): Promise<boolean> {
  const userId = userIdParam ?? (await requireSessionUser()).id;
  const found = await db.quarter.findFirst({
    where: { userId, quarterDate: parseISODate(isoDate) },
    select: { quarterDate: true },
  });
  return found !== null;
}

export async function findIneligibleHoldingIds(
  holdingIds: readonly string[],
  userIdParam?: string,
): Promise<string[]> {
  if (holdingIds.length === 0) return [];
  const userId = userIdParam ?? (await requireSessionUser()).id;

  const eligible = await db.holding.findMany({
    where: { userId, id: { in: [...holdingIds] }, isAggregate: false },
    select: { id: true },
  });

  const found = new Set(eligible.map((h) => h.id));
  return holdingIds.filter((id) => !found.has(id));
}

/* -------------------------------------------------------------------------- */
/* Writes                                                                      */
/* -------------------------------------------------------------------------- */

export async function createQuarter(
  input: CreateQuarterInput,
  userIdParam?: string,
): Promise<QuarterDetailDTO> {
  const userId = userIdParam ?? (await requireSessionUser()).id;
  const quarterDate = parseISODate(input.quarterDate);

  await db.$transaction(async (tx) => {
    const quarter = await tx.quarter.create({
      data: { userId, quarterDate, isPreMigration: false },
    });
    await tx.quarterEntry.createMany({
      data: input.entries.map((entry) => ({
        quarterId: quarter.id,
        quarterDate,
        holdingId: entry.holdingId,
        valueGHS: entry.valueGHS,
      })),
    });
  });

  const created = await getQuarter(input.quarterDate, userId);
  if (!created) {
    throw new Error(`Quarter ${input.quarterDate} vanished after creation.`);
  }
  return created;
}

export async function replaceQuarterEntries(
  isoDate: string,
  input: UpdateQuarterInput,
  userIdParam?: string,
): Promise<QuarterDetailDTO> {
  const userId = userIdParam ?? (await requireSessionUser()).id;
  const quarterDate = parseISODate(isoDate);

  await db.$transaction(async (tx) => {
    const quarter = await tx.quarter.findFirst({
      where: { userId, quarterDate },
      select: { id: true },
    });
    if (!quarter) {
      throw new Error(`Quarter ${isoDate} not found.`);
    }

    await tx.quarterEntry.deleteMany({ where: { quarterId: quarter.id } });
    if (input.entries.length > 0) {
      await tx.quarterEntry.createMany({
        data: input.entries.map((entry: QuarterEntryInput) => ({
          quarterId: quarter.id,
          quarterDate,
          holdingId: entry.holdingId,
          valueGHS: entry.valueGHS,
        })),
      });
    }

    await tx.quarter.update({
      where: { id: quarter.id },
      data: { updatedAt: new Date() },
    });
  });

  const updated = await getQuarter(isoDate, userId);
  if (!updated) throw new Error(`Quarter ${isoDate} vanished after update.`);
  return updated;
}

export async function deleteQuarter(isoDate: string, userIdParam?: string): Promise<boolean> {
  const userId = userIdParam ?? (await requireSessionUser()).id;
  const quarterDate = parseISODate(isoDate);
  const result = await db.quarter.deleteMany({ where: { userId, quarterDate } });
  return result.count > 0;
}
