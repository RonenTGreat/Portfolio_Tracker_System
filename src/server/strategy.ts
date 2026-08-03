/**
 * Strategy page data — FR-3, design §6.3.
 *
 * The by-bucket table needs three things per bucket: its current value and
 * share (from the latest quarter), and the target effective now. The detailed
 * holdings table below it needs every holding grouped by bucket with its own
 * target.
 *
 * Current % comes from the same allocation the dashboard renders, via
 * getDashboard(), rather than being recomputed here — two functions computing
 * "Crypto is 41.9%" independently is how a page ends up disagreeing with the
 * dashboard about the same quarter.
 */

import { getDashboard } from "@/server/dashboard";
import { listAllHoldings, listBuckets, type HoldingDTO } from "@/server/holdings";
import { getEffectiveTargets } from "@/server/targets";
import { latestClosedQuarterEnd, toISODate } from "@/lib/quarters";
import type { MoneyString } from "@/lib/money";

export interface StrategyBucketRow {
  bucketId: string;
  name: string;
  colorToken: string;
  valueGHS: MoneyString;
  currentPct: number;
  /** The target in force, as a decimal string, or null if none is set. */
  targetPct: string | null;
}

export interface StrategyHoldingRow {
  holdingId: string;
  ticker: string;
  displayName: string;
  assetClass: HoldingDTO["assetClass"];
  bucketId: string;
  bucketName: string;
  bucketColorToken: string;
  notes: string | null;
  isActive: boolean;
  isAggregate: boolean;
  targetPct: string | null;
  valueGHS: MoneyString;
  currentPct: number;
}

export interface StrategyDTO {
  /** The date targets are read as of — the latest closed quarter. */
  asOf: string;
  /** Null when no quarter has been recorded: there is no "current %" yet. */
  latestQuarterDate: string | null;
  buckets: StrategyBucketRow[];
  holdings: StrategyHoldingRow[];
  /** The quarters an edit may take effect from — the picker's options. */
  effectiveFromOptions: string[];
}

/** How many future quarters the "effective from" picker offers. */
const FORWARD_QUARTERS = 4;

export async function getStrategy(): Promise<StrategyDTO> {
  const asOf = toISODate(latestClosedQuarterEnd(new Date()));

  const [dashboard, allHoldings, buckets, targets] = await Promise.all([
    getDashboard(),
    listAllHoldings(),
    listBuckets(),
    getEffectiveTargets(asOf),
  ]);

  const allocationByBucket = new Map(
    dashboard.allocation.map((bucket) => [bucket.bucketId, bucket]),
  );

  // Every non-archived bucket appears, including ones with nothing in them:
  // a bucket at 0% against a 10% target is exactly the drift the page exists to
  // show, and filtering to buckets that hold something would hide it.
  const bucketRows: StrategyBucketRow[] = buckets.map((bucket) => {
    const allocation = allocationByBucket.get(bucket.id);
    return {
      bucketId: bucket.id,
      name: bucket.name,
      colorToken: bucket.colorToken,
      valueGHS: allocation?.valueGHS ?? "0.00",
      currentPct: allocation?.pct ?? 0,
      targetPct: targets.byBucket.get(bucket.id) ?? null,
    };
  });

  // Per-holding value in the latest quarter, for the detail table.
  const holdingValues = new Map<string, { valueGHS: MoneyString; pct: number }>();
  for (const bucket of dashboard.allocation) {
    for (const holding of bucket.holdings) {
      holdingValues.set(holding.holdingId, {
        valueGHS: holding.valueGHS,
        pct: holding.pct,
      });
    }
  }

  // Retired holdings are dropped here (unlike the historical views, which need
  // them): this table is about what the portfolio should look like going
  // forward, and a retired holding has no future target. Aggregates likewise —
  // they carry imported history, not a strategy.
  const holdingRows: StrategyHoldingRow[] = allHoldings
    .filter((holding) => holding.isActive && !holding.isAggregate)
    .map((holding) => {
      const value = holdingValues.get(holding.id);
      return {
        holdingId: holding.id,
        ticker: holding.ticker,
        displayName: holding.displayName,
        assetClass: holding.assetClass,
        bucketId: holding.bucketId,
        bucketName: holding.bucketName,
        bucketColorToken: holding.bucketColorToken,
        notes: holding.notes,
        isActive: holding.isActive,
        isAggregate: holding.isAggregate,
        targetPct: targets.byHolding.get(holding.id) ?? null,
        valueGHS: value?.valueGHS ?? "0.00",
        currentPct: value?.pct ?? 0,
      };
    });

  // The current quarter plus the next few. A target normally applies from the
  // coming quarter rather than retroactively, but back-dating is allowed
  // because the six imported quarters (SRS §8) may need targets attached to
  // them after the fact.
  const effectiveFromOptions: string[] = [];
  const latestClosed = latestClosedQuarterEnd(new Date());
  for (let i = 0; i < FORWARD_QUARTERS; i++) {
    const date = new Date(latestClosed);
    date.setUTCMonth(date.getUTCMonth() + 3 * i + 1, 0);
    effectiveFromOptions.push(toISODate(date));
  }

  return {
    asOf,
    latestQuarterDate: dashboard.latest?.quarterDate ?? null,
    buckets: bucketRows,
    holdings: holdingRows,
    effectiveFromOptions,
  };
}
