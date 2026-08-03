"use client";

/**
 * Shared chart chrome — design §4.
 *
 * §4 defines one visual language for every chart ("All charts (Recharts) share
 * one visual language"), so the tooltip, legend and axis treatment live here
 * rather than being re-specified per chart. A second copy of the tooltip is how
 * two charts end up disagreeing about what a stamped card looks like.
 *
 * Also here: `ChartFigure`, which pairs every chart with the visually-hidden
 * data table §9 requires. Making it part of the shared wrapper means a chart
 * cannot be added without its accessible equivalent — if it were left to each
 * chart to remember, some chart eventually wouldn't.
 */

import type { ReactNode } from "react";

/** Class for every axis tick. Defined in globals.css — see the note there. */
export const CHART_TICK_CLASS = "chart-tick";

/**
 * §4 — "1px --rule axis line only (no tick marks extending into the plot
 * area)". Spread onto every XAxis/YAxis so no chart forgets a piece of it.
 */
export const AXIS_DEFAULTS = {
  stroke: "var(--color-rule)",
  tickLine: false as const,
  tick: { className: CHART_TICK_CLASS },
} as const;

/** One row of a tooltip: a label and its mono figure. */
export interface TooltipRow {
  label: string;
  value: string;
  /** Bucket colour, drawn as a square swatch (§4 — squares, not dots). */
  color?: string;
}

/**
 * §4 — "styled as a small stamped card: --paper-raised background, 1px --rule
 * border, 2px radius, figures in mono, no drop shadow (use a 1px --ink border
 * at 8% opacity to lift it instead)".
 *
 * The lift is an inset ring via box-shadow, which is not a *drop* shadow — it
 * casts nothing and adds no blur outside the border, so §1.4's ban holds.
 */
export function ChartTooltipCard({
  title,
  rows,
  footer,
}: {
  title: string;
  rows: readonly TooltipRow[];
  footer?: ReactNode;
}) {
  return (
    <div
      className="rounded-soft border border-rule bg-paper-raised px-3 py-2"
      style={{ boxShadow: "inset 0 0 0 1px color-mix(in oklab, var(--color-ink) 8%, transparent)" }}
    >
      <p className="type-body-sm m-0 mb-1 text-ink">{title}</p>
      <ul className="m-0 flex list-none flex-col gap-[2px] p-0">
        {rows.map((row) => (
          <li
            key={row.label}
            className="flex items-center justify-between gap-4"
          >
            <span className="type-body-sm flex items-center gap-2 text-ink-soft">
              {row.color && (
                <span
                  aria-hidden="true"
                  className="inline-block h-[10px] w-[10px] shrink-0"
                  style={{ background: row.color }}
                />
              )}
              {row.label}
            </span>
            <span className="type-data-sm text-ink">{row.value}</span>
          </li>
        ))}
      </ul>
      {footer && (
        <p className="type-body-sm m-0 mt-1 text-ink-soft">{footer}</p>
      )}
    </div>
  );
}

/**
 * §4 — "small square swatches (not circles/dots — squares read more 'ledger
 * tick-box'), --type-body-sm, positioned below the chart, left-aligned".
 *
 * `onToggle` supports §8.5's mobile bucket filter for the dense drift chart;
 * without it the legend is inert text, as on the simpler charts.
 */
export function ChartLegend({
  items,
  hidden,
  onToggle,
}: {
  items: readonly { id: string; label: string; color: string }[];
  hidden?: ReadonlySet<string>;
  onToggle?: (id: string) => void;
}) {
  return (
    <ul className="m-0 mt-4 flex list-none flex-wrap gap-x-6 gap-y-2 p-0">
      {items.map((item) => {
        const isHidden = hidden?.has(item.id) ?? false;
        const swatch = (
          <>
            <span
              aria-hidden="true"
              className="inline-block h-[10px] w-[10px] shrink-0"
              style={{
                background: isHidden ? "transparent" : item.color,
                border: isHidden ? `1px solid ${item.color}` : undefined,
              }}
            />
            {item.label}
          </>
        );

        return (
          <li key={item.id}>
            {onToggle ? (
              <button
                type="button"
                onClick={() => onToggle(item.id)}
                aria-pressed={!isHidden}
                className="type-body-sm tap-target flex cursor-pointer items-center gap-2 border-0 bg-transparent p-0 text-ink-soft"
              >
                {swatch}
              </button>
            ) : (
              <span className="type-body-sm flex items-center gap-2 text-ink-soft">
                {swatch}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * A chart plus the data table §9 requires ("pair every chart with a
 * visually-hidden data table ... so screen reader users get the same
 * information non-visually").
 *
 * The chart itself is marked `aria-hidden`: an SVG of positioned rectangles
 * announces as a pile of meaningless nodes, and the table beside it already
 * carries the whole content.
 */
export function ChartFigure({
  title,
  summary,
  table,
  height,
  minWidth,
  children,
}: {
  /** Names the figure for a screen reader. Not rendered visually — the
   *  surrounding Section already shows a heading. */
  title: string;
  /** One sentence of what the chart shows, read before the table. */
  summary?: string;
  /** The visually-hidden equivalent: a real <table> of the same figures. */
  table: ReactNode;
  height: number;
  /** §8.5 — when set, the chart scrolls horizontally below this width rather
   *  than compressing past legibility. */
  minWidth?: number;
  children: ReactNode;
}) {
  const chart = (
    <div aria-hidden="true" style={{ height, minWidth }}>
      {children}
    </div>
  );

  return (
    <figure className="m-0">
      <figcaption className="sr-only-ledger">
        {title}
        {summary ? `. ${summary}` : ""}
      </figcaption>
      {minWidth ? (
        // Scroll the chart only, never the page (§8.6's rule, same reasoning).
        <div className="overflow-x-auto">{chart}</div>
      ) : (
        chart
      )}
      <div className="sr-only-ledger">{table}</div>
    </figure>
  );
}
