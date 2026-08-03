/**
 * Quarter labelling and the Quarter Stamp's rotation seed.
 *
 * Design §2 asks for a "slightly irregular / hand-stamped rotation ... seeded
 * per quarter so it's consistent, not random on every render". Determinism
 * matters twice over: the visual intent (a stamp doesn't re-tilt when you
 * scroll past it), and correctness — Math.random() here would produce a
 * different angle on the server than the client and trip a hydration mismatch.
 */

/** A quarter is identified by its END date: 2026-06-30 is Q2 2026. */
export function quarterOf(date: Date): 1 | 2 | 3 | 4 {
  return (Math.floor(date.getUTCMonth() / 3) + 1) as 1 | 2 | 3 | 4;
}

export function yearOf(date: Date): number {
  return date.getUTCFullYear();
}

/** Display form used throughout the UI and inside the stamp: `Q2 · 2026`. */
export function quarterLabel(date: Date): string {
  return `Q${quarterOf(date)} · ${yearOf(date)}`;
}

/** Terse form for axis ticks and dense table headers: `Q2 2026`. */
export function quarterLabelShort(date: Date): string {
  return `Q${quarterOf(date)} ${yearOf(date)}`;
}

/** The last calendar day of the quarter containing `date`, at UTC midnight. */
export function quarterEndDate(date: Date): Date {
  const q = quarterOf(date);
  const endMonth = q * 3; // 1->3, 2->6, 3->9, 4->12
  // Day 0 of the following month is the last day of `endMonth`, which handles
  // the 30/31-day split and leap years without a lookup table.
  return new Date(Date.UTC(date.getUTCFullYear(), endMonth, 0));
}

/** The quarter-end immediately before the one containing `date`. */
export function previousQuarterEnd(date: Date): Date {
  const start = new Date(
    Date.UTC(date.getUTCFullYear(), (quarterOf(date) - 1) * 3, 1),
  );
  start.setUTCDate(0); // step back one day, into the previous quarter
  return quarterEndDate(start);
}

/**
 * Stable −4°…+4° tilt for a quarter's stamp (§2).
 * FNV-1a over the ISO date — small, dependency-free, and well-spread for the
 * handful of distinct inputs we ever hash.
 */
export function stampRotation(date: Date): number {
  const key = date.toISOString().slice(0, 10);
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  // 81 steps across [-4, +4] gives 0.1° granularity — enough variety that no
  // two adjacent stamps look aligned, without any of them looking broken.
  const steps = hash % 81;
  return Math.round((steps / 10 - 4) * 10) / 10;
}

/**
 * The most recent quarter end that has actually passed, as of `from`.
 *
 * A quarter can only be recorded once it has closed — `quarterEndDate(from)` is
 * still in the future for most of any given quarter, and offering it would
 * invite recording a quarter that hasn't finished.
 */
export function latestClosedQuarterEnd(from: Date): Date {
  const thisQuarterEnd = quarterEndDate(from);
  return thisQuarterEnd.getTime() <= from.getTime()
    ? thisQuarterEnd
    : previousQuarterEnd(from);
}

/**
 * The last `count` closed quarter ends, most recent first — the options the
 * "add a quarter" picker offers, so the common case is one click rather than
 * typing a date and hoping it's the right last-day-of-month.
 */
export function recentQuarterEnds(count: number, from: Date): Date[] {
  const dates: Date[] = [];
  let cursor = latestClosedQuarterEnd(from);
  for (let i = 0; i < count; i++) {
    dates.push(cursor);
    cursor = previousQuarterEnd(cursor);
  }
  return dates;
}

/** Parse a `YYYY-MM-DD` string as a UTC date, avoiding local-timezone drift. */
export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Format a Date back to `YYYY-MM-DD` for API params and form values. */
export function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Long form for the stamp tooltip (§2): `30 June 2026`. */
export function fullDateLabel(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}
