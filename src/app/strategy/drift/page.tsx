import { ButtonLink } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { DriftView } from "@/components/strategy/drift-view";
import { getDrift, listQuarterOptions } from "@/server/compare";

/**
 * Strategy → Drift Over Time — FR-7, design §6.5.
 *
 * §6.5 leaves the placement to the designer and "recommend[s] a tab within
 * Strategy called 'Drift Over Time'", which is what this is: a sibling route
 * under /strategy, sharing the layout's title and tab bar.
 *
 * It lives under Strategy rather than Compare because the question it answers is
 * "am I keeping to the plan" — the plan is set one tab away, and a target changed
 * on Targets is the first thing you'd want to check here.
 */

export const dynamic = "force-dynamic";

import { isRedirectError } from "@/server/auth";

export default async function DriftPage() {
  let options;
  try {
    options = await listQuarterOptions();
  } catch (cause) {
    if (isRedirectError(cause)) throw cause;
    console.error("[drift] failed to list quarters", cause);
    return (
      <ErrorState message="Couldn't load your quarters — check the database connection and reload." />
    );
  }

  if (options.length === 0) {
    return (
      <EmptyState
        message="Nothing recorded yet. Enter your first quarter to open the ledger."
        action={<ButtonLink href="/data-entry/new">Add Quarter</ButtonLink>}
      />
    );
  }

  // §6.5.1 — the picker defaults to latest, and options are newest-first.
  const initialDate = options[0].quarterDate;

  let drift;
  try {
    drift = await getDrift(initialDate);
  } catch (cause) {
    console.error("[drift] failed to load", cause);
    return (
      <ErrorState message="Couldn't work out your drift from target — check the database connection and reload." />
    );
  }

  if (!drift) {
    return (
      <ErrorState message="That quarter changed while this page was loading. Reload to pick it again." />
    );
  }

  return (
    <DriftView
      options={options}
      initialDrift={drift}
      initialDate={initialDate}
    />
  );
}
