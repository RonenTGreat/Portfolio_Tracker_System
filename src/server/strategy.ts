/**
 * Strategy page data — FR-3, design §6.3, scoped per user.
 */

import { getDashboard } from "@/server/dashboard";
import { listAllHoldings, listBuckets, type HoldingDTO } from "@/server/holdings";
import { getEffectiveTargets } from "@/server/targets";
import { latestClosedQuarterEnd, toISODate } from "@/lib/quarters";
import { requireSessionUser } from "@/server/auth";
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
  asOf: string;
  latestQuarterDate: string | null;
  buckets: StrategyBucketRow[];
  holdings: StrategyHoldingRow[];
  effectiveFromOptions: string[];
}

const FORWARD_QUARTERS = 4;

export async function getStrategy(userIdParam?: string): Promise<StrategyDTO> {
  const userId = userIdParam ?? (await requireSessionUser()).id;
  const asOf = toISODate(latestClosedQuarterEnd(new Date()));

  const [dashboard, allHoldings, buckets, targets] = await Promise.all([
    getDashboard(userId),
    listAllHoldings(userId),
    listBuckets({}, userId),
    getEffectiveTargets(asOf, userId),
  ]);

  const allocationByBucket = new Map(
    dashboard.allocation.map((bucket) => [bucket.bucketId, bucket]),
  );

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

  const holdingValues = new Map<string, { valueGHS: MoneyString; pct: number }>();
  for (const bucket of dashboard.allocation) {
    for (const holding of bucket.holdings) {
      holdingValues.set(holding.holdingId, {
        valueGHS: holding.valueGHS,
        pct: holding.pct,
      });
    }
  }

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
