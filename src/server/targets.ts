/**
 * Target allocations — FR-3.
 *
 * Two rules define this module:
 *
 *  1. Targets are never updated in place. Changing a target writes a NEW row
 *     with a later `effectiveFrom`. That is what makes FR-7 answerable ("was I
 *     already overweight crypto a year ago?") — the variance at a past date has
 *     to be measured against the target that applied *then*, not today's.
 *
 *  2. Holding-level targets must sum to their bucket's target (FR-3,
 *     "validated on save"). Checked here rather than in the form alone, because
 *     a set of targets that doesn't add up makes every holding-level variance
 *     figure downstream quietly wrong.
 *
 * Percentages are compared as integer thousandths, matching Decimal(6,3).
 * `0.1 + 0.2 !== 0.3` would make a legitimate 40 / 30 / 30 split fail the sum
 * check roughly at random.
 */

import { db } from "@/lib/db";
import { parseISODate, toISODate } from "@/lib/quarters";
import type { CreateTargetsInput } from "@/lib/validation";

export interface TargetDTO {
  id: string;
  bucketId: string | null;
  holdingId: string | null;
  /** Percent as a decimal string, for the same reason money is (3dp here). */
  targetPct: string;
  effectiveFrom: string;
  note: string | null;
}

/** The targets in force on a given date, split by level. */
export interface EffectiveTargets {
  byBucket: Map<string, string>;
  byHolding: Map<string, string>;
}

/** Percent → integer thousandths. `"40.5"` → `40500`. */
function toThousandths(pct: string): number {
  const [whole, frac = ""] = pct.trim().split(".");
  return Number(whole || "0") * 1000 + Number((frac + "000").slice(0, 3));
}

function fromThousandths(value: number): string {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  return `${sign}${Math.floor(abs / 1000)}.${(abs % 1000).toString().padStart(3, "0")}`;
}

/* -------------------------------------------------------------------------- */
/* Reads                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The target effective on `isoDate` for every bucket and holding.
 *
 * "Effective" means the latest row not after that date. Rows arrive newest
 * first, so the first sighting of a subject wins and older rows for it are
 * skipped.
 */
export async function getEffectiveTargets(
  isoDate: string,
): Promise<EffectiveTargets> {
  const rows = await db.targetAllocation.findMany({
    where: { effectiveFrom: { lte: parseISODate(isoDate) } },
    select: {
      bucketId: true,
      holdingId: true,
      targetPct: true,
      effectiveFrom: true,
    },
    orderBy: { effectiveFrom: "desc" },
  });

  const byBucket = new Map<string, string>();
  const byHolding = new Map<string, string>();
  for (const row of rows) {
    if (row.bucketId && !byBucket.has(row.bucketId)) {
      byBucket.set(row.bucketId, row.targetPct.toString());
    }
    if (row.holdingId && !byHolding.has(row.holdingId)) {
      byHolding.set(row.holdingId, row.targetPct.toString());
    }
  }
  return { byBucket, byHolding };
}

/** Every target row, newest first — the FR-3 "decision log" reading. */
export async function listTargetHistory(): Promise<TargetDTO[]> {
  const rows = await db.targetAllocation.findMany({
    orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      bucketId: true,
      holdingId: true,
      targetPct: true,
      effectiveFrom: true,
      note: true,
    },
  });

  return rows.map((row) => ({
    id: row.id,
    bucketId: row.bucketId,
    holdingId: row.holdingId,
    targetPct: row.targetPct.toString(),
    effectiveFrom: toISODate(row.effectiveFrom),
    note: row.note,
  }));
}

/** The dates on which targets changed — the "as of" picker's options (FR-7). */
export async function listTargetEffectiveDates(): Promise<string[]> {
  const rows = await db.targetAllocation.findMany({
    distinct: ["effectiveFrom"],
    select: { effectiveFrom: true },
    orderBy: { effectiveFrom: "desc" },
  });
  return rows.map((row) => toISODate(row.effectiveFrom));
}

/* -------------------------------------------------------------------------- */
/* Writes                                                                      */
/* -------------------------------------------------------------------------- */

export type SaveTargetsResult =
  | { ok: true; effectiveFrom: string; count: number }
  | { ok: false; error: string };

