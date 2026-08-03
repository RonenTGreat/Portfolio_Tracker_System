/**
 * SRS §7:
 *   GET   /api/targets  -- current target allocations
 *   POST  /api/targets  -- set new targets (bucket + holding level)
 *
 * POST is not an update. FR-3 requires historical targets be preserved, so a new
 * target is a new row with its own `effectiveFrom` (see src/server/targets.ts).
 * The FR-3 sum rule — holding targets must add up to their bucket's target — is
 * enforced in the query layer, since it spans rows and cannot be expressed as a
 * schema-level check on any one of them.
 */

import { badRequest, created, ok, readJson, serverError } from "@/lib/api";
import { createTargetsInput } from "@/lib/validation";
import {
  getEffectiveTargets,
  listTargetHistory,
  saveTargets,
} from "@/server/targets";
import { latestClosedQuarterEnd, toISODate } from "@/lib/quarters";

/**
 * `?asOf=YYYY-MM-DD` answers FR-7's "what was my target on date X". Without it,
 * the default is the targets in force now — which is what the Strategy page and
 * the dashboard both want.
 */
export async function GET(request: Request) {
  const asOf =
    new URL(request.url).searchParams.get("asOf") ??
    toISODate(latestClosedQuarterEnd(new Date()));

  try {
    const [effective, history] = await Promise.all([
      getEffectiveTargets(asOf),
      listTargetHistory(),
    ]);

    return ok({
      asOf,
      // Maps don't survive JSON.stringify — it would emit `{}` and silently
      // hand the client an empty set of targets.
      byBucket: Object.fromEntries(effective.byBucket),
      byHolding: Object.fromEntries(effective.byHolding),
      history,
    });
  } catch (cause) {
    return serverError("load targets", cause);
  }
}

export async function POST(request: Request) {
  const parsed = await readJson(request, createTargetsInput);
  if (!parsed.ok) return parsed.response;

  try {
    const result = await saveTargets(parsed.data);
    // A failed sum check is the user's arithmetic, not a server fault: it comes
    // back as a 400 carrying the sentence saveTargets composed, which already
    // names the bucket and both figures.
    if (!result.ok) return badRequest(result.error);
    return created(result);
  } catch (cause) {
    return serverError("save the targets", cause);
  }
}
