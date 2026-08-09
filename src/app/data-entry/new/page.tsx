import { PageHeader } from "@/components/ui/page-header";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { ButtonLink } from "@/components/ui/button";
import { QuarterForm } from "@/components/data-entry/quarter-form";
import { listEntryHoldings } from "@/server/holdings";
import { listQuarters } from "@/server/quarters";
import { recentQuarterEnds, toISODate } from "@/lib/quarters";

/**
 * Add a quarter — design §6.2.3 recommends a dedicated route over a modal
 * "given how many fields there are", which is right: 13 money fields in a modal
 * on a phone is a scroll trap, and a route is linkable and back-button-correct.
 */

export const dynamic = "force-dynamic";

/** How far back the picker offers. Three years of quarters is enough to record
 *  a missed one without turning the list into a date archive. */
const QUARTERS_OFFERED = 12;

import { isRedirectError } from "@/server/auth";

export default async function NewQuarterPage() {
  let holdings;
  let recorded;
  try {
    [holdings, recorded] = await Promise.all([
      listEntryHoldings(),
      listQuarters(),
    ]);
  } catch (cause) {
    if (isRedirectError(cause)) throw cause;
    console.error("[data-entry/new] failed to load form data", cause);
    return (
      <>
        <PageHeader title="Add Quarter" />
        <ErrorState message="Couldn't load your holdings — check the database connection and reload." />
      </>
    );
  }

  // FR-1: "date must not duplicate an existing quarter". Enforced by the API
  // too, but a date that can't be submitted shouldn't be offered in the first
  // place — a rejection after filling in 13 fields is a wasted round trip.
  const taken = new Set(recorded.map((q) => q.quarterDate));
  const options = recentQuarterEnds(QUARTERS_OFFERED, new Date())
    .map(toISODate)
    .filter((iso) => !taken.has(iso));

  if (holdings.length === 0) {
    return (
      <>
        <PageHeader title="Add Quarter" />
        <EmptyState
          message="There are no active holdings to record. Seed the database, or add a holding first."
          action={<ButtonLink href="/data-entry">Back to Data Entry</ButtonLink>}
        />
      </>
    );
  }

  if (options.length === 0) {
    return (
      <>
        <PageHeader title="Add Quarter" />
        <EmptyState
          message={`Every closed quarter in the last ${QUARTERS_OFFERED / 4} years is already recorded. Edit an existing quarter instead.`}
          action={<ButtonLink href="/data-entry">Back to Data Entry</ButtonLink>}
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Add Quarter"
        subtitle="Enter the GHS value of each holding as at the quarter end."
      />
      <QuarterForm mode="create" holdings={holdings} dateOptions={options} />
    </>
  );
}
