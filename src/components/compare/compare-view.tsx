"use client";

/**
 * Compare Quarters — FR-6, design §6.4.
 *
 * Changing a quarter refetches from /api/compare/quarters rather than reloading
 * the page: the selector, the pies and the table are one interaction, and a full
 * navigation would lose the scroll position and re-stamp the quarter marks on
 * every dropdown change.
 *
 * The initial comparison is server-rendered and passed in, so the first paint
 * already shows latest-vs-previous — FR-6's "one click, no need to pick dates"
 * is really "no clicks at all".
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Section } from "@/components/ui/page-header";
import { ErrorState } from "@/components/ui/states";
import { QuarterSelector } from "./quarter-selector";
import { PairedPies, toPieSlices, totalSubcaption } from "./paired-pies";
import { DeltaTable } from "./delta-table";
import { readApiError } from "@/lib/api";
import { comparisonSummary } from "@/lib/compare-summary";
import type { ComparisonDTO, QuarterOptionDTO } from "@/server/compare";

export function CompareView({
  options,
  initialComparison,
  initialA,
  initialB,
}: {
  options: readonly QuarterOptionDTO[];
  initialComparison: ComparisonDTO;
  initialA: string;
  initialB: string;
}) {
  const [dateA, setDateA] = useState(initialA);
  const [dateB, setDateB] = useState(initialB);
  const [comparison, setComparison] = useState(initialComparison);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Options arrive newest-first, so [0] is the latest recorded quarter.
  const latestQuarterDate = options[0]?.quarterDate ?? null;

  /**
   * Guards against a slow response for an earlier selection landing after a
   * fast one for the current selection — which would show figures for a pair of
   * quarters the dropdowns no longer name.
   */
  const requestRef = useRef(0);

  const load = useCallback(async (from: string, to: string) => {
    const requestId = ++requestRef.current;
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/compare/quarters?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      );
      if (requestId !== requestRef.current) return;

      if (!response.ok) {
        // The route composes a sentence naming the missing quarter; §7 asks that
        // it be rendered as-is rather than replaced with a generic line.
        setError(await readApiError(response));
        setLoading(false);
        return;
      }

      const body = (await response.json()) as {
        comparison: ComparisonDTO | null;
      };
      if (requestId !== requestRef.current) return;

      if (!body.comparison) {
        setError("Those two quarters have nothing recorded to compare.");
        setLoading(false);
        return;
      }

      setComparison(body.comparison);
      setLoading(false);
    } catch {
      if (requestId !== requestRef.current) return;
      setError(
        "Couldn't reach the server — check your connection and try again.",
      );
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // The first render already has the server's comparison for this pair.
    if (dateA === initialA && dateB === initialB) return;
    void load(dateA, dateB);
  }, [dateA, dateB, initialA, initialB, load]);

  const summary = comparisonSummary(
    comparison.byBucket,
    comparison.totalDeltaGHS,
    comparison.totalPctChange,
  );

  return (
    <>
      <Section ruled={false}>
        <QuarterSelector
          valueA={dateA}
          valueB={dateB}
          options={options}
          onChangeA={setDateA}
          onChangeB={setDateB}
          latestQuarterDate={latestQuarterDate}
        />
      </Section>

      {error && (
        <div className="mb-6">
          <ErrorState message={error} />
        </div>
      )}

      {/* The figures stay on screen while a new pair loads, dimmed rather than
          replaced by a skeleton: swapping a populated table for grey blocks on
          every dropdown change reads as the page breaking. */}
      <div
        aria-busy={loading}
        className={
          loading
            ? "opacity-60 transition-opacity duration-[--duration-panel] ease-[--ease-confident]"
            : "transition-opacity duration-[--duration-panel] ease-[--ease-confident]"
        }
      >
        <Section title="Allocation, side by side">
          {/* §8.8 — "Keep the auto-generated summary sentence (§6.4.5) directly
              above the pies at every breakpoint — it's the fastest thing to read
              on a small screen before scrolling into charts/tables." That places
              it here rather than above the table, which is where §6.4.5 alone
              would have put it. */}
          {summary && (
            <p className="type-body-lg mt-0 mb-6 max-w-[68ch] text-ink">
              {summary}
            </p>
          )}

          <PairedPies
            left={{
              quarterDate: comparison.a.quarterDate,
              subcaption: totalSubcaption(comparison.a.totalGHS),
              slices: toPieSlices(comparison.a.buckets),
            }}
            right={{
              quarterDate: comparison.b.quarterDate,
              subcaption: totalSubcaption(comparison.b.totalGHS),
              slices: toPieSlices(comparison.b.buckets),
            }}
          />
        </Section>

        <Section title="What moved">
          <DeltaTable
            byHolding={comparison.byHolding}
            byBucket={comparison.byBucket}
            quarterDateA={comparison.a.quarterDate}
            quarterDateB={comparison.b.quarterDate}
            holdingLevelIncomplete={comparison.holdingLevelIncomplete}
          />
        </Section>
      </div>
    </>
  );
}