/**
 * Save a set of targets, all sharing one `effectiveFrom`.
 *
 * Upsert on (subject, effectiveFrom) rather than blind insert: the schema's
 * `@@unique([bucketId, effectiveFrom])` means a second edit on the same
 * effective date replaces that row instead of creating an ambiguous pair. Edits
 * on a *later* date still create new rows, so history is preserved — it's only
 * "changed my mind before it took effect" that overwrites.
 */
export async function saveTargets(
  input: CreateTargetsInput,
): Promise<SaveTargetsResult> {
  const bucketIds = input.targets
    .map((t) => t.bucketId)
    .filter((id): id is string => Boolean(id));
  const holdingIds = input.targets
    .map((t) => t.holdingId)
    .filter((id): id is string => Boolean(id));

  // --- Subjects must exist -------------------------------------------------
  const [buckets, holdings] = await Promise.all([
    db.bucket.findMany({
      where: { id: { in: bucketIds } },
      select: { id: true, name: true },
    }),
    db.holding.findMany({
      where: { id: { in: holdingIds } },
      select: { id: true, ticker: true, bucketId: true },
    }),
  ]);

  if (buckets.length !== new Set(bucketIds).size) {
    return { ok: false, error: "One of those buckets no longer exists." };
  }
  if (holdings.length !== new Set(holdingIds).size) {
    return { ok: false, error: "One of those holdings no longer exists." };
  }

  // --- FR-3: holding targets must sum to their bucket's target -------------
  const submittedBucketPct = new Map<string, number>();
  for (const target of input.targets) {
    if (target.bucketId) {
      submittedBucketPct.set(target.bucketId, toThousandths(target.targetPct));
    }
  }

  const holdingById = new Map(holdings.map((h) => [h.id, h]));
  const submittedHoldingSum = new Map<string, number>();
  for (const target of input.targets) {
    if (!target.holdingId) continue;
    const holding = holdingById.get(target.holdingId);
    if (!holding) continue;
    submittedHoldingSum.set(
      holding.bucketId,
      (submittedHoldingSum.get(holding.bucketId) ?? 0) +
        toThousandths(target.targetPct),
    );
  }

  if (submittedHoldingSum.size > 0) {
    // A bucket whose target isn't in this submission keeps whatever was already
    // effective on that date — the holdings still have to add up to it.
    const existing = await getEffectiveTargets(input.effectiveFrom);
    const bucketNames = new Map(buckets.map((b) => [b.id, b.name]));

    for (const [bucketId, sum] of submittedHoldingSum) {
      const bucketTarget =
        submittedBucketPct.get(bucketId) ??
        (existing.byBucket.has(bucketId)
          ? toThousandths(existing.byBucket.get(bucketId)!)
          : null);

      if (bucketTarget === null) {
        return {
          ok: false,
          error:
            "Set a target for the bucket before setting targets for the holdings inside it.",
        };
      }

      if (sum !== bucketTarget) {
        // Named, with both figures: "they don't match" leaves the user to do
        // the subtraction themselves.
        const name = bucketNames.get(bucketId) ?? "that bucket";
        return {
          ok: false,
          error: `Holding targets in ${name} add up to ${fromThousandths(sum)}%, but ${name}'s target is ${fromThousandths(bucketTarget)}%. They must match.`,
        };
      }
    }
  }

  // --- Write ---------------------------------------------------------------
  const effectiveFrom = parseISODate(input.effectiveFrom);

  await db.$transaction(
    input.targets.map((target) =>
      target.bucketId
        ? db.targetAllocation.upsert({
            where: {
              bucketId_effectiveFrom: {
                bucketId: target.bucketId,
                effectiveFrom,
              },
            },
            create: {
              bucketId: target.bucketId,
              targetPct: target.targetPct,
              effectiveFrom,
              note: input.note ?? null,
            },
            update: {
              targetPct: target.targetPct,
              note: input.note ?? null,
            },
          })
        : db.targetAllocation.upsert({
            where: {
              holdingId_effectiveFrom: {
                holdingId: target.holdingId!,
                effectiveFrom,
              },
            },
            create: {
              holdingId: target.holdingId!,
              targetPct: target.targetPct,
              effectiveFrom,
              note: input.note ?? null,
            },
            update: {
              targetPct: target.targetPct,
              note: input.note ?? null,
            },
          }),
    ),
  );

  return {
    ok: true,
    effectiveFrom: input.effectiveFrom,
    count: input.targets.length,
  };
}
