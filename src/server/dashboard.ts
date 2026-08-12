/**
 * Dashboard aggregates — FR-4, scoped per user.
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
import type { AssetClass } from "@/generated/prisma/enums";

/** A holding's slice of a bucket — the FR-4 pie drill-down. */
export interface HoldingSliceDTO {
  holdingId: string;
  ticker: string;
  displayName: string;
  isAggregate: boolean;
  valueGHS: MoneyString;
  /** Percent of the whole portfolio, not of the parent bucket. */
  pct: number;
}

/** One bucket in a quarter: its value, its share, and its target at that date. */
export interface BucketAllocationDTO {
  bucketId: string;
  name: string;
  colorToken: string;
  sortOrder: number;
  valueGHS: MoneyString;
  pct: number;
  /** The target effective on this quarter's date (FR-7), or null if none was. */
  targetPct: number | null;
  /** current − target, in percentage POINTS. Null when there is no target. */
  variancePP: number | null;
  holdings: HoldingSliceDTO[];
}

/** A point on the total-value line chart. */
export interface TotalPointDTO {
  quarterDate: string;
  totalGHS: MoneyString;
  isPreMigration: boolean;
}

/** A column on the composition chart: one quarter, one figure per bucket. */
export interface CompositionPointDTO {
  quarterDate: string;
  /** bucketId → value. Buckets with nothing that quarter are simply absent. */
  byBucket: Record<string, MoneyString>;
}

/** The two headline comparison figures (FR-4 "QoQ Change (GHS and %)"). */
export interface QoQDTO {
  previousQuarterDate: string;
  deltaGHS: MoneyString;
  /** Null when the previous quarter totalled zero — see money.pctChange. */
  pctChange: number | null;
}

export interface AssetClassKpiDTO {
  assetClass: AssetClass;
  valueGHS: MoneyString;
  pct: number;
  targetPct: number | null;
}

export interface DashboardDTO {
  latest: {
    quarterDate: string;
    totalGHS: MoneyString;
    isPreMigration: boolean;
  } | null;
  qoq: QoQDTO | null;
  allocation: BucketAllocationDTO[];
  totalSeries: TotalPointDTO[];
  composition: CompositionPointDTO[];
  buckets: { id: string; name: string; colorToken: string; sortOrder: number }[];
  byAssetClass: AssetClassKpiDTO[];
  quarterCount: number;
}

/* -------------------------------------------------------------------------- */

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

