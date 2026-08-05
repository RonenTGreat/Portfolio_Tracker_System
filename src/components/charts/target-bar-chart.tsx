"use client";

/**
 * Target vs. Current bar chart — FR-4 ("Bar chart: Target % vs. Current % by
 * bucket, and by individual holding"), design §6.1.
 *
 * A grouped bar chart: each bucket (or holding) gets two side-by-side bars —
 * the target and the current allocation percentage. This is the visual
 * complement to the variance table: the table is precise, but the chart makes
 * a 20pp gap *visible* instead of just readable.
 *
 * The current bar uses the fixed bucket→colour mapping (§1.1). The target bar
 * uses the same colour at 20% opacity — enough to see which bucket it belongs
 * to, muted enough that the eye reads the solid bar as "what is" and the
 * translucent one as "what should be", without a legend needed to tell them
 * apart.
 *
 * Drill-down: clicking a bucket replaces the chart with that bucket's holdings
 * (same pattern as the allocation pie in allocation-pie.tsx), so the FR-4
 * "by individual holding" requirement is met through interaction rather than
 * trying to cram 12 grouped-bar clusters into one chart.
 */

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AXIS_DEFAULTS, ChartFigure, ChartTooltipCard } from "./chart-chrome";
import { bucketColor, bucketColorAlpha } from "@/lib/buckets";
import { formatPct } from "@/lib/money";
import type { BucketAllocationDTO } from "@/server/dashboard";

interface BarDatum {
  id: string;
  name: string;
  current: number;
  target: number | null;
  colorSolid: string;
  colorFaded: string;
  /** How many holdings this bucket has (controls whether drill-down is offered).
   *  Undefined for holding-level bars (the drill-down view). */
  holdingCount?: number;
}

