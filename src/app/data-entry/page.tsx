import { PageHeader } from "@/components/ui/page-header";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { ButtonLink } from "@/components/ui/button";
import { QuarterHistory } from "@/components/data-entry/quarter-history";
import { listQuarters } from "@/server/quarters";

/**
 * Data Entry — design §6.2, FR-1.
 *
 * A server component reading the query layer directly rather than fetching its
 * own /api/quarters: the route handler and this page run in the same process, so
 * an HTTP round trip to localhost would add latency and a second failure mode
 * for no benefit. The API exists for clients that aren't this page.
 */

// Financial figures that change on write — a cached render would show a total
// that no longer matches the ledger.
export const dynamic = "force-dynamic";

import { isRedirectError } from "@/server/auth";

export default async function DataEntryPage() {
  let quarters;
  try {
    quarters = await listQuarters();
  } catch (cause) {
    if (isRedirectError(cause)) throw cause;
    console.error("[data-entry] failed to load quarters", cause);
    return (
      <>
        <PageHeader title="Data Entry" />
        <ErrorState message="Couldn't load your quarters — check the database connection and reload." />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Data Entry"
        subtitle={
          quarters.length > 0
            ? `${quarters.length} ${quarters.length === 1 ? "quarter" : "quarters"} recorded`
            : undefined
        }
        action={<ButtonLink href="/data-entry/new">Add Quarter</ButtonLink>}
      />

      {quarters.length === 0 ? (
        // §7's exact wording — an empty ledger is an invitation to write the
        // first entry, not a cartoon.
        <EmptyState
          message="Nothing recorded yet. Enter your first quarter to open the ledger."
          action={<ButtonLink href="/data-entry/new">Add Quarter</ButtonLink>}
        />
      ) : (
        <QuarterHistory quarters={quarters} />
      )}
    </>
  );
}
