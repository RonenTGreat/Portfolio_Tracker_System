/**
 * Quarter-over-quarter comparison (FR-6) and target-vs-actual across time
 * (FR-7), scoped per user.
 */

import { db } from "@/lib/db";
import {
  pctChange,
  pctOfTotal,
  subMoney,
  sumMoney,
  type MoneyString,
} from "@/lib/money";
import { parseISODate, toISODate } from "@/lib/quarters";
import { requireSessionUser } from "@/server/auth";

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

/** A quarter the selector can offer. */
export interface QuarterOptionDTO {
  quarterDate: string;
  isPreMigration: boolean;
  totalGHS: MoneyString;
}

/** One row of the FR-6 delta table, at either level. */
export interface DeltaRowDTO {
  id: string;
  label: string;
  sublabel: string | null;
  bucketId: string;
  bucketName: string;
  colorToken: string;
  valueA: MoneyString;
  valueB: MoneyString;
  deltaGHS: MoneyString;
  pctChange: number | null;
  onlyInA: boolean;
  onlyInB: boolean;
  isAggregate: boolean;
}

/** One quarter's side of the comparison: the pie's data and its total. */
export interface ComparisonSideDTO {
  quarterDate: string;
  isPreMigration: boolean;
  totalGHS: MoneyString;
  buckets: {
    bucketId: string;
    name: string;
    colorToken: string;
    sortOrder: number;
    valueGHS: MoneyString;
    pct: number;
  }[];
}

export interface ComparisonDTO {
  a: ComparisonSideDTO;
  b: ComparisonSideDTO;
  totalDeltaGHS: MoneyString;
  totalPctChange: number | null;
  byHolding: DeltaRowDTO[];
  byBucket: DeltaRowDTO[];
  holdingLevelIncomplete: boolean;
}

/** One bucket's variance from target in one quarter — the FR-7 drift series. */
export interface DriftPointDTO {
  quarterDate: string;
  byBucket: Record<string, number>;
}

/** A bucket's actual and target share in the selected quarter (FR-7 pies). */
export interface TargetVsActualRowDTO {
  bucketId: string;
  name: string;
  colorToken: string;
  sortOrder: number;
  valueGHS: MoneyString;
  actualPct: number;
  targetPct: number | null;
  variancePP: number | null;
}

export interface DriftDTO {
  quarterDate: string;
  isPreMigration: boolean;
  totalGHS: MoneyString;
  rows: TargetVsActualRowDTO[];
  series: DriftPointDTO[];
  buckets: { id: string; name: string; colorToken: string; sortOrder: number }[];
  targetTotalPct: number | null;
}

/* -------------------------------------------------------------------------- */
/* Shared internals                                                            */
/* -------------------------------------------------------------------------- */

interface HoldingMeta {
  id: string;
  ticker: string;
  displayName: string;
  bucketId: string;
  isAggregate: boolean;
  bucket: {
    id: string;
    name: string;
    colorToken: string;
    sortOrder: number;
  };
}

async function loadHoldingMeta(userId: string): Promise<Map<string, HoldingMeta>> {
  const rows = await db.holding.findMany({
    where: { userId },
    select: {
      id: true,
      ticker: true,
      displayName: true,
      bucketId: true,
      isAggregate: true,
      bucket: {
        select: { id: true, name: true, colorToken: true, sortOrder: true },
      },
    },
  });
  return new Map(rows.map((row) => [row.id, row]));
}

interface QuarterSnapshot {
  quarterDate: string;
  isPreMigration: boolean;
  totalGHS: MoneyString;
  byHolding: Map<string, MoneyString>;
  byBucket: Map<string, MoneyString>;
}

function snapshot(
  quarter: {
    quarterDate: Date;
    isPreMigration: boolean;
    entries: { holdingId: string; valueGHS: { toString(): string } }[];
  },
  holdings: Map<string, HoldingMeta>,
): QuarterSnapshot {
  const byHolding = new Map<string, MoneyString>();
  const bucketValues = new Map<string, MoneyString[]>();

  for (const entry of quarter.entries) {
    const value = entry.valueGHS.toString();
    const holding = holdings.get(entry.holdingId);
    if (!holding) continue;

    byHolding.set(
      entry.holdingId,
      byHolding.has(entry.holdingId)
        ? sumMoney([byHolding.get(entry.holdingId)!, value])
        : value,
    );
    const list = bucketValues.get(holding.bucketId) ?? [];
    list.push(value);
    bucketValues.set(holding.bucketId, list);
  }

  const byBucket = new Map<string, MoneyString>();
  for (const [bucketId, values] of bucketValues) {
    byBucket.set(bucketId, sumMoney(values));
  }

  return {
    quarterDate: toISODate(quarter.quarterDate),
    isPreMigration: quarter.isPreMigration,
    totalGHS: sumMoney(quarter.entries.map((e) => e.valueGHS.toString())),
    byHolding,
    byBucket,
  };
}