export function TargetBarChart({
  allocation,
}: {
  allocation: readonly BucketAllocationDTO[];
}) {
  const [drilldownBucketId, setDrilldownBucketId] = useState<string | null>(
    null,
  );

  const drilldown = drilldownBucketId
    ? (allocation.find((b) => b.bucketId === drilldownBucketId) ?? null)
    : null;

  const bucketData: BarDatum[] = useMemo(
    () =>
      allocation.map((bucket) => ({
        id: bucket.bucketId,
        name: bucket.name,
        current: bucket.pct,
        target: bucket.targetPct,
        colorSolid: bucketColor({
          id: bucket.bucketId,
          name: bucket.name,
          colorToken: bucket.colorToken,
        }),
        colorFaded: bucketColorAlpha(
          { id: bucket.bucketId, name: bucket.name, colorToken: bucket.colorToken },
          0.2,
        ),
        holdingCount: bucket.holdings.length,
      })),
    [allocation],
  );

  const holdingData: BarDatum[] | null = useMemo(() => {
    if (!drilldown) return null;
    return drilldown.holdings.map((h) => ({
      id: h.holdingId,
      name: h.ticker,
      current: h.pct,
      target: null,
      colorSolid: bucketColor({
        id: drilldown.bucketId,
        name: drilldown.name,
        colorToken: drilldown.colorToken,
      }),
      colorFaded: bucketColorAlpha(
        { id: drilldown.bucketId, name: drilldown.name, colorToken: drilldown.colorToken },
        0.2,
      ),
    }));
  }, [drilldown]);

  const data = holdingData ?? bucketData;
  const anyTarget = data.some((d) => d.target !== null);

  function handleBarClick(datum: BarDatum) {
    // Only drill in from the bucket view, and only if there's more than 1 holding
    if (!drilldown && datum.holdingCount && datum.holdingCount > 1) {
      setDrilldownBucketId(datum.id);
    }
  }

  const chartTitle = drilldown
    ? `Holdings within ${drilldown.name} — current allocation`
    : "Target vs. current allocation by bucket";

  const tableCaption = drilldown
    ? `Current allocation of holdings within ${drilldown.name}`
    : "Target versus current allocation percentage by bucket";

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

      <ChartFigure
        title={chartTitle}
        summary={
          drilldown
            ? `${drilldown.holdings.length} holdings in ${drilldown.name}.`
            : `${allocation.length} buckets. ${anyTarget ? "Target shown alongside current." : "No targets set yet."}`
        }
        height={Math.max(200, data.length * 48 + 60)}
        table={
          <table>
            <caption>{tableCaption}</caption>
            <thead>
              <tr>
                <th scope="col">{drilldown ? "Holding" : "Bucket"}</th>
                <th scope="col">Current %</th>
                {anyTarget && <th scope="col">Target %</th>}
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.id}>
                  <th scope="row">{d.name}</th>
                  <td>{formatPct(d.current)}</td>
                  {anyTarget && (
                    <td>
                      {d.target === null ? "no target" : formatPct(d.target)}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        }
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 8, right: 24, bottom: 8, left: 8 }}
            barCategoryGap="20%"
            barGap={2}
          >
            <CartesianGrid
              horizontal={false}
              stroke="var(--color-rule)"
              strokeDasharray="2 4"
            />
            <XAxis
              type="number"
              {...AXIS_DEFAULTS}
              tickFormatter={(value: number) => `${value}%`}
              domain={[0, "auto"]}
            />
            <YAxis
              type="category"
              dataKey="name"
              {...AXIS_DEFAULTS}
              width={100}
              tick={{ className: "chart-tick", fontSize: 12 }}
            />
            <Tooltip
              cursor={{ fill: "color-mix(in oklab, var(--color-ink) 5%, transparent)" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const datum = payload[0].payload as BarDatum;
                const rows = [
                  {
                    label: "Current",
                    value: formatPct(datum.current),
                    color: datum.colorSolid,
                  },
                ];
                if (datum.target !== null) {
                  rows.push({
                    label: "Target",
                    value: formatPct(datum.target),
                    color: datum.colorFaded,
                  });
                }
                return (
                  <ChartTooltipCard
                    title={datum.name}
                    rows={rows}
                    footer={
                      datum.target !== null
                        ? `Variance: ${datum.current - datum.target > 0 ? "+" : ""}${(datum.current - datum.target).toFixed(1)}pp`
                        : undefined
                    }
                  />
                );
              }}
            />

            {/* Target bars first (behind), at 20% opacity of the bucket colour */}
            {anyTarget && (
              <Bar
                dataKey="target"
                fill="var(--color-rule)"
                isAnimationActive={false}
                radius={[0, 2, 2, 0]}
                /* Each bar uses its own bucket's faded colour, not a single fill.
                   Recharts' `fill` on Bar is the default; the cell-level shape
                   renders with the row's own faded colour via the shape prop. */
                shape={((props: unknown) => {
                  const { x, y, width, height, payload } =
                    props as {
                      x: number;
                      y: number;
                      width: number;
                      height: number;
                      payload: BarDatum;
                    };
                  if (payload.target === null || width <= 0) return null;
                  return (
                    <rect
                      x={x}
                      y={y}
                      width={width}
                      height={height}
                      fill={payload.colorFaded}
                      rx={2}
                    />
                  );
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                }) as any}
              />
            )}

            {/* Current bars — solid bucket colour */}
            <Bar
              dataKey="current"
              isAnimationActive={false}
              radius={[0, 2, 2, 0]}
              onClick={(_data) => {
                const datum = (_data as unknown as { payload?: BarDatum })?.payload ?? (_data as unknown as BarDatum);
                handleBarClick(datum);
              }}
              cursor={drilldown ? undefined : "pointer"}
              shape={((props: unknown) => {
                const { x, y, width, height, payload } =
                  props as {
                    x: number;
                    y: number;
                    width: number;
                    height: number;
                    payload: BarDatum;
                  };
                if (width <= 0) return null;
                return (
                  <rect
                    x={x}
                    y={y}
                    width={width}
                    height={height}
                    fill={payload.colorSolid}
                    rx={2}
                  />
                );
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
              }) as any}
            />
          </BarChart>
        </ResponsiveContainer>
      </ChartFigure>

      {!drilldown && (
        <p className="type-body-sm mt-2 text-ink-soft">
          {anyTarget
            ? "Solid bar is current allocation; faded bar is target. Select a bucket to see its holdings."
            : "No targets set. Set targets on Strategy to see the comparison."}
        </p>
      )}
    </>
  );
}
