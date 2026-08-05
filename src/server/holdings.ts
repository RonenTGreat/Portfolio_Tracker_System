/**
 * Holdings and buckets — reads and writes (FR-2), scoped per user.
 *
 * Everything the UI needs about a holding comes from here, so a page and an API
 * route return the same shape from the same query rather than each assembling
 * its own. Server pages call these functions directly; the /api routes wrap
 * them for any other client.
 */

import { db } from "@/lib/db";
import { requireSessionUser } from "@/server/auth";
import type { AssetClass } from "@/generated/prisma/enums";
import type {
  CreateBucketInput,
  UpdateBucketInput,
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
 * Every holding for the user, including retired and aggregate ones.
 */
export async function listAllHoldings(userIdParam?: string): Promise<HoldingDTO[]> {
  const userId = userIdParam ?? (await requireSessionUser()).id;
  const rows = await db.holding.findMany({
    where: { userId },
    select: holdingSelect,
    orderBy: [...HOLDING_ORDER],
  });
  return rows.map(toHoldingDTO);
}

/**
 * The holdings the FR-1 entry form offers: active, and never the aggregates.
 */
export async function listEntryHoldings(userIdParam?: string): Promise<HoldingDTO[]> {
  const userId = userIdParam ?? (await requireSessionUser()).id;
  const rows = await db.holding.findMany({
    where: { userId, isActive: true, isAggregate: false },
    select: holdingSelect,
    orderBy: [...HOLDING_ORDER],
  });
  return rows.map(toHoldingDTO);
}

export async function getHolding(id: string, userIdParam?: string): Promise<HoldingDTO | null> {
  const userId = userIdParam ?? (await requireSessionUser()).id;
  const row = await db.holding.findFirst({
    where: { id, userId },
    select: holdingSelect,
  });
  return row ? toHoldingDTO(row) : null;
}

export async function findHoldingByTicker(
  ticker: string,
  userIdParam?: string,
): Promise<{ id: string } | null> {
  const userId = userIdParam ?? (await requireSessionUser()).id;
  return db.holding.findFirst({ where: { userId, ticker }, select: { id: true } });
}

export async function listBuckets(
  options: { includeArchived?: boolean } = {},
  userIdParam?: string,
): Promise<BucketDTO[]> {
  const userId = userIdParam ?? (await requireSessionUser()).id;
  const rows = await db.bucket.findMany({
    where: {
      userId,
      ...(options.includeArchived ? {} : { archivedAt: null }),
    },
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

export async function findBucketByName(
  name: string,
  userIdParam?: string,
): Promise<{ id: string } | null> {
  const userId = userIdParam ?? (await requireSessionUser()).id;
  return db.bucket.findFirst({
    where: { userId, name: { equals: name, mode: "insensitive" } },
    select: { id: true },
  });
}

export async function createBucket(
  input: CreateBucketInput,
  userIdParam?: string,
): Promise<BucketDTO> {
  const userId = userIdParam ?? (await requireSessionUser()).id;
  const row = await db.bucket.create({
    data: {
      userId,
      name: input.name,
      colorToken: input.colorToken,
      sortOrder: input.sortOrder ?? 0,
    },
    select: {
      id: true,
      name: true,
      colorToken: true,
      sortOrder: true,
      archivedAt: true,
    },
  });

  return {
    id: row.id,
    name: row.name,
    colorToken: row.colorToken,
    sortOrder: row.sortOrder,
    archived: row.archivedAt !== null,
  };
}

export async function getBucket(id: string, userIdParam?: string): Promise<BucketDTO | null> {
  const userId = userIdParam ?? (await requireSessionUser()).id;
  const row = await db.bucket.findFirst({
    where: { id, userId },
    select: {
      id: true,
      name: true,
      colorToken: true,
      sortOrder: true,
      archivedAt: true,
    },
  });

  return row
    ? {
        id: row.id,
        name: row.name,
        colorToken: row.colorToken,
        sortOrder: row.sortOrder,
        archived: row.archivedAt !== null,
      }
    : null;
}

export async function updateBucket(
  id: string,
  input: UpdateBucketInput,
  userIdParam?: string,
): Promise<BucketDTO> {
  const userId = userIdParam ?? (await requireSessionUser()).id;
  const row = await db.bucket.update({
    where: { id, userId_name: undefined },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.colorToken !== undefined && { colorToken: input.colorToken }),
      ...(input.sortOrder !== undefined && { sortOrder: input.sortOrder }),
      ...(input.archived !== undefined && {
        archivedAt: input.archived ? new Date() : null,
      }),
    },
    select: {
      id: true,
      name: true,
      colorToken: true,
      sortOrder: true,
      archivedAt: true,
    },
  });

  return {
    id: row.id,
    name: row.name,
    colorToken: row.colorToken,
    sortOrder: row.sortOrder,
    archived: row.archivedAt !== null,
  };
}

export async function createHolding(
  input: CreateHoldingInput,
  userIdParam?: string,
): Promise<HoldingDTO> {
  const userId = userIdParam ?? (await requireSessionUser()).id;
  const row = await db.holding.create({
    data: {
      userId,
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

export async function updateHolding(
  id: string,
  input: UpdateHoldingInput,
  userIdParam?: string,
): Promise<HoldingDTO> {
  const userId = userIdParam ?? (await requireSessionUser()).id;
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
  userIdParam?: string,
): Promise<HoldingTrendDTO | null> {
  const userId = userIdParam ?? (await requireSessionUser()).id;
  const holdingRow = await db.holding.findFirst({
    where: { userId, ticker },
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
