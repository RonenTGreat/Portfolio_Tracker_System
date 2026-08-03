/**
 * Quarter-over-quarter comparison (FR-6) and target-vs-actual across time
 * (FR-7).
 *
 * One module for both because they are the same question asked twice: FR-6
 * compares a quarter against another quarter, FR-7 compares a quarter against
 * the target that was in force on its date. Both need "the allocation as it
 * stood on date X", and computing that twice in two files is how the compare
 * page and the drift view would end up disagreeing about the same quarter.
 *
 * The pre-migration caveat runs through everything here. SRS §8: six imported
 * quarters hold bucket-level figures only, carried by one synthetic aggregate
 * holding per bucket. A per-holding comparison against one of those quarters is
 * therefore not "every holding is new" — it is "that quarter doesn't record
 * holdings". The DTOs say which, so the UI can state it rather than presenting
 * an artefact of the import as a real move.
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
  /** Holding id, or bucket id on a bucket row. */
  id: string;
  label: string;
  sublabel: string | null;
  bucketId: string;
  bucketName: string;
  colorToken: string;
  valueA: MoneyString;
  valueB: MoneyString;
  deltaGHS: MoneyString;
  /** Null when A was zero — "+∞%" is not a figure. UI shows "new" instead. */
  pctChange: number | null;
  /** True when this row exists in B but not A, or vice versa. */
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
  /**
   * True when either side is pre-migration, so `byHolding` compares against a
   * quarter that never recorded holdings. The bucket comparison is unaffected.
   */
  holdingLevelIncomplete: boolean;
}

/** One bucket's variance from target in one quarter — the FR-7 drift series. */
export interface DriftPointDTO {
  quarterDate: string;
  /** bucketId → variance in percentage points. Absent when no target applied. */
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
  /** Every quarter on record, so drift is visible as a trend not a snapshot. */
  series: DriftPointDTO[];
  buckets: { id: string; name: string; colorToken: string; sortOrder: number }[];
  /** Sum of the target shares that were set — flags an incomplete strategy. */
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

async function loadHoldingMeta(): Promise<Map<string, HoldingMeta>> {
  const rows = await db.holding.findMany({
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
  /** holdingId → value, for holdings that still exist. */
  byHolding: Map<string, MoneyString>;
  /** bucketId → value. */
  byBucket: Map<string, MoneyString>;
}

/**
 * One quarter rolled up both ways.
 *
 * A figure whose holding has since been deleted still counts toward the total —
 * the money was there — but cannot be attributed to a bucket or a row, so it is
 * omitted from the breakdowns only. Same rule as the dashboard, deliberately:
 * the two pages must agree on what a quarter totalled.
 */
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

/**
 * The bucket target effective on `date` (FR-7).
 *
 * Same semantics as the dashboard's: targets are never updated in place, so
 * "the target that applied then" is the latest row not after that date.
 */
async function effectiveBucketTargets(
  date: Date,
): Promise<Map<string, number>> {
  const rows = await db.targetAllocation.findMany({
    where: { bucketId: { not: null }, effectiveFrom: { lte: date } },
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

/** Every recorded quarter, newest first — the two selectors' options. */
export async function listQuarterOptions(): Promise<QuarterOptionDTO[]> {
  const rows = await db.quarter.findMany({
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

/**
 * Compare two quarters (FR-6). `a` is the earlier side by convention — the
 * caller passes them in the order the user picked, and a delta is read as
 * "B minus A", so swapping them flips every sign, which is the point.
 *
 * Returns null when either date isn't recorded, so the page can say which
 * rather than rendering a comparison against zero.
 */
export async function getComparison(
  isoDateA: string,
  isoDateB: string,
): Promise<ComparisonDTO | null> {
  const [holdings, rows] = await Promise.all([
    loadHoldingMeta(),
    db.quarter.findMany({
      where: {
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

  // --- Per-holding rows ----------------------------------------------------
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

  // --- Per-bucket rows -----------------------------------------------------
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

  // §6.4 default sort: |Δ GHS| descending, biggest mover first. Sorted here so
  // the server-rendered first paint already leads with the mover, rather than
  // the table re-ordering itself once the client takes over.
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

/**
 * Target vs. actual for one quarter, plus the drift series across all of them
 * (FR-7, design §6.5).
 *
 * The series carries one variance figure per bucket per quarter, each measured
 * against the target effective *on that quarter's date* — not today's target.
 * That is the whole point: a line drawn against today's target would show a
 * flat history every time the target changed, hiding exactly the slow drift the
 * chart exists to reveal.
 */
export async function getDrift(isoDate: string): Promise<DriftDTO | null> {
  const [holdings, quarterRows, targetRows] = await Promise.all([
    loadHoldingMeta(),
    db.quarter.findMany({
      orderBy: { quarterDate: "asc" },
      select: {
        quarterDate: true,
        isPreMigration: true,
        entries: { select: { holdingId: true, valueGHS: true } },
      },
    }),
    db.targetAllocation.findMany({
      where: { bucketId: { not: null } },
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

  /**
   * The target for `bucketId` in force on `date`, from the already-loaded rows.
   *
   * Resolved in memory rather than with one query per quarter: the series walks
   * every quarter, and a round trip each would turn a page render into ~40
   * queries. Rows are ascending, so the last one at or before the date wins.
   */
  function targetOn(bucketId: string, date: Date): number | null {
    let value: number | null = null;
    for (const row of targetRows) {
      if (row.bucketId !== bucketId) continue;
      if (row.effectiveFrom.getTime() > date.getTime()) break;
      value = Number(row.targetPct.toString());
    }
    return value;
  }

  // --- The selected quarter, in detail -------------------------------------
  const selectedDate = parseISODate(isoDate);
  const targets = await effectiveBucketTargets(selectedDate);

  // Buckets with a target but nothing held must still appear: 0% against a 10%
  // target is drift, and omitting the row would hide the largest gap there is.
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

  // --- The drift series ----------------------------------------------------
  const series: DriftPointDTO[] = snapshots.map((snap) => {
    const date = parseISODate(snap.quarterDate);
    const byBucket: Record<string, number> = {};

    for (const bucketId of bucketMeta.keys()) {
      const target = targetOn(bucketId, date);
      // No target then means no variance then — not a variance of zero. Leaving
      // the key absent breaks the line, which is honest: there was nothing to
      // be off by.
      if (target === null) continue;
      const value = snap.byBucket.get(bucketId) ?? "0.00";
      const actual = pctOfTotal(value, snap.totalGHS);
      byBucket[bucketId] = Math.round((actual - target) * 10) / 10;
    }

    return { quarterDate: snap.quarterDate, byBucket };
  });

  // Only buckets that appear somewhere in the series get a line, so a bucket
  // created after the last quarter doesn't add an empty legend entry.
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
