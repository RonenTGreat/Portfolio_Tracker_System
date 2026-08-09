import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { ErrorState } from "@/components/ui/states";
import { QuarterForm } from "@/components/data-entry/quarter-form";
import { listAllHoldings } from "@/server/holdings";
import { getQuarter } from "@/server/quarters";
import { quarterDateString } from "@/lib/validation";
import { parseISODate, quarterLabel } from "@/lib/quarters";

/**
 * Edit a recorded quarter — FR-1 ("user can edit or delete a past quarter's
 * entries").
 *
 * The holdings list here is `listAllHoldings`, not `listEntryHoldings`: a
 * quarter recorded before a holding was retired still has a figure against it,
 * and offering only active holdings would hide that figure while silently
 * deleting it on save (the PATCH treats the submitted set as authoritative).
 * Retired and aggregate rows are shown only when they actually carry a value.
 */

export const dynamic = "force-dynamic";

import { isRedirectError } from "@/server/auth";

export default async function EditQuarterPage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;

  // A malformed segment is a 404 rather than a crash inside parseISODate.
  if (!quarterDateString.safeParse(date).success) notFound();

  let quarter;
  let holdings;
  try {
    [quarter, holdings] = await Promise.all([
      getQuarter(date),
      listAllHoldings(),
    ]);
  } catch (cause) {
    if (isRedirectError(cause)) throw cause;
    console.error("[data-entry/edit] failed to load quarter", cause);
    return (
      <>
        <PageHeader title="Edit Quarter" />
        <ErrorState message="Couldn't load that quarter — check the database connection and reload." />
      </>
    );
  }

  if (!quarter) notFound();

  const recorded = new Map(quarter.entries.map((e) => [e.holdingId, e.valueGHS]));

  // Active, hand-enterable holdings always; anything else only if this quarter
  // already has a figure for it.
  const visible = holdings.filter(
    (h) => (h.isActive && !h.isAggregate) || recorded.has(h.id),
  );

  const initialValues: Record<string, string> = {};
  for (const [holdingId, value] of recorded) initialValues[holdingId] = value;

  return (
    <>
      <PageHeader
        title={`Edit ${quarterLabel(parseISODate(date))}`}
        subtitle={
          quarter.isPreMigration
            ? "Imported pre-migration figures — bucket-level totals only (SRS §8)."
            : "Clearing a field removes that holding's figure from this quarter."
        }
      />
      <QuarterForm
        mode="edit"
        holdings={visible}
        quarterDate={date}
        initialValues={initialValues}
      />
    </>
  );
}
