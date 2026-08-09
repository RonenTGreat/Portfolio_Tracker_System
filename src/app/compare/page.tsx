import { PageHeader } from "@/components/ui/page-header";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { CompareView } from "@/components/compare/compare-view";
import { getComparison, listQuarterOptions } from "@/server/compare";

/**
 * Compare Quarters — FR-6, design §6.4.
 *
 * The first comparison is resolved on the server, so the page arrives with
 * latest-vs-previous already drawn. FR-6 asks for that as "one click, no need to
 * pick dates"; rendering it server-side makes it no clicks, and means the pies
 * and the delta table are in the HTML rather than appearing after a round trip.
 *
 * Subsequent selections are fetched by CompareView from /api/compare/quarters —
 * see the note there on why this is a fetch and not a navigation.
 */

export const dynamic = "force-dynamic";

const SUBTITLE = "Any two quarters, side by side.";

import { isRedirectError } from "@/server/auth";

export default async function ComparePage() {
  let options;
  try {
    options = await listQuarterOptions();
  } catch (cause) {
    if (isRedirectError(cause)) throw cause;
    console.error("[compare] failed to list quarters", cause);
    return (
      <>
        <PageHeader title="Compare Quarters" subtitle={SUBTITLE} />
        <ErrorState message="Couldn't load your quarters — check the database connection and reload." />
      </>
    );
  }

  if (options.length === 0) {
    return (
      <>
        <PageHeader title="Compare Quarters" subtitle={SUBTITLE} />
        {/* §7's exact empty-ledger line. */}
        <EmptyState
          message="Nothing recorded yet. Enter your first quarter to open the ledger."
          action={<ButtonLink href="/data-entry/new">Add Quarter</ButtonLink>}
        />
      </>
    );
  }

  if (options.length === 1) {
    // One quarter is not a broken comparison, it is a young ledger. Saying which
    // quarter exists is what makes the sentence useful rather than a scold.
    return (
      <>
        <PageHeader title="Compare Quarters" subtitle={SUBTITLE} />
        <EmptyState
          message="Only one quarter is on record, so there's nothing to compare it against yet. Enter a second quarter and this page fills in."
          action={<ButtonLink href="/data-entry/new">Add Quarter</ButtonLink>}
        />
      </>
    );
  }

  // Newest-first, so [1] vs [0] is previous vs latest. A delta reads "B minus
  // A", so the earlier quarter goes on the left and growth comes out positive.
  const initialA = options[1].quarterDate;
  const initialB = options[0].quarterDate;

  let comparison;
  try {
    comparison = await getComparison(initialA, initialB);
  } catch (cause) {
    console.error("[compare] failed to load comparison", cause);
    return (
      <>
        <PageHeader title="Compare Quarters" subtitle={SUBTITLE} />
        <ErrorState message="Couldn't load the comparison — check the database connection and reload." />
      </>
    );
  }

  if (!comparison) {
    // Both dates came from listQuarterOptions, so this means they stopped
    // existing between the two reads — a deletion mid-render. Rare, but a null
    // here would otherwise crash the view.
    return (
      <>
        <PageHeader title="Compare Quarters" subtitle={SUBTITLE} />
        <ErrorState message="Those quarters changed while this page was loading. Reload to pick them again." />
      </>
    );
  }

  return (
    <>
      <PageHeader title="Compare Quarters" subtitle={SUBTITLE} />
      <CompareView
        options={options}
        initialComparison={comparison}
        initialA={initialA}
        initialB={initialB}
      />
    </>
  );
}
