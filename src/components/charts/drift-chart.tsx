"use client";

/**
 * Drift-over-time — FR-7, design §6.5.3 and §4.
 *
 * "One line per bucket (colored per the fixed mapping) showing variance-from-
 * target across every quarter on record, with the ± tolerance band (§4) shaded
 * behind each line. This is the chart that should make a slow drift toward
 * overweight-crypto visible many quarters before it becomes a surprise."
 *
 * The y-axis is variance in percentage POINTS, not allocation percent, so every
 * bucket shares one axis regardless of how large its target is: a 2pp drift on a
 * 5% target and a 2pp drift on a 40% target are the same distance from plan, and
 * plotting raw allocation would bury the small buckets against the large ones.
 *
 * §8.5 calls this "the densest chart in the system" and asks for a bucket filter
 * below --bp-mobile. The legend is that filter at every width — a five-line
 * chart is worth isolating on a desktop too, and a control that exists only
 * under 768px is a control most users never discover.
 */

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
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
import { formatPP } from "@/lib/money";
import { parseISODate, quarterLabel, quarterLabelShort } from "@/lib/quarters";
import type { DriftPointDTO } from "@/server/compare";

/** §4's suggested tolerance, matching --variance-tolerance in globals.css. */
const TOLERANCE_PP = 5;

interface DriftBucket {
  id: string;
  name: string;
  colorToken: string;
}

/** One row of chart data: a quarter, plus one key per bucket. */
type Row = { quarterDate: string; label: string; shortLabel: string } & Record<
  string,
  string | number | null
>;

export function DriftChart({
  series,
  buckets,
  height = 320,
}: {
  series: readonly DriftPointDTO[];
  buckets: readonly DriftBucket[];
  height?: number;
}) {
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());

  const visible = buckets.filter((bucket) => !hidden.has(bucket.id));

  const data = useMemo<Row[]>(
    () =>
      series.map((point) => {
        const date = parseISODate(point.quarterDate);
        const row: Row = {
          quarterDate: point.quarterDate,
          label: quarterLabel(date),
          shortLabel: quarterLabelShort(date),
        };
        for (const bucket of buckets) {
          // A bucket with no target in that quarter gets null, not 0 — Recharts
          // breaks the line at a null, which is the honest rendering: there was
          // no target to be off by, so there is no variance to plot.
          row[bucket.id] = point.byBucket[bucket.id] ?? null;
        }
        return row;
      }),
    [series, buckets],
  );

  function toggle(id: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      // Hiding the last visible line would leave an empty chart with no way to
      // tell it apart from having no data. Refuse the last one.
      return next.size === buckets.length ? prev : next;
    });
  }

  /**
   * §4 wants the band "in a 10%-opacity fill of the relevant bucket color". With
   * five lines on one axis every band occupies the identical ±5pp range, so five
   * tinted bands would stack into a muddy brown stripe and stop meaning anything.
   *
   * So: the band takes the bucket's colour when exactly one line is shown, and a
   * neutral --ink-soft tint when several are. Isolating a bucket is one tap on
   * its legend swatch, and that is the reading where "the relevant bucket color"
   * has a referent.
   */
  const soloBucket = visible.length === 1 ? visible[0] : null;
  const bandColor = soloBucket
    ? `color-mix(in oklab, ${bucketColor(soloBucket)} 10%, transparent)`
    : "color-mix(in oklab, var(--color-ink-soft) 8%, transparent)";

  return (
    <>
      <ChartFigure
        title="Variance from target by bucket, across every quarter on record"
        summary={`Percentage points above or below each bucket's target, quarter by quarter. Within ±${TOLERANCE_PP}pp is on plan.`}
        height={height}
        /* §8.5 — below --bp-mobile the chart scrolls rather than compressing;
           at ~40px per quarter, 10 quarters stop being readable under 480px. */
        minWidth={Math.max(480, series.length * 56)}
        table={
          <table>
            <caption>
              Variance from target in percentage points, by bucket and quarter
            </caption>
            <thead>
              <tr>
                <th scope="col">Quarter</th>
                {buckets.map((bucket) => (
                  <th key={bucket.id} scope="col">
                    {bucket.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={row.quarterDate}>
                  <th scope="row">{row.label}</th>
                  {buckets.map((bucket) => {
                    const value = row[bucket.id];
                    return (
                      <td key={bucket.id}>
                        {typeof value === "number"
                          ? formatPP(value)
                          : "no target set"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        }
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 16, right: 16, bottom: 8, left: 8 }}>
            <CartesianGrid
              vertical={false}
              stroke="var(--color-rule)"
              strokeDasharray="2 4"
            />

            {/* §4 — the tolerance is a BAND, not a line: it "communicates
                'acceptable range' more honestly than a line implying false
                precision". Drawn before the lines so it sits behind them. */}
            <ReferenceArea
              y1={-TOLERANCE_PP}
              y2={TOLERANCE_PP}
              fill={bandColor}
              stroke="none"
              ifOverflow="extendDomain"
            />
            {/* Zero is on-target exactly — a single dashed --ink-soft line, the
                one reference line §4 permits. */}
            <ReferenceLine
              y={0}
              stroke="var(--color-ink-soft)"
              strokeDasharray="2 4"
            />

            <XAxis dataKey="shortLabel" {...AXIS_DEFAULTS} />
            <YAxis
              {...AXIS_DEFAULTS}
              width={56}
              tickFormatter={(value: number) => formatPP(value, 0)}
            />
            <Tooltip
              cursor={{ stroke: "var(--color-ink-soft)", strokeDasharray: "2 4" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const row = payload[0].payload as Row;
                return (
                  <ChartTooltipCard
                    title={row.label}
                    rows={visible
                      .filter((bucket) => typeof row[bucket.id] === "number")
                      .map((bucket) => ({
                        label: bucket.name,
                        value: formatPP(row[bucket.id] as number),
                        color: bucketColor(bucket),
                      }))}
                    footer={`Within ±${TOLERANCE_PP}pp is on plan`}
                  />
                );
              }}
            />

            {visible.map((bucket) => (
              <Line
                key={bucket.id}
                type="linear"
                dataKey={bucket.id}
                name={bucket.name}
                stroke={bucketColor(bucket)}
                strokeWidth={2}
                fill="none"
                isAnimationActive={false}
                /* A quarter with no target for this bucket is a gap, not a
                   join: connecting across it would draw a trend that never
                   existed. */
                connectNulls={false}
                dot={{ r: 2, fill: bucketColor(bucket), strokeWidth: 0 }}
                activeDot={{ r: 4, strokeWidth: 0 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </ChartFigure>

      <ChartLegend
        items={buckets.map((bucket) => ({
          id: bucket.id,
          label: bucket.name,
          color: bucketColor(bucket),
        }))}
        hidden={hidden}
        onToggle={toggle}
      />
      <p className="type-body-sm mt-2 text-ink-soft">
        {soloBucket
          ? `Band shows ${soloBucket.name}'s ±${TOLERANCE_PP}pp tolerance. Tap a swatch to bring the others back.`
          : `Shaded band is the ±${TOLERANCE_PP}pp tolerance. Tap a swatch to isolate one bucket.`}
      </p>
    </>
  );
}
