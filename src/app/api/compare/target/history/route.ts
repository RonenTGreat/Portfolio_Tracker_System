/**
 * SRS §7:
 *   GET /api/compare/target/history
 *     -- variance-from-target per bucket, across all quarters
 *        (feeds the "drift over time" trend chart)
 *
 * The series this returns is the same one /api/compare/target carries alongside
 * its single-quarter detail, because getDrift computes both in one pass. Both
 * routes exist anyway: the SRS names them separately, and a caller that wants
 * only the trend — a future export, or the chart refreshing on its own —
 * shouldn't have to name a quarter it doesn't care about to get it.
 *
 * Anchored on the latest recorded quarter, since the series spans every quarter
 * regardless of which one is selected. Each point's variance is measured against
 * the target in force in THAT quarter, not the latest one.
 */

import { ok, serverError } from "@/lib/api";
import { getDrift, listQuarterOptions } from "@/server/compare";

export async function GET() {
  try {
    const options = await listQuarterOptions();
    if (options.length === 0) {
      return ok({ series: [], buckets: [] });
    }

    const drift = await getDrift(options[0].quarterDate);
    if (!drift) {
      // listQuarterOptions just returned this date, so this means it was deleted
      // between the two reads. An empty series is the honest answer, not a 500.
      return ok({ series: [], buckets: [] });
    }

    return ok({ series: drift.series, buckets: drift.buckets });
  } catch (cause) {
    return serverError("load the drift history", cause);
  }
}
