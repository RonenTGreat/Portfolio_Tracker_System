"use client";

/**
 * The one pie in the system — design §4.
 *
 * Extracted from AllocationPie so the dashboard's pie and the FR-6 paired pies
 * are literally the same component. FR-6 requires "same chart type/scale/color-
 * mapping used for both quarters, so the two pies are visually comparable"; the
 * only way to guarantee that against future edits is for there to be one
 * implementation rather than two that currently agree.
 *
 * §4: "flat fills per bucket mapping, no 3D/depth effect, no drop shadow, thin
 * 1px --paper stroke between slices. Percentage labels in mono, placed outside
 * the pie with a thin leader line rather than crowded inside small slices."
 */

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { ChartFigure, ChartTooltipCard } from "./chart-chrome";
import { formatGHSWithUnit, formatPct } from "@/lib/money";

export interface PieSlice {
  id: string;
  label: string;
  sublabel?: string;
  /** Chart geometry only — the exact figure travels in `money`. */
  value: number;
  pct: number;
  money: string;
  color: string;
}

/**
 * Below this share, a slice's label is dropped from the ring — at ~2% the
 * leader lines cross each other and the labels overlap, which is less legible
 * than no label at all. The figure is still in the tooltip, the legend and the
 * hidden table, so nothing is only-in-the-chart.
 */
const LABEL_THRESHOLD_PCT = 3;

/**
 * Holdings inside a bucket are shades of that bucket's colour, not new hues.
 * §1.1's fixed bucket→colour mapping is a functional requirement; introducing
 * unrelated colours for a drill-down would break the one thing that makes the
 * FR-6 paired pies comparable.
 */
export function shadeOf(
  colorToken: string,
  index: number,
  count: number,
): string {
  if (count <= 1) return `var(${colorToken})`;
  // 100% down to 45% of the bucket colour, the remainder mixed toward paper.
  const weight = Math.round(100 - (index / Math.max(count - 1, 1)) * 55);
  return `color-mix(in oklab, var(${colorToken}) ${weight}%, var(--color-paper))`;
}

export function BucketPie({
  slices,
  figureTitle,
  tableCaption,
  subjectHeading,
  moneyLabel = "Value",
  height = 300,
  onSliceClick,
}: {
  slices: readonly PieSlice[];
  /** Names the figure for a screen reader; not shown visually. */
  figureTitle: string;
  tableCaption: string;
  /** Header of the first column in the hidden table: "Bucket" or "Holding". */
  subjectHeading: string;
  /**
   * What the money column and tooltip row are called. The §6.5 target pie shows
   * the amount you WOULD hold on plan, not the amount you hold, and labelling
   * that "Value" beside the actual pie would read as a second real figure.
   */
  moneyLabel?: string;
  /** Paired pies pass a shorter height so both fit side by side (§6.4). */
  height?: number;
  /** Set only where a slice does something — otherwise the cursor lies. */
  onSliceClick?: (id: string) => void;
}) {
  return (
    <ChartFigure
      title={figureTitle}
      summary={slices
        .map((slice) => `${slice.label} ${formatPct(slice.pct)}`)
        .join(", ")}
      height={height}
      table={
        <table>
          <caption>{tableCaption}</caption>
          <thead>
            <tr>
              <th scope="col">{subjectHeading}</th>
              <th scope="col">{moneyLabel} (GHS)</th>
              <th scope="col">Share of portfolio</th>
            </tr>
          </thead>
          <tbody>
            {slices.map((slice) => (
              <tr key={slice.id}>
                <th scope="row">
                  {slice.label}
                  {slice.sublabel ? ` — ${slice.sublabel}` : ""}
                </th>
                <td>{formatGHSWithUnit(slice.money)}</td>
                <td>{formatPct(slice.pct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={slices as PieSlice[]}
            dataKey="value"
            nameKey="label"
            /* Percentages sit in a ring outside the pie (§4), so the radius
               leaves room for them rather than filling the container. */
            outerRadius="68%"
            isAnimationActive={false}
            /* §4 — no depth effect, no shadow, hairline paper gap. */
            stroke="var(--color-paper)"
            strokeWidth={1}
            labelLine={{ stroke: "var(--color-rule)", strokeWidth: 1 }}
            label={(props: { percent?: number }) => {
              const pct = (props.percent ?? 0) * 100;
              if (pct < LABEL_THRESHOLD_PCT) return null;
              return formatPct(pct);
            }}
            onClick={
              onSliceClick
                ? (_, index) => {
                    const slice = slices[index];
                    if (slice) onSliceClick(slice.id);
                  }
                : undefined
            }
            className={onSliceClick ? "cursor-pointer" : undefined}
          >
            {slices.map((slice) => (
              <Cell key={slice.id} fill={slice.color} />
            ))}
          </Pie>
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const slice = payload[0].payload as PieSlice;
              return (
                <ChartTooltipCard
                  title={slice.sublabel ?? slice.label}
                  rows={[
                    { label: moneyLabel, value: formatGHSWithUnit(slice.money) },
                    { label: "Share", value: formatPct(slice.pct) },
                  ]}
                />
              );
            }}
          />
        </PieChart>
      </ResponsiveContainer>
    </ChartFigure>
  );
}