async function effectiveBucketTargets(
  date: Date,
  userId: string,
): Promise<Map<string, number>> {
  const rows = await db.targetAllocation.findMany({
    where: { userId, bucketId: { not: null }, effectiveFrom: { lte: date } },
    select: { bucketId: true, targetPct: true, effectiveFrom: true },
    orderBy: { effectiveFrom: "desc" },
  });

  const latest = new Map<string, number>();
  for (const row of rows) {
    if (row.bucketId && !latest.has(row.bucketId)) {
      latest.set(row.bucketId, Number(row.targetPct.toString()));
    }
  }
  return latest;
}

function sideFrom(
  snap: QuarterSnapshot,
  holdings: Map<string, HoldingMeta>,
): ComparisonSideDTO {
  const bucketMeta = new Map<string, HoldingMeta["bucket"]>();
  for (const holding of holdings.values()) {
    bucketMeta.set(holding.bucketId, holding.bucket);
  }

  const buckets = [...snap.byBucket.entries()]
    .map(([bucketId, valueGHS]) => {
      const meta = bucketMeta.get(bucketId);
      return {
        bucketId,
        name: meta?.name ?? "Unassigned",
        colorToken: meta?.colorToken ?? "--color-ink-soft",
        sortOrder: meta?.sortOrder ?? 999,
        valueGHS,
        pct: pctOfTotal(valueGHS, snap.totalGHS),
      };
    })
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

  return {
    quarterDate: snap.quarterDate,
    isPreMigration: snap.isPreMigration,
    totalGHS: snap.totalGHS,
    buckets,
  };
}

/* -------------------------------------------------------------------------- */
/* Reads                                                                       */
/* -------------------------------------------------------------------------- */

export async function listQuarterOptions(userIdParam?: string): Promise<QuarterOptionDTO[]> {
  const userId = userIdParam ?? (await requireSessionUser()).id;
  const rows = await db.quarter.findMany({
    where: { userId },
    orderBy: { quarterDate: "desc" },
    select: {
      quarterDate: true,
      isPreMigration: true,
      entries: { select: { valueGHS: true } },
    },
  });

  return rows.map((row) => ({
    quarterDate: toISODate(row.quarterDate),
    isPreMigration: row.isPreMigration,
    totalGHS: sumMoney(row.entries.map((e) => e.valueGHS.toString())),
  }));
}

export async function getComparison(
  isoDateA: string,
  isoDateB: string,
  userIdParam?: string,
): Promise<ComparisonDTO | null> {
  const userId = userIdParam ?? (await requireSessionUser()).id;
  const [holdings, rows] = await Promise.all([
    loadHoldingMeta(userId),
    db.quarter.findMany({
      where: {
        userId,
        quarterDate: { in: [parseISODate(isoDateA), parseISODate(isoDateB)] },
      },
      select: {
        quarterDate: true,
        isPreMigration: true,
        entries: { select: { holdingId: true, valueGHS: true } },
      },
    }),
  ]);

  const byDate = new Map(rows.map((row) => [toISODate(row.quarterDate), row]));
  const rowA = byDate.get(isoDateA);
  const rowB = byDate.get(isoDateB);
  if (!rowA || !rowB) return null;

  const snapA = snapshot(rowA, holdings);
  const snapB = snapshot(rowB, holdings);

  const holdingIds = new Set([...snapA.byHolding.keys(), ...snapB.byHolding.keys()]);
  const byHolding: DeltaRowDTO[] = [];

  for (const holdingId of holdingIds) {
    const holding = holdings.get(holdingId);
    if (!holding) continue;
    const valueA = snapA.byHolding.get(holdingId) ?? "0.00";
    const valueB = snapB.byHolding.get(holdingId) ?? "0.00";

    byHolding.push({
      id: holdingId,
      label: holding.ticker,
      sublabel: holding.displayName,
      bucketId: holding.bucketId,
      bucketName: holding.bucket.name,
      colorToken: holding.bucket.colorToken,
      valueA,
      valueB,
      deltaGHS: subMoney(valueB, valueA),
      pctChange: pctChange(valueA, valueB),
      onlyInA: !snapB.byHolding.has(holdingId),
      onlyInB: !snapA.byHolding.has(holdingId),
      isAggregate: holding.isAggregate,
    });
  }

  const bucketMeta = new Map<string, HoldingMeta["bucket"]>();
  for (const holding of holdings.values()) {
    bucketMeta.set(holding.bucketId, holding.bucket);
  }

  const bucketIds = new Set([...snapA.byBucket.keys(), ...snapB.byBucket.keys()]);
  const byBucket: DeltaRowDTO[] = [];

  for (const bucketId of bucketIds) {
    const meta = bucketMeta.get(bucketId);
    const valueA = snapA.byBucket.get(bucketId) ?? "0.00";
    const valueB = snapB.byBucket.get(bucketId) ?? "0.00";

    byBucket.push({
      id: bucketId,
      label: meta?.name ?? "Unassigned",
      sublabel: null,
      bucketId,
      bucketName: meta?.name ?? "Unassigned",
      colorToken: meta?.colorToken ?? "--color-ink-soft",
      valueA,
      valueB,
      deltaGHS: subMoney(valueB, valueA),
      pctChange: pctChange(valueA, valueB),
      onlyInA: !snapB.byBucket.has(bucketId),
      onlyInB: !snapA.byBucket.has(bucketId),
      isAggregate: false,
    });
  }

  const byAbsDelta = (x: DeltaRowDTO, y: DeltaRowDTO) =>
    Math.abs(Number(y.deltaGHS)) - Math.abs(Number(x.deltaGHS));
  byHolding.sort(byAbsDelta);
  byBucket.sort(byAbsDelta);

  return {
    a: sideFrom(snapA, holdings),
    b: sideFrom(snapB, holdings),
    totalDeltaGHS: subMoney(snapB.totalGHS, snapA.totalGHS),
    totalPctChange: pctChange(snapA.totalGHS, snapB.totalGHS),
    byHolding,
    byBucket,
    holdingLevelIncomplete: snapA.isPreMigration || snapB.isPreMigration,
  };
}