export async function getDashboard(userIdParam?: string): Promise<DashboardDTO> {
  const userId = userIdParam ?? (await requireSessionUser()).id;

  const [quarterRows, holdingRows] = await Promise.all([
    db.quarter.findMany({
      where: { userId },
      orderBy: { quarterDate: "asc" }, // oldest first: chart order
      select: {
        quarterDate: true,
        isPreMigration: true,
        entries: { select: { holdingId: true, valueGHS: true } },
      },
    }),
    db.holding.findMany({
      where: { userId },
      select: {
        id: true,
        ticker: true,
        displayName: true,
        assetClass: true,
        bucketId: true,
        isAggregate: true,
        bucket: {
          select: { id: true, name: true, colorToken: true, sortOrder: true },
        },
      },
    }),
  ]);

  const holdingById = new Map(holdingRows.map((h) => [h.id, h]));

  const empty: DashboardDTO = {
    latest: null,
    qoq: null,
    allocation: [],
    totalSeries: [],
    composition: [],
    buckets: [],
    byAssetClass: [],
    quarterCount: 0,
  };
  if (quarterRows.length === 0) return empty;

  // --- Series over every recorded quarter ---------------------------------
  const totalSeries: TotalPointDTO[] = [];
  const composition: CompositionPointDTO[] = [];

  for (const quarter of quarterRows) {
    const byBucket: Record<string, MoneyString> = {};
    for (const entry of quarter.entries) {
      const holding = holdingById.get(entry.holdingId);
      if (!holding) continue;
      const value = entry.valueGHS.toString();
      byBucket[holding.bucketId] = byBucket[holding.bucketId]
        ? sumMoney([byBucket[holding.bucketId], value])
        : value;
    }

    totalSeries.push({
      quarterDate: toISODate(quarter.quarterDate),
      totalGHS: sumMoney(quarter.entries.map((e) => e.valueGHS.toString())),
      isPreMigration: quarter.isPreMigration,
    });
    composition.push({
      quarterDate: toISODate(quarter.quarterDate),
      byBucket,
    });
  }

  // --- The latest quarter, in detail --------------------------------------
  const latestRow = quarterRows[quarterRows.length - 1];
  const latestDate = toISODate(latestRow.quarterDate);
  const latestTotal = totalSeries[totalSeries.length - 1].totalGHS;

  // Both queries depend only on latestDate + userId, so run them in parallel
  // rather than sequentially — saves one DB round trip.
  const [targets, userBuckets] = await Promise.all([
    effectiveBucketTargets(parseISODate(latestDate), userId),
    db.bucket.findMany({
      where: { userId, archivedAt: null },
      select: { id: true, holdings: { select: { assetClass: true } } },
    }),
  ]);

  // Roll the latest quarter's entries up per bucket
  const bucketAcc = new Map<
    string,
    {
      name: string;
      colorToken: string;
      sortOrder: number;
      values: MoneyString[];
      holdings: HoldingSliceDTO[];
    }
  >();

  for (const entry of latestRow.entries) {
    const holding = holdingById.get(entry.holdingId);
    if (!holding) continue;
    const value = entry.valueGHS.toString();

    let acc = bucketAcc.get(holding.bucketId);
    if (!acc) {
      acc = {
        name: holding.bucket.name,
        colorToken: holding.bucket.colorToken,
        sortOrder: holding.bucket.sortOrder,
        values: [],
        holdings: [],
      };
      bucketAcc.set(holding.bucketId, acc);
    }
    acc.values.push(value);
    acc.holdings.push({
      holdingId: holding.id,
      ticker: holding.ticker,
      displayName: holding.displayName,
      isAggregate: holding.isAggregate,
      valueGHS: value,
      pct: pctOfTotal(value, latestTotal),
    });
  }

  const allocation: BucketAllocationDTO[] = Array.from(
    bucketAcc.entries(),
  ).map(([bucketId, acc]) => {
    const valueGHS = sumMoney(acc.values);
    const pct = pctOfTotal(valueGHS, latestTotal);
    const targetPct = targets.get(bucketId) ?? null;
    const variancePP =
      targetPct === null ? null : Math.round((pct - targetPct) * 10) / 10;

    return {
      bucketId,
      name: acc.name,
      colorToken: acc.colorToken,
      sortOrder: acc.sortOrder,
      valueGHS,
      pct,
      targetPct,
      variancePP,
      holdings: acc.holdings.sort((a, b) => b.pct - a.pct),
    };
  });

  allocation.sort((a, b) => a.sortOrder - b.sortOrder);

  // --- QoQ change ----------------------------------------------------------
  let qoq: QoQDTO | null = null;
  if (quarterRows.length > 1) {
    const prevDate = toISODate(quarterRows[quarterRows.length - 2].quarterDate);
    const prevTotal = totalSeries[totalSeries.length - 2].totalGHS;
    qoq = {
      previousQuarterDate: prevDate,
      deltaGHS: subMoney(latestTotal, prevTotal),
      pctChange: pctChange(latestTotal, prevTotal),
    };
  }

  // --- Asset class KPIs -----------------------------------------------------
  const classAcc = new Map<
    AssetClass,
    { values: MoneyString[]; targetSum: number; hasUncoveredBucket: boolean }
  >();

  for (const entry of latestRow.entries) {
    const holding = holdingById.get(entry.holdingId);
    if (!holding) continue;
    const value = entry.valueGHS.toString();

    let acc = classAcc.get(holding.assetClass);
    if (!acc) {
      acc = { values: [], targetSum: 0, hasUncoveredBucket: false };
      classAcc.set(holding.assetClass, acc);
    }
    acc.values.push(value);
  }

  for (const bucket of userBuckets) {
    const classes = new Set(bucket.holdings.map((h) => h.assetClass));
    const target = targets.get(bucket.id);

    if (classes.size === 1) {
      const [singleClass] = Array.from(classes);
      const acc = classAcc.get(singleClass);
      if (acc && target !== undefined) {
        acc.targetSum += target;
      }
    } else {
      for (const assetClass of Array.from(classes)) {
        const acc = classAcc.get(assetClass);
        if (acc) acc.hasUncoveredBucket = true;
      }
    }
  }

  const byAssetClass: AssetClassKpiDTO[] = Array.from(classAcc.entries()).map(
    ([assetClass, acc]) => {
      const valueGHS = sumMoney(acc.values);
      return {
        assetClass,
        valueGHS,
        pct: pctOfTotal(valueGHS, latestTotal),
        targetPct: acc.hasUncoveredBucket
          ? null
          : Math.round(acc.targetSum * 10) / 10,
      };
    },
  );

  // --- Unique buckets across history ----------------------------------------
  const knownBuckets = new Map<
    string,
    { id: string; name: string; colorToken: string; sortOrder: number }
  >();

  for (const holding of holdingRows) {
    if (!knownBuckets.has(holding.bucketId)) {
      knownBuckets.set(holding.bucketId, {
        id: holding.bucket.id,
        name: holding.bucket.name,
        colorToken: holding.bucket.colorToken,
        sortOrder: holding.bucket.sortOrder,
      });
    }
  }

  return {
    latest: {
      quarterDate: latestDate,
      totalGHS: latestTotal,
      isPreMigration: latestRow.isPreMigration,
    },
    qoq,
    allocation,
    totalSeries,
    composition,
    buckets: Array.from(knownBuckets.values()).sort(
      (a, b) => a.sortOrder - b.sortOrder,
    ),
    byAssetClass,
    quarterCount: quarterRows.length,
  };
}
