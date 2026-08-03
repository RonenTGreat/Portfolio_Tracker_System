"use client";

/**
 * Total Portfolio Value over time — FR-4, design §6.1.3 and §4.
 *
 * §4 is specific about what this chart must NOT be: "2px --ink line, no area
 * fill beneath it (keep it a line, not a gradient-filled area — avoid the
 * generic fintech 'area chart with gradient fade' look)". So: LineChart, not
 * AreaChart, and the data points are 4px squares rather than circles.
 */

import { useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AXIS_DEFAULTS, ChartFigure, ChartTooltipCard } from "./chart-chrome";
import { formatGHSCompact, formatGHSWithUnit, toChartNumber } from "@/lib/money";
import { parseISODate, quarterLabel, quarterLabelShort } from "@/lib/quarters";
import type { TotalPointDTO } from "@/server/dashboard";

interface Point {
  quarterDate: string;
  label: string;
  shortLabel: string;
  total: number;
  isPreMigration: boolean;
}

export function TotalValueChart({
  series,
}: {
  series: readonly TotalPointDTO[];
}) {
  // §4 — the hovered point "swaps to the Quarter Stamp treatment". Tracked here
  // so the active dot can grow into a stamp-like ring while the rest stay 4px
  // squares.
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const data: Point[] = series.map((point) => {
    const date = parseISODate(point.quarterDate);
    return {
      quarterDate: point.quarterDate,
      label: quarterLabel(date),
      shortLabel: quarterLabelShort(date),
      total: toChartNumber(point.totalGHS),
      isPreMigration: point.isPreMigration,
    };
  });

  return (
    <ChartFigure
      title="Total portfolio value over time"
      summary={`${data.length} ${data.length === 1 ? "quarter" : "quarters"} recorded, from ${data[0]?.label ?? "—"} to ${data[data.length - 1]?.label ?? "—"}.`}
      height={280}
      table={
        <table>
          <caption>Total portfolio value by quarter</caption>
          <thead>
            <tr>
              <th scope="col">Quarter</th>
              <th scope="col">Total value (GHS)</th>
            </tr>
          </thead>
          <tbody>
            {series.map((point) => (
              <tr key={point.quarterDate}>
                <th scope="row">
                  {quarterLabel(parseISODate(point.quarterDate))}
                  {point.isPreMigration && " (aggregated, pre-migration)"}
                </th>
                <td>{formatGHSWithUnit(point.totalGHS)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 16, right: 16, bottom: 8, left: 8 }}
          onMouseMove={(state) => {
            const index = state?.activeTooltipIndex;
            setActiveIndex(typeof index === "number" ? index : null);
          }}
          onMouseLeave={() => setActiveIndex(null)}
        >
          {/* §4 — "No gridlines by default". Horizontal only, dashed, in
              --rule: without any reference the eye can't read a magnitude off
              the line, and this is the least ink that fixes that. */}
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
            cursor={{ stroke: "var(--color-ink-soft)", strokeDasharray: "2 4" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const point = payload[0].payload as Point;
              return (
                <ChartTooltipCard
                  title={point.label}
                  rows={[
                    {
                      label: "Total",
                      value: formatGHSWithUnit(point.total),
                    },
                  ]}
                  footer={
                    point.isPreMigration
                      ? "Aggregated, pre-migration"
                      : undefined
                  }
                />
              );
            }}
          />
          <Line
            type="linear"
            dataKey="total"
            stroke="var(--color-ink)"
            strokeWidth={2}
            /* §4 — "no area fill beneath it". */
            fill="none"
            isAnimationActive={false}
            dot={(props) => {
              const { cx, cy, index } = props as {
                cx: number;
                cy: number;
                index: number;
              };
              const isActive = index === activeIndex;
              const size = isActive ? 10 : 4;
              return (
                <rect
                  key={`dot-${index}`}
                  x={cx - size / 2}
                  y={cy - size / 2}
                  width={size}
                  height={size}
                  /* Hovered points take the stamp's brass ring; the rest are
                     filled ink squares (§4). */
                  fill={isActive ? "var(--color-paper)" : "var(--color-ink)"}
                  stroke={isActive ? "var(--color-brass-deep)" : "none"}
                  strokeWidth={isActive ? 2 : 0}
                />
              );
            }}
            activeDot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartFigure>
  );
}
