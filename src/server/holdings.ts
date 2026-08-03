/**
 * Holdings and buckets — reads and writes (FR-2).
 *
 * Everything the UI needs about a holding comes from here, so a page and an API
 * route return the same shape from the same query rather than each assembling
 * its own. Server pages call these functions directly; the /api routes wrap
 * them for any other client.
 */

import { db } from "@/lib/db";
import type { AssetClass } from "@/generated/prisma/enums";
import type {
  CreateHoldingInput,
  UpdateHoldingInput,
} from "@/lib/validation";

/** A holding as it crosses into a component. No Decimal, no Date. */
export interface HoldingDTO {
  id: string;
  ticker: string;
  displayName: string;
  assetClass: AssetClass;
  bucketId: string;
  bucketName: string;
  bucketColorToken: string;
  notes: string | null;
  isActive: boolean;
  isAggregate: boolean;
  sortOrder: number;
}

export interface BucketDTO {
  id: string;
  name: string;
  colorToken: string;
  sortOrder: number;
  archived: boolean;
}

/**
 * Ordering is fixed here rather than at each call site because it is the order
 * the §6.2 entry form renders in, and two pages disagreeing about it would look
 * like a bug in the data.
 */
const HOLDING_ORDER = [
  { assetClass: "asc" },
  { sortOrder: "asc" },
  { ticker: "asc" },
] as const;

const holdingSelect = {
  id: true,
  ticker: true,
  displayName: true,
  assetClass: true,
  bucketId: true,
  notes: true,
  isActive: true,
  isAggregate: true,
  sortOrder: true,
  bucket: { select: { name: true, colorToken: true } },
} as const;

type HoldingRow = {
  id: string;
  ticker: string;
  displayName: string;
  assetClass: AssetClass;
  bucketId: string;
  notes: string | null;
  isActive: boolean;
  isAggregate: boolean;
  sortOrder: number;
  bucket: { name: string; colorToken: string };
};

function toHoldingDTO(row: HoldingRow): HoldingDTO {
  return {
    id: row.id,
    ticker: row.ticker,
    displayName: row.displayName,
    assetClass: row.assetClass,
    bucketId: row.bucketId,
    bucketName: row.bucket.name,
    bucketColorToken: row.bucket.colorToken,
    notes: row.notes,
    isActive: row.isActive,
    isAggregate: row.isAggregate,
    sortOrder: row.sortOrder,
  };
}

/**
 * Every holding, including retired and aggregate ones.
 *
 * Historical views need these: a quarter recorded two years ago may reference a
 * holding since retired under FR-2, and the pre-migration quarters reference the
 * synthetic aggregates (SRS §8). Omitting them here would silently drop value
 * from those quarters' totals.
 */
export async function listAllHoldings(): Promise<HoldingDTO[]> {
  const rows = await db.holding.findMany({
    select: holdingSelect,
    orderBy: [...HOLDING_ORDER],
  });
  return rows.map(toHoldingDTO);
}

/**
 * The holdings the FR-1 entry form offers: active, and never the aggregates.
 *
 * The aggregates exist only to carry imported bucket-level history (SRS §8);
 * offering them for hand entry would let a user record a bucket total alongside
 * the individual holdings in it and double-count the bucket.
 */
export async function listEntryHoldings(): Promise<HoldingDTO[]> {
  const rows = await db.holding.findMany({
    where: { isActive: true, isAggregate: false },
    select: holdingSelect,
    orderBy: [...HOLDING_ORDER],
  });
  return rows.map(toHoldingDTO);
}

export async function getHolding(id: string): Promise<HoldingDTO | null> {
  const row = await db.holding.findUnique({
    where: { id },
    select: holdingSelect,
  });
  return row ? toHoldingDTO(row) : null;
}

export async function findHoldingByTicker(
  ticker: string,
): Promise<{ id: string } | null> {
  return db.holding.findUnique({ where: { ticker }, select: { id: true } });
}

export async function listBuckets(
  options: { includeArchived?: boolean } = {},
): Promise<BucketDTO[]> {
  const rows = await db.bucket.findMany({
    where: options.includeArchived ? undefined : { archivedAt: null },
    select: {
      id: true,
      name: true,
      colorToken: true,
      sortOrder: true,
      archivedAt: true,
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    colorToken: row.colorToken,
    sortOrder: row.sortOrder,
    archived: row.archivedAt !== null,
  }));
}

export async function createHolding(
  input: CreateHoldingInput,
): Promise<HoldingDTO> {
  const row = await db.holding.create({
    data: {
      ticker: input.ticker,
      displayName: input.displayName,
      assetClass: input.assetClass,
      bucketId: input.bucketId,
      notes: input.notes ?? null,
      sortOrder: input.sortOrder ?? 0,
    },
    select: holdingSelect,
  });
  return toHoldingDTO(row);
}

/**
 * FR-2: name/category edits must not alter historical values. That holds
 * structurally — QuarterEntry references the holding by id and stores its own
 * figure, so nothing here can reach a recorded value. Retiring is the same
 * operation with `isActive: false`, deliberately not a delete: "historical data
 * is preserved".
 */
export async function updateHolding(
  id: string,
  input: UpdateHoldingInput,
): Promise<HoldingDTO> {
  const row = await db.holding.update({
    where: { id },
    data: {
      ...(input.ticker !== undefined && { ticker: input.ticker }),
      ...(input.displayName !== undefined && {
        displayName: input.displayName,
      }),
      ...(input.assetClass !== undefined && { assetClass: input.assetClass }),
      ...(input.bucketId !== undefined && { bucketId: input.bucketId }),
      ...(input.notes !== undefined && { notes: input.notes }),
      ...(input.sortOrder !== undefined && { sortOrder: input.sortOrder }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
    },
    select: holdingSelect,
  });
  return toHoldingDTO(row);
}

/** How many recorded figures a holding has — the check before offering delete. */
export async function countHoldingEntries(id: string): Promise<number> {
  return db.quarterEntry.count({ where: { holdingId: id } });
}

export interface HoldingTrendPointDTO {
  quarterDate: string;
  valueGHS: string;
}

export interface HoldingTrendDTO {
  holding: HoldingDTO;
  series: HoldingTrendPointDTO[];
}

/**
 * Single holding value over time — FR-5.
 */
export async function getHoldingHistory(
  ticker: string,
): Promise<HoldingTrendDTO | null> {
  const holdingRow = await db.holding.findUnique({
    where: { ticker },
    select: holdingSelect,
  });

  if (!holdingRow) return null;

  const entries = await db.quarterEntry.findMany({
    where: { holdingId: holdingRow.id },
    orderBy: { quarterDate: "asc" },
    select: { quarterDate: true, valueGHS: true },
  });

  const series = entries.map((e) => ({
    quarterDate: e.quarterDate.toISOString().slice(0, 10),
    valueGHS: e.valueGHS.toString(),
  }));

  return {
    holding: toHoldingDTO(holdingRow),
    series,
  };
}