export async function getDrift(isoDate: string, userIdParam?: string): Promise<DriftDTO | null> {
  const userId = userIdParam ?? (await requireSessionUser()).id;
  const [holdings, quarterRows, targetRows] = await Promise.all([
    loadHoldingMeta(userId),
    db.quarter.findMany({
      where: { userId },
      orderBy: { quarterDate: "asc" },
      select: {
        quarterDate: true,
        isPreMigration: true,
        entries: { select: { holdingId: true, valueGHS: true } },
      },
    }),
    db.targetAllocation.findMany({
      where: { userId, bucketId: { not: null } },
      select: { bucketId: true, targetPct: true, effectiveFrom: true },
      orderBy: { effectiveFrom: "asc" },
    }),
  ]);

  const snapshots = quarterRows.map((row) => snapshot(row, holdings));
  const selected = snapshots.find((snap) => snap.quarterDate === isoDate);
  if (!selected) return null;

  const bucketMeta = new Map<string, HoldingMeta["bucket"]>();
  for (const holding of holdings.values()) {
    bucketMeta.set(holding.bucketId, holding.bucket);
  }

  function targetOn(bucketId: string, date: Date): number | null {
    let value: number | null = null;
    for (const row of targetRows) {
      if (row.bucketId !== bucketId) continue;
      if (row.effectiveFrom.getTime() > date.getTime()) break;
      value = Number(row.targetPct.toString());
    }
    return value;
  }

  const selectedDate = parseISODate(isoDate);
  const targets = await effectiveBucketTargets(selectedDate, userId);

  const rowBucketIds = new Set([
    ...selected.byBucket.keys(),
    ...targets.keys(),
  ]);

  const rows: TargetVsActualRowDTO[] = [...rowBucketIds]
    .map((bucketId) => {
      const meta = bucketMeta.get(bucketId);
      const valueGHS = selected.byBucket.get(bucketId) ?? "0.00";
      const actualPct = pctOfTotal(valueGHS, selected.totalGHS);
      const targetPct = targets.get(bucketId) ?? null;
      return {
        bucketId,
        name: meta?.name ?? "Unassigned",
        colorToken: meta?.colorToken ?? "--color-ink-soft",
        sortOrder: meta?.sortOrder ?? 999,
        valueGHS,
        actualPct,
        targetPct,
        variancePP:
          targetPct === null
            ? null
            : Math.round((actualPct - targetPct) * 10) / 10,
      };
    })
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

  const series: DriftPointDTO[] = snapshots.map((snap) => {
    const date = parseISODate(snap.quarterDate);
    const byBucket: Record<string, number> = {};

    for (const bucketId of bucketMeta.keys()) {
      const target = targetOn(bucketId, date);
      if (target === null) continue;
      const value = snap.byBucket.get(bucketId) ?? "0.00";
      const actual = pctOfTotal(value, snap.totalGHS);
      byBucket[bucketId] = Math.round((actual - target) * 10) / 10;
    }

    return { quarterDate: snap.quarterDate, byBucket };
  });

  const seriesBucketIds = new Set<string>();
  for (const point of series) {
    for (const bucketId of Object.keys(point.byBucket)) {
      seriesBucketIds.add(bucketId);
    }
  }

  const buckets = [...bucketMeta.values()]
    .filter((bucket) => seriesBucketIds.has(bucket.id))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

  const setTargets = rows
    .map((row) => row.targetPct)
    .filter((pct): pct is number => pct !== null);

  return {
    quarterDate: selected.quarterDate,
    isPreMigration: selected.isPreMigration,
    totalGHS: selected.totalGHS,
    rows,
    series,
    buckets,
    targetTotalPct:
      setTargets.length === 0
        ? null
        : Math.round(setTargets.reduce((sum, pct) => sum + pct, 0) * 10) / 10,
  };
}
