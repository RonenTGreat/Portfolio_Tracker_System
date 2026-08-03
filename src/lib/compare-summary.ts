/**
 * The §6.4.5 summary sentence.
 *
 * "A single-sentence auto-generated summary line above the delta table, e.g.
 * 'Crypto grew GHS 1,240 (+22%) while ETFs grew GHS 180 (+6%) between these two
 * quarters.' — written in the interface's own voice per the writing guidance:
 * plain, specific, no exclamation points."
 *
 * A pure function, kept out of the component, because the interesting part is
 * the wording rules and those are worth reading — and testing — without a
 * renderer in the way.
 *
 * Two buckets, not five: the sentence exists to name what moved the needle. A
 * list of every bucket is what the table below it already is, and a sentence
 * that long stops being read.
 */

import { formatGHS, formatPctDelta } from "@/lib/money";

interface Mover {
  label: string;
  deltaGHS: string;
  pctChange: number | null;
}

/** "grew GHS 1,240 (+22%)" / "fell GHS 512 (−9%)" / "grew GHS 400 (new)". */
function movement(mover: Mover): string {
  const delta = Number(mover.deltaGHS);
  const verb = delta >= 0 ? "grew" : "fell";
  const amount = formatGHS(Math.abs(delta));
  // A holding that started at zero has no percentage — saying "+100%" would be
  // a lie and "+∞%" is not a figure. "from nothing" is what actually happened.
  const change =
    mover.pctChange === null
      ? delta >= 0
        ? "from nothing"
        : "to nothing"
      : formatPctDelta(mover.pctChange);
  return `${mover.label} ${verb} GHS ${amount} (${change})`;
}

/**
 * Compose the sentence from the delta rows, which arrive already sorted by
 * |Δ GHS| descending.
 *
 * Returns null when there is nothing worth a sentence — no rows, or nothing
 * moved. An empty summary line is better than "Nothing changed by 0." in the
 * space where a finding should be.
 */
export function comparisonSummary(
  rows: readonly Mover[],
  totalDeltaGHS: string,
  totalPctChange: number | null,
): string | null {
  const movers = rows
    .filter((row) => Number(row.deltaGHS) !== 0)
    .sort(
      (a, b) => Math.abs(Number(b.deltaGHS)) - Math.abs(Number(a.deltaGHS)),
    );

  if (movers.length === 0) {
    return Number(totalDeltaGHS) === 0
      ? "Nothing moved between these two quarters."
      : null;
  }

  const total =
    totalPctChange === null
      ? `GHS ${formatGHS(Math.abs(Number(totalDeltaGHS)))}`
      : `${formatPctDelta(totalPctChange)}`;
  const totalDirection = Number(totalDeltaGHS) >= 0 ? "up" : "down";

  if (movers.length === 1) {
    return `${movement(movers[0])} between these two quarters, with the portfolio ${totalDirection} ${total}.`;
  }

  // "while" reads correctly whether the two moved together or in opposite
  // directions, because each clause carries its own verb.
  return `${movement(movers[0])} while ${movement(movers[1])} between these two quarters, with the portfolio ${totalDirection} ${total}.`;
}
