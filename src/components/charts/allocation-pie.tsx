"use client";

/**
 * Current Allocation — FR-4 ("Pie chart: Current allocation by bucket, with
 * drill-down to individual holdings within each slice"), design §6.1.4.
 *
 * The pie itself is BucketPie, shared with the FR-6 paired charts. What lives
 * here is only the drill-down: choosing which slices to show, and the control
 * for getting back out.
 *
 * The drill-down replaces the pie's contents with one bucket's holdings rather
 * than opening a second chart beside it: the question being asked ("what is
 * inside Crypto?") is about the same 100%, and two pies at different scales
 * would invite comparing slices that aren't comparable.
 */

import { useState } from "react";
import { BucketPie, shadeOf, type PieSlice } from "./bucket-pie";
import { ChartLegend } from "./chart-chrome";
import { bucketColor } from "@/lib/buckets";
import { formatPct } from "@/lib/money";
import type { BucketAllocationDTO } from "@/server/dashboard";

export function AllocationPie({
  allocation,
  asOfLabel,
}: {
  allocation: readonly BucketAllocationDTO[];
  asOfLabel: string;
}) {
  const [drilldownBucketId, setDrilldownBucketId] = useState<string | null>(
    null,
  );

  const drilldown = drilldownBucketId
    ? (allocation.find((b) => b.bucketId === drilldownBucketId) ?? null)
    : null;

  const slices: PieSlice[] = drilldown
    ? drilldown.holdings.map((holding, index) => ({
        id: holding.holdingId,
        label: holding.ticker,
        sublabel: holding.displayName,
        value: Number(holding.valueGHS),
        pct: holding.pct,
        money: holding.valueGHS,
        color: shadeOf(drilldown.colorToken, index, drilldown.holdings.length),
      }))
    : allocation.map((bucket) => ({
        id: bucket.bucketId,
        label: bucket.name,
        value: Number(bucket.valueGHS),
        pct: bucket.pct,
        money: bucket.valueGHS,
        // BucketLike keys colour by `id`; the allocation DTO calls the same
        // thing `bucketId` because it also carries the bucket's figures.
        color: bucketColor({
          id: bucket.bucketId,
          name: bucket.name,
          colorToken: bucket.colorToken,
        }),
      }));

  /** A bucket holding one thing has nothing to drill into. */
  function drillInto(bucketId: string) {
    const bucket = allocation.find((b) => b.bucketId === bucketId);
    if (bucket && bucket.holdings.length > 1) setDrilldownBucketId(bucketId);
  }

  return (
    <>
      {drilldown && (
        <div className="mb-4 flex flex-wrap items-baseline gap-3">
          <button
            type="button"
            onClick={() => setDrilldownBucketId(null)}
            className="type-body-sm cursor-pointer border-0 bg-transparent p-0 text-ink underline"
          >
            ← All buckets
          </button>
          <span className="type-body-sm text-ink-soft">
            Inside {drilldown.name} — {formatPct(drilldown.pct)} of the
            portfolio
          </span>
        </div>
      )}

      <BucketPie
        slices={slices}
        figureTitle={
          drilldown
            ? `Holdings within ${drilldown.name}, as of ${asOfLabel}`
            : `Current allocation by bucket, as of ${asOfLabel}`
        }
        tableCaption={
          drilldown
            ? `Holdings within ${drilldown.name} as of ${asOfLabel}`
            : `Allocation by bucket as of ${asOfLabel}`
        }
        subjectHeading={drilldown ? "Holding" : "Bucket"}
        // Only buckets drill down; a holding is already the leaf.
        onSliceClick={drilldown ? undefined : drillInto}
      />

      {/* The legend doubles as the drill-down control: §4 gives it square
          swatches, and a click target there is discoverable in a way that
          "click the slice" is not — and works on touch, where slices smaller
          than a fingertip are effectively untappable (§8.9). */}
      <ChartLegend
        items={slices.map((slice) => ({
          id: slice.id,
          label: `${slice.label} · ${formatPct(slice.pct)}`,
          color: slice.color,
        }))}
        onToggle={drilldown ? undefined : drillInto}
      />

      {!drilldown && (
        <p className="type-body-sm mt-2 text-ink-soft">
          Select a bucket to see the holdings inside it.
        </p>
      )}
    </>
  );
}
