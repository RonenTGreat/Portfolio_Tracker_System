/**
 * Dashboard aggregates — FR-4.
 *
 * Everything the dashboard draws comes from one function, `getDashboard()`,
 * because every figure on the page has to agree with every other one: the pie,
 * the variance table and the "Crypto %" KPI are three renderings of a single
 * quarter's allocation, and computing them from three separate queries is how
 * they drift apart.
 *
 * The aggregation runs in JS rather than SQL. Two reasons, both about money:
 * `sumMoney` is exact pesewa arithmetic, and the same rollup code then serves
 * the bucket totals, the holding drill-down and the time series without three
 * dialects of GROUP BY. At ~10 years x ~13 holdings this is a few hundred rows,
 * well inside the NFR's "<2s with up to ~10 years of quarterly data".
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

/**
 * An asset-class KPI ("Crypto %", "Safety Net %").
 *
 * Grouped by asset class rather than by bucket because asset class is what a
 * holding *is* and never changes, while a bucket is a reporting choice the user
 * can rename or rearrange (schema note on `Bucket`) — a KPI keyed to a bucket
 * name would silently go blank the day someone renames "Crypto" to "Digital".
 *
 * The target is the sum of the targets of buckets lying wholly inside this asset
 * class. A bucket that mixes asset classes has no attributable share, so it is
 * excluded and `targetPct` reports only what can be stated honestly — null if
 * that leaves nothing.
 */
export interface AssetClassKpiDTO {
  assetClass: AssetClass;
  valueGHS: MoneyString;
  pct: number;
  targetPct: number | null;
}

export interface DashboardDTO {
  /** Null when nothing has been recorded — the page shows the empty ledger. */
  latest: {
    quarterDate: string;
    totalGHS: MoneyString;
    isPreMigration: boolean;
  } | null;
  qoq: QoQDTO | null;
  allocation: BucketAllocationDTO[];
  totalSeries: TotalPointDTO[];
  composition: CompositionPointDTO[];
  /** Every bucket appearing anywhere in the series, for stable chart colours. */
  buckets: { id: string; name: string; colorToken: string; sortOrder: number }[];
  byAssetClass: AssetClassKpiDTO[];
  quarterCount: number;
}

/* -------------------------------------------------------------------------- */

/**
 * The target effective on `date` for each bucket (FR-7).
 *
 * Targets are never updated in place — a change is a new row with a later
 * `effectiveFrom` — so "the target that applied then" is the latest row not
 * after that date. Reading today's target instead would misreport every
 * historical variance, which is the specific question FR-7 exists to answer.
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
    // Rows arrive newest-first, so the first sighting of a bucket is its
    // effective target and later (older) rows for it are skipped.
    if (row.bucketId && !latest.has(row.bucketId)) {
      latest.set(row.bucketId, Number(row.targetPct.toString()));
    }
  }
  return latest;
}

export async function getDashboard(): Promise<DashboardDTO> {
  const [quarterRows, holdingRows] = await Promise.all([
    db.quarter.findMany({
      orderBy: { quarterDate: "asc" }, // oldest first: chart order
      select: {
        quarterDate: true,
        isPreMigration: true,
        entries: { select: { holdingId: true, valueGHS: true } },
      },
    }),
    db.holding.findMany({
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
      // A figure whose holding vanished can't be attributed to a bucket. It
      // still belongs in the total — dropping it would silently understate the
      // portfolio — so it is counted there and omitted from the breakdown only.
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

  const targets = await effectiveBucketTargets(parseISODate(latestDate));

  // Roll the latest quarter's entries up per bucket, keeping the per-holding
  // detail for the pie's drill-down.
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

  const allocation: BucketAllocationDTO[] = [...bucketAcc.entries()]
    .map(([bucketId, acc]) => {
      const valueGHS = sumMoney(acc.values);
      const pct = pctOfTotal(valueGHS, latestTotal);
      const targetPct = targets.get(bucketId) ?? null;
      return {
        bucketId,
        name: acc.name,
        colorToken: acc.colorToken,
        sortOrder: acc.sortOrder,
        valueGHS,
        pct,
        targetPct,
        variancePP:
          targetPct === null ? null : Math.round((pct - targetPct) * 10) / 10,
        // Largest holding first, so a slice's drill-down opens on what drives it.
        holdings: acc.holdings.sort((a, b) => b.pct - a.pct),
      };
    })
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

  // --- Quarter over quarter ------------------------------------------------
  let qoq: QoQDTO | null = null;
  if (totalSeries.length > 1) {
    const prev = totalSeries[totalSeries.length - 2];
    qoq = {
      previousQuarterDate: prev.quarterDate,
      deltaGHS: subMoney(latestTotal, prev.totalGHS),
      pctChange: pctChange(prev.totalGHS, latestTotal),
    };
  }

  // --- Asset-class KPIs ----------------------------------------------------
  const valuesByAssetClass = new Map<AssetClass, MoneyString[]>();
  for (const entry of latestRow.entries) {
    const holding = holdingById.get(entry.holdingId);
    if (!holding) continue;
    const list = valuesByAssetClass.get(holding.assetClass) ?? [];
    list.push(entry.valueGHS.toString());
    valuesByAssetClass.set(holding.assetClass, list);
  }

  // A bucket's target is attributable to an asset class only if every holding
  // in that bucket shares it. Mixed buckets are left out rather than split on a
  // guess — a made-up denominator is worse than an absent target.
  const assetClassesPerBucket = new Map<string, Set<AssetClass>>();
  for (const holding of holdingRows) {
    const set = assetClassesPerBucket.get(holding.bucketId) ?? new Set();
    set.add(holding.assetClass);
    assetClassesPerBucket.set(holding.bucketId, set);
  }

  const targetByAssetClass = new Map<AssetClass, number>();
  for (const [bucketId, targetPct] of targets) {
    const classes = assetClassesPerBucket.get(bucketId);
    if (!classes || classes.size !== 1) continue;
    const only = [...classes][0];
    targetByAssetClass.set(only, (targetByAssetClass.get(only) ?? 0) + targetPct);
  }

  const byAssetClass: AssetClassKpiDTO[] = [...valuesByAssetClass.entries()].map(
    ([assetClass, values]) => {
      const valueGHS = sumMoney(values);
      return {
        assetClass,
        valueGHS,
        pct: pctOfTotal(valueGHS, latestTotal),
        targetPct: targetByAssetClass.get(assetClass) ?? null,
      };
    },
  );

  // Every bucket seen anywhere in the series, so the composition chart keeps a
  // stable colour and stacking order even for buckets absent from the latest
  // quarter (§1.1 — the mapping "must never change between chart types").
  const seenBucketIds = new Set<string>();
  for (const point of composition) {
    for (const bucketId of Object.keys(point.byBucket)) seenBucketIds.add(bucketId);
  }
  const buckets = holdingRows
    .filter((h) => seenBucketIds.has(h.bucketId))
    .map((h) => h.bucket)
    .filter(
      (bucket, index, all) =>
        all.findIndex((b) => b.id === bucket.id) === index,
    )
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

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
    buckets,
    byAssetClass,
    quarterCount: quarterRows.length,
  };
}
