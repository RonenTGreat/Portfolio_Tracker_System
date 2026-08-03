"use client";

/**
 * Paired allocation pies — design §6.4.3, required by FR-6 and reused by §6.5.
 *
 * "Same chart type/scale/color-mapping used for both quarters, so the two pies
 * are visually comparable (e.g., 'Crypto' is always the same color in both)."
 * Both sides render the same BucketPie at the same height, and colour comes from
 * the bucket's own token via lib/buckets, so the mapping cannot differ between
 * the two panels.
 *
 * What the pies deliberately do NOT encode is total size: each is normalised to
 * its own 100%, so a quarter that doubled looks the same size as one that
 * halved. The total is stated in text under each caption instead — scaling one
 * pie's radius against the other would make every slice's share unreadable,
 * which is the thing the pies are for.
 */

import { BucketPie, type PieSlice } from "@/components/charts/bucket-pie";
import { ChartLegend } from "@/components/charts/chart-chrome";
import { QuarterStamp } from "@/components/ui/quarter-stamp";
import { formatGHSWithUnit, formatPct } from "@/lib/money";
import { parseISODate, quarterLabel } from "@/lib/quarters";

export interface PieSide {
  /** ISO date when the caption is a quarter stamp; null for "Target". */
  quarterDate: string | null;
  /** Used when there is no stamp — e.g. the §6.5 target pie. */
  caption?: string;
  /** Shown under the caption: the quarter's total, or a target note. */
  subcaption?: string;
  /** Names this side's money column — "Value", or "On plan" for a target. */
  moneyLabel?: string;
  /** Shown instead of a pie when there are no slices. */
  emptyMessage?: string;
  slices: readonly PieSlice[];
}

/** Paired pies are shorter than the dashboard's single pie so both fit a row. */
const PAIRED_HEIGHT = 260;

function Side({
  side,
  subjectHeading,
}: {
  side: PieSide;
  subjectHeading: string;
}) {
  const label = side.quarterDate
    ? quarterLabel(parseISODate(side.quarterDate))
    : (side.caption ?? "");

  return (
    // §8.5 — "keep both pies the same size as each other at every breakpoint
    // (never let one shrink more than the other due to surrounding content),
    // since equal size is what makes the shape comparison meaningful". basis-0
    // is what enforces that: with the default `basis-auto`, a side whose legend
    // labels are longer would claim more width and draw a larger pie.
    <div className="flex min-w-0 flex-1 basis-0 flex-col items-center">
      {/* §6.4.3 — "each captioned by its quarter stamp". */}
      {side.quarterDate ? (
        <QuarterStamp
          date={parseISODate(side.quarterDate)}
          state="past"
          size="md"
        />
      ) : (
        <span className="type-body-sm flex h-10 items-center text-ink-soft">
          {label}
        </span>
      )}

      <p className="type-data-sm m-0 mt-1 text-ink">{label}</p>
      {side.subcaption && (
        <p className="type-body-sm m-0 text-ink-soft">{side.subcaption}</p>
      )}

      <div className="mt-2 w-full">
        {side.slices.length === 0 ? (
          <p className="type-body-sm py-12 text-center text-ink-soft">
            {side.emptyMessage ?? "Nothing recorded for this quarter."}
          </p>
        ) : (
          <BucketPie
            slices={side.slices}
            figureTitle={`Allocation by bucket, ${label}`}
            tableCaption={`Allocation by bucket, ${label}`}
            subjectHeading={subjectHeading}
            moneyLabel={side.moneyLabel}
            height={PAIRED_HEIGHT}
          />
        )}
      </div>
    </div>
  );
}

export function PairedPies({
  left,
  right,
  subjectHeading = "Bucket",
}: {
  left: PieSide;
  right: PieSide;
  subjectHeading?: string;
}) {
  /**
   * One legend for both pies, not one each.
   *
   * The pies share a colour mapping, so two legends would be two copies of the
   * same key — and a bucket present in only one quarter would appear in only one
   * of them, which reads as a rendering fault rather than as a fact about the
   * data. The union, drawn once, says plainly which buckets are in play.
   */
  const legendItems: { id: string; label: string; color: string }[] = [];
  const seen = new Set<string>();
  for (const slice of [...left.slices, ...right.slices]) {
    if (seen.has(slice.id)) continue;
    seen.add(slice.id);
    legendItems.push({
      id: slice.id,
      label: slice.label,
      color: slice.color,
    });
  }

  return (
    <>
      {/* §8.8 — "Side-by-side quarter panels and paired pies stack vertically
          below --bp-mobile, each keeping its own stamp header." At 768px each
          side still gets ~370px, which a 260px pie and its labels fit; below
          that, two side-by-side pies would be smaller than their own labels. */}
      <div className="flex flex-col gap-8 mobile:flex-row mobile:gap-6">
        <Side side={left} subjectHeading={subjectHeading} />
        <Side side={right} subjectHeading={subjectHeading} />
      </div>
      <ChartLegend items={legendItems} />
    </>
  );
}

/** Both pies' slices, built from one bucket list so colour cannot diverge. */
export function toPieSlices(
  buckets: readonly {
    bucketId: string;
    name: string;
    colorToken: string;
    valueGHS: string;
    pct: number;
  }[],
): PieSlice[] {
  return buckets.map((bucket) => ({
    id: bucket.bucketId,
    label: bucket.name,
    value: Number(bucket.valueGHS),
    pct: bucket.pct,
    money: bucket.valueGHS,
    color: `var(${bucket.colorToken})`,
  }));
}

/** Formats a side's subcaption: the quarter's total. */
export function totalSubcaption(totalGHS: string, pctOfOther?: number): string {
  const total = formatGHSWithUnit(totalGHS);
  return pctOfOther === undefined
    ? total
    : `${total} · ${formatPct(pctOfOther)} of the other quarter`;
}
