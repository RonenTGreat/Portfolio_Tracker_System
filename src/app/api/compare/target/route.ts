/**
 * SRS §7:
 *   GET /api/compare/target?quarter=:date
 *     -- target vs. actual variance as of a given quarter, using the target
 *        effective at that date; response includes both the actual-allocation
 *        breakdown and the target-allocation breakdown, so both can be charted
 *        side-by-side (actual pie vs. target pie).
 *
 * "Using the target effective at that date" is the load-bearing clause and the
 * reason this can't be answered from the current targets: FR-3 preserves target
 * history, so a quarter must be measured against what the strategy said then.
 * getDrift resolves that per quarter — see src/server/compare.ts.
 *
 * Without `quarter`, the answer is the latest recorded quarter, matching §6.5.1's
 * "defaulting to latest".
 */

import { badRequest, notFound, ok, serverError } from "@/lib/api";
import { quarterDateString } from "@/lib/validation";
import { getDrift, listQuarterOptions } from "@/server/compare";

export async function GET(request: Request) {
  const quarterParam = new URL(request.url).searchParams.get("quarter");

  try {
    const options = await listQuarterOptions();

    if (options.length === 0) {
      // No quarters is not an error — the ledger is empty. The caller renders
      // §7's empty state rather than a 404.
      return ok({ options, drift: null });
    }

    // Options are newest-first, so [0] is the latest recorded quarter.
    const quarter = quarterParam ?? options[0].quarterDate;

    const parsed = quarterDateString.safeParse(quarter);
    if (!parsed.success) {
      return badRequest(parsed.error.issues[0].message, {
        quarter: parsed.error.issues[0].message,
      });
    }

    const drift = await getDrift(quarter);
    if (!drift) {
      return notFound(`Nothing is recorded for ${quarter} yet.`);
    }

    return ok({ options, drift });
  } catch (cause) {
    return serverError("load the target comparison", cause);
  }
}
