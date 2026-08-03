"use client";

/**
 * Portfolio Composition Over Time — FR-4, design §6.1.4 (left column) and §4.
 *
 * §4: "segments colored per the fixed bucket mapping (Section 1.1), 1px --paper
 * gap between segments so each bucket reads as a distinct block, not a blurred
 * gradient". The gap is a --paper stroke on each Bar, which reads as a hairline
 * gap against the page rather than as an outline.
 *
 * §8.5: below --bp-mobile this "switches to horizontal scroll of the same chart
 * (min-width fixed to something legible, e.g. 480px) rather than squeezing 5
 * colors into a 320px-wide column".
 */

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AXIS_DEFAULTS,
  ChartFigure,
  ChartLegend,
  ChartTooltipCard,
} from "./chart-chrome";
import { bucketColor } from "@/lib/buckets";
import { formatGHSCompact, formatGHSWithUnit, sumMoney } from "@/lib/money";
import { parseISODate, quarterLabel, quarterLabelShort } from "@/lib/quarters";
import type { CompositionPointDTO } from "@/server/dashboard";

interface BucketMeta {
  id: string;
  name: string;
  colorToken: string;
  sortOrder: number;
}

/** §8.5 — the floor below which five stacked segments stop being readable. */
const MIN_LEGIBLE_WIDTH = 480;

export function CompositionChart({
  points,
  buckets,
}: {
  points: readonly CompositionPointDTO[];
  buckets: readonly BucketMeta[];
}) {
  const colorById = new Map(
    buckets.map((bucket) => [bucket.id, bucketColor(bucket)]),
  );

  // One flat row per quarter: { shortLabel, [bucketId]: number }. Recharts wants
  // a column per series, so the DTO's nested map is flattened here.
  const data = points.map((point) => {
    const date = parseISODate(point.quarterDate);
    const row: Record<string, string | number> = {
      quarterDate: point.quarterDate,
      label: quarterLabel(date),
      shortLabel: quarterLabelShort(date),
    };
    for (const bucket of buckets) {
      row[bucket.id] = Number(point.byBucket[bucket.id] ?? "0");
    }
    return row;
  });

  return (
    <>
      <ChartFigure
        title="Portfolio composition over time"
        summary={`Value per bucket across ${points.length} ${points.length === 1 ? "quarter" : "quarters"}.`}
        height={280}
        minWidth={points.length > 4 ? MIN_LEGIBLE_WIDTH : undefined}
        table={
          <table>
            <caption>Value by bucket and quarter</caption>
            <thead>
              <tr>
                <th scope="col">Quarter</th>
                {buckets.map((bucket) => (
                  <th key={bucket.id} scope="col">
                    {bucket.name} (GHS)
                  </th>
                ))}
                <th scope="col">Total (GHS)</th>
              </tr>
            </thead>
            <tbody>
              {points.map((point) => (
                <tr key={point.quarterDate}>
                  <th scope="row">
                    {quarterLabel(parseISODate(point.quarterDate))}
                  </th>
                  {buckets.map((bucket) => (
                    <td key={bucket.id}>
                      {formatGHSWithUnit(point.byBucket[bucket.id] ?? "0")}
                    </td>
                  ))}
                  <td>
                    {formatGHSWithUnit(
                      sumMoney(Object.values(point.byBucket)),
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        }
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 16, right: 16, bottom: 8, left: 8 }}>
            <CartesianGrid
              vertical={false}
              stroke="var(--color-rule)"
              strokeDasharray="2 4"
            />
            <XAxis dataKey="shortLabel" {...AXIS_DEFAULTS} />
            <YAxis
              {...AXIS_DEFAULTS}
              width={72}
              tickFormatter={(value: number) => formatGHSCompact(value)}
            />
            <Tooltip
              cursor={{ fill: "color-mix(in oklab, var(--color-ink) 5%, transparent)" }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                // Reversed so the tooltip lists buckets top-down in the same
                // order they appear in the stack.
                const rows = [...payload]
                  .reverse()
                  .filter((item) => Number(item.value) > 0)
                  .map((item) => {
                    const bucket = buckets.find((b) => b.id === item.dataKey);
                    return {
                      label: bucket?.name ?? "Unassigned",
                      value: formatGHSWithUnit(Number(item.value)),
                      color: bucket ? colorById.get(bucket.id) : undefined,
                    };
                  });
                const total = payload.reduce(
                  (sum, item) => sum + Number(item.value ?? 0),
                  0,
                );
                return (
                  <ChartTooltipCard
                    title={String(label)}
                    rows={[
                      ...rows,
                      { label: "Total", value: formatGHSWithUnit(total) },
                    ]}
                  />
                );
              }}
            />
            {buckets.map((bucket) => (
              <Bar
                key={bucket.id}
                dataKey={bucket.id}
                stackId="composition"
                fill={colorById.get(bucket.id)}
                /* §4 — the 1px --paper gap between segments. */
                stroke="var(--color-paper)"
                strokeWidth={1}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </ChartFigure>

      <ChartLegend
        items={buckets.map((bucket) => ({
          id: bucket.id,
          label: bucket.name,
          color: bucketColor(bucket),
        }))}
      />
    </>
  );
}
