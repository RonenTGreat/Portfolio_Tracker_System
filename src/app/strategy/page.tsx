import { EmptyState, ErrorState } from "@/components/ui/states";
import { StrategyEditor } from "@/components/strategy/strategy-editor";
import { getStrategy } from "@/server/strategy";
import { parseISODate, quarterLabel } from "@/lib/quarters";

/**
 * Strategy → Targets — FR-3, design §6.3.
 *
 * Two tables: bucket-level targets, and the detailed holdings table below a
 * rule, grouped by bucket with the bucket's colour as a 3px left accent per
 * GROUP rather than per row (§6.3.3 — "reinforces grouping without adding a
 * badge to every line").
 *
 * Both levels are editable and save together — FR-3's sum rule ties them, so
 * they cannot be two independent forms. See StrategyEditor for why.
 *
 * The page title and tab bar come from the layout, shared with Drift Over Time.
 */

export const dynamic = "force-dynamic";

import { isRedirectError } from "@/server/auth";

export default async function StrategyPage() {
  let data;
  try {
    data = await getStrategy();
  } catch (cause) {
    if (isRedirectError(cause)) throw cause;
    console.error("[strategy] failed to load", cause);
    return (
      <ErrorState message="Couldn't load your targets — check the database connection and reload." />
    );
  }

  if (data.buckets.length === 0) {
    return (
      <EmptyState message="No buckets yet. Buckets are what a target applies to — add one to start setting targets." />
    );
  }

  return (
    <>
      {!data.latestQuarterDate && (
        <p className="type-body-sm mb-6 border-l-[3px] border-brass bg-paper-raised px-4 py-3 text-ink-soft">
          No quarter recorded yet, so every current percentage reads 0. Targets
          can still be set — they apply from the quarter you choose.
        </p>
      )}

      <StrategyEditor
        buckets={data.buckets}
        holdings={data.holdings}
        effectiveFromOptions={data.effectiveFromOptions}
        latestQuarterLabel={
          data.latestQuarterDate
            ? quarterLabel(parseISODate(data.latestQuarterDate))
            : null
        }
      />
    </>
  );
}
