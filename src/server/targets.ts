/**
 * Target allocations — FR-3, scoped per user.
 */

import { db } from "@/lib/db";
import { parseISODate, toISODate } from "@/lib/quarters";
import { requireSessionUser } from "@/server/auth";
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

export async function getEffectiveTargets(
  isoDate: string,
  userIdParam?: string,
): Promise<EffectiveTargets> {
  const userId = userIdParam ?? (await requireSessionUser()).id;
  const rows = await db.targetAllocation.findMany({
    where: { userId, effectiveFrom: { lte: parseISODate(isoDate) } },
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

export async function listTargetHistory(userIdParam?: string): Promise<TargetDTO[]> {
  const userId = userIdParam ?? (await requireSessionUser()).id;
  const rows = await db.targetAllocation.findMany({
    where: { userId },
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

export async function listTargetEffectiveDates(userIdParam?: string): Promise<string[]> {
  const userId = userIdParam ?? (await requireSessionUser()).id;
  const rows = await db.targetAllocation.findMany({
    where: { userId },
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

export async function saveTargets(
  input: CreateTargetsInput,
  userIdParam?: string,
): Promise<SaveTargetsResult> {
  const userId = userIdParam ?? (await requireSessionUser()).id;
  const bucketIds = input.targets
    .map((t) => t.bucketId)
    .filter((id): id is string => Boolean(id));
  const holdingIds = input.targets
    .map((t) => t.holdingId)
    .filter((id): id is string => Boolean(id));

  // --- Subjects must exist for this user -----------------------------------
  const [buckets, holdings] = await Promise.all([
    db.bucket.findMany({
      where: { userId, id: { in: bucketIds } },
      select: { id: true, name: true },
    }),
    db.holding.findMany({
      where: { userId, id: { in: holdingIds } },
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
    const existing = await getEffectiveTargets(input.effectiveFrom, userId);
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
              userId_bucketId_effectiveFrom: {
                userId,
                bucketId: target.bucketId,
                effectiveFrom,
              },
            },
            create: {
              userId,
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
              userId_holdingId_effectiveFrom: {
                userId,
                holdingId: target.holdingId!,
                effectiveFrom,
              },
            },
            create: {
              userId,
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
