"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, IconButton } from "@/components/ui/button";
import { QuarterStamp } from "@/components/ui/quarter-stamp";
import { ErrorState } from "@/components/ui/states";
import { readApiError } from "@/lib/api";
import { formatGHS } from "@/lib/money";
import { parseISODate, quarterLabel } from "@/lib/quarters";
import type { QuarterSummaryDTO } from "@/server/quarters";

/**
 * The Data Entry history list — design §6.2.2.
 *
 * Reverse-chronological (the server orders it), each row carrying its inline
 * 40px Quarter Stamp, the quarter label, its total, and edit/delete actions.
 * Actions appear on row hover where hover exists and stay visible at 60% on
 * touch (§8.9, handled inside IconButton).
 *
 * A client component because deleting a quarter needs a confirmation step. The
 * confirmation is inline rather than a window.confirm(): the native dialog
 * can't say which quarter or how many figures are about to go, which is the
 * only information that makes the decision answerable.
 */
export function QuarterHistory({
  quarters,
}: {
  quarters: readonly QuarterSummaryDTO[];
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete(quarterDate: string) {
    setError(null);
    setDeleting(quarterDate);

    try {
      const response = await fetch(`/api/quarters/${quarterDate}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        setError(await readApiError(response));
        setDeleting(null);
        return;
      }
      setConfirming(null);
      setDeleting(null);
      router.refresh();
    } catch {
      setError(
        `Couldn't delete ${quarterLabel(parseISODate(quarterDate))} — check your connection and try again.`,
      );
      setDeleting(null);
    }
  }

  return (
    <>
      {error && (
        <div className="mb-6">
          <ErrorState message={error} />
        </div>
      )}

      <ul className="m-0 flex list-none flex-col p-0">
        {quarters.map((quarter, index) => {
          const date = parseISODate(quarter.quarterDate);
          const isConfirming = confirming === quarter.quarterDate;

          return (
            <li
              key={quarter.quarterDate}
              className="group border-b border-rule first:border-t"
            >
              <div className="flex flex-wrap items-center gap-4 py-3">
                {/* §6.2 — small inline stamp. The newest quarter reads as
                    current; the rest recede to 70% (§2). */}
                <QuarterStamp
                  date={date}
                  size="md"
                  state={index === 0 ? "current" : "past"}
                />

                <div className="flex flex-1 flex-col">
                  <span className="type-body text-ink">
                    {quarterLabel(date)}
                  </span>
                  <span className="type-body-sm text-ink-soft">
                    {quarter.entryCount}{" "}
                    {quarter.entryCount === 1 ? "holding" : "holdings"}
                    {/* SRS §8 — imported quarters are bucket-level only, and
                        saying so is the whole point of the flag. */}
                    {quarter.isPreMigration && " · aggregated, pre-migration"}
                  </span>
                </div>

                <span className="type-data text-right text-ink">
                  GHS {formatGHS(quarter.totalGHS)}
                </span>

                <div className="flex items-center gap-1">
                  <IconButton
                    label={`Edit ${quarterLabel(date)}`}
                    onClick={() =>
                      router.push(`/data-entry/${quarter.quarterDate}`)
                    }
                  >
                    {/* §1.5 — Lucide-style single-weight line icons, stroke 1.5,
                        only where an icon replaces a real action. */}
                    <PencilIcon />
                  </IconButton>
                  <IconButton
                    label={`Delete ${quarterLabel(date)}`}
                    onClick={() =>
                      setConfirming(isConfirming ? null : quarter.quarterDate)
                    }
                  >
                    <TrashIcon />
                  </IconButton>
                </div>
              </div>

              {isConfirming && (
                <div
                  role="group"
                  aria-label={`Confirm deleting ${quarterLabel(date)}`}
                  className="flex flex-wrap items-center gap-4 border-l-[3px] border-ledger-red bg-paper-raised px-4 py-3"
                >
                  <p className="type-body-sm m-0 flex-1 text-ink">
                    Delete {quarterLabel(date)} and its {quarter.entryCount}{" "}
                    {quarter.entryCount === 1 ? "figure" : "figures"}? This
                    can&rsquo;t be undone.
                  </p>
                  <Button
                    variant="destructive"
                    disabled={deleting === quarter.quarterDate}
                    onClick={() => handleDelete(quarter.quarterDate)}
                  >
                    {deleting === quarter.quarterDate
                      ? "Deleting…"
                      : "Delete quarter"}
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={deleting === quarter.quarterDate}
                    onClick={() => setConfirming(null)}
                  >
                    Keep it
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <p className="type-body-sm mt-6 text-ink-soft">
        <Link href="/data-entry/new" className="text-ink underline">
          Add a quarter
        </Link>{" "}
        to extend the record.
      </p>
    </>
  );
}

/* §1.5 — stroke-width 1.5, single weight, currentColor so the button's own
   hover colour drives them. */

function PencilIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 6h18" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}
