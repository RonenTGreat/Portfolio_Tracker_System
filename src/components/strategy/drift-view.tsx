"use client";

/**
 * Drift Over Time — FR-7, design §6.5.
 *
 * Three pieces, in the order §6.5 lists them:
 *   1. a single-stamp quarter picker defaulting to latest;
 *   2. paired actual-vs-target pies for that quarter, "same treatment as 6.4's
 *      paired charts, so a gap is visible as differing slice sizes, not just a
 *      number";
 *   3. the drift-over-time line chart across every quarter on record.
 *
 * Like the compare view, changing the quarter refetches rather than navigating —
 * the picker and the figures below it are one interaction.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Section } from "@/components/ui/page-header";
import { ErrorState } from "@/components/ui/states";
import { VarianceBadge } from "@/components/ui/variance-badge";
import {
  LedgerBody,
  LedgerHead,
  LedgerRow,
  LedgerTable,
  LedgerTableScroll,
  LedgerTd,
  LedgerTh,
} from "@/components/ui/ledger-table";
import { QuarterPanel } from "@/components/compare/quarter-selector";
import { PairedPies } from "@/components/compare/paired-pies";
import { DriftChart } from "@/components/charts/drift-chart";
import type { PieSlice } from "@/components/charts/bucket-pie";
import { readApiError } from "@/lib/api";
import { formatGHSWithUnit, formatPct, toPesewas, fromPesewas } from "@/lib/money";
import { parseISODate, quarterLabel } from "@/lib/quarters";
import type { DriftDTO, QuarterOptionDTO, TargetVsActualRowDTO } from "@/server/compare";

/** The actual-allocation pie: what is held, as a share of the quarter's total. */
function actualSlices(rows: readonly TargetVsActualRowDTO[]): PieSlice[] {
  return rows
    .filter((row) => Number(row.valueGHS) > 0)
    .map((row) => ({
      id: row.bucketId,
      label: row.name,
      value: Number(row.valueGHS),
      pct: row.actualPct,
      money: row.valueGHS,
      color: `var(${row.colorToken})`,
    }));
}

/**
 * The target pie: the same portfolio total, split the way the strategy says.
 *
 * The GHS figure on this side is derived — total × target% — not a recorded
 * amount. It is included because "Crypto should be GHS 4,000, you hold GHS
 * 9,100" is the sentence that makes a 22pp gap concrete, but it is labelled
 * "On plan" rather than "Value" so it can't be mistaken for a real figure.
 */
function targetSlices(
  rows: readonly TargetVsActualRowDTO[],
  totalGHS: string,
): PieSlice[] {
  const totalPesewas = toPesewas(totalGHS);
  return rows
    .filter((row) => row.targetPct !== null && row.targetPct > 0)
    .map((row) => {
      const pct = row.targetPct as number;
      // Integer pesewa arithmetic, rounded once at the end — the same discipline
      // as lib/money, so the slices sum to the total rather than to total ± 0.03.
      const share = BigInt(Math.round((Number(totalPesewas) * pct) / 100));
      return {
        id: row.bucketId,
        label: row.name,
        value: pct,
        pct,
        money: fromPesewas(share),
        color: `var(${row.colorToken})`,
      };
    });
}

export function DriftView({
  options,
  initialDrift,
  initialDate,
}: {
  options: readonly QuarterOptionDTO[];
  initialDrift: DriftDTO;
  initialDate: string;
}) {
  const [date, setDate] = useState(initialDate);
  const [drift, setDrift] = useState(initialDrift);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const latestQuarterDate = options[0]?.quarterDate ?? null;
  const requestRef = useRef(0);

  const load = useCallback(async (quarter: string) => {
    const requestId = ++requestRef.current;
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/compare/target?quarter=${encodeURIComponent(quarter)}`,
      );
      if (requestId !== requestRef.current) return;

      if (!response.ok) {
        setError(await readApiError(response));
        setLoading(false);
        return;
      }

      const body = (await response.json()) as { drift: DriftDTO | null };
      if (requestId !== requestRef.current) return;

      if (!body.drift) {
        setError("Nothing is recorded for that quarter yet.");
        setLoading(false);
        return;
      }

      setDrift(body.drift);
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
    if (date === initialDate) return;
    void load(date);
  }, [date, initialDate, load]);

  const label = quarterLabel(parseISODate(drift.quarterDate));
  const hasTargets = drift.rows.some((row) => row.targetPct !== null);
  const offTarget = drift.rows.filter(
    (row) => row.variancePP !== null && Math.abs(row.variancePP) > 5,
  );

  return (
    <>
      <Section ruled={false}>
        {/* §6.5.1 — "A quarter picker (single stamp, not a pair) defaulting to
            latest." One panel, centred, same control as the compare page. */}
        <div className="flex justify-center">
          <QuarterPanel
            label="Quarter"
            value={date}
            options={options}
            onChange={setDate}
            isLatest={date === latestQuarterDate}
          />
        </div>
      </Section>

      {error && (
        <div className="mb-6">
          <ErrorState message={error} />
        </div>
      )}

      <div
        aria-busy={loading}
        className={[
          "transition-opacity duration-[--duration-panel] ease-[--ease-confident]",
          loading && "opacity-60",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {!hasTargets ? (
          <Section title="Actual vs. target">
            <p className="type-body-lg m-0 max-w-[52ch] text-ink-soft">
              No target applied in {label}, so there is nothing to measure this
              quarter against. Set one on the Targets tab — it applies from the
              quarter you choose onward.
            </p>
          </Section>
        ) : (
          <Section title="Actual vs. target" caption={`as of ${label}`}>
            {/* §6.5.2 — the gap should be visible as differing slice sizes, not
                just a number, so the two pies come before the table. */}
            <PairedPies
              left={{
                quarterDate: drift.quarterDate,
                subcaption: formatGHSWithUnit(drift.totalGHS),
                slices: actualSlices(drift.rows),
              }}
              right={{
                quarterDate: null,
                caption: "Target",
                subcaption:
                  drift.targetTotalPct === null
                    ? undefined
                    : `${formatPct(drift.targetTotalPct)} of the portfolio allocated`,
                moneyLabel: "On plan",
                emptyMessage: "No target applied in this quarter.",
                slices: targetSlices(drift.rows, drift.totalGHS),
              }}
            />

            {offTarget.length > 0 && (
              <p className="type-body-lg mt-8 mb-0 max-w-[68ch] text-ink">
                {offTarget.length === 1
                  ? `${offTarget[0].name} is the one bucket outside its ±5pp band in ${label}.`
                  : `${offTarget.length} buckets are outside their ±5pp band in ${label}: ${offTarget
                      .map((row) => row.name)
                      .join(", ")}.`}
              </p>
            )}

            <LedgerTableScroll>
              <LedgerTable
                className="mt-6"
                caption={`Actual versus target allocation by bucket, ${label}`}
              >
                <LedgerHead>
                  <LedgerRow>
                    <LedgerTh sticky>Bucket</LedgerTh>
                    <LedgerTh numeric>Value</LedgerTh>
                    <LedgerTh numeric>Actual</LedgerTh>
                    <LedgerTh numeric>Target</LedgerTh>
                    <LedgerTh numeric>Variance</LedgerTh>
                  </LedgerRow>
                </LedgerHead>
                <LedgerBody>
                  {drift.rows.map((row) => (
                    <LedgerRow key={row.bucketId}>
                      <LedgerTd sticky>
                        <span className="flex items-center gap-2">
                          {/* §9 — decorative; the name carries the meaning. */}
                          <span
                            aria-hidden="true"
                            className="inline-block h-[10px] w-[10px] shrink-0"
                            style={{ background: `var(${row.colorToken})` }}
                          />
                          {row.name}
                        </span>
                      </LedgerTd>
                      <LedgerTd numeric>
                        {formatGHSWithUnit(row.valueGHS)}
                      </LedgerTd>
                      <LedgerTd numeric>{formatPct(row.actualPct)}</LedgerTd>
                      <LedgerTd numeric>
                        {row.targetPct === null ? (
                          <span className="text-ink-soft">—</span>
                        ) : (
                          formatPct(row.targetPct)
                        )}
                      </LedgerTd>
                      <LedgerTd numeric>
                        {row.variancePP === null ? (
                          <span className="type-body-sm text-ink-soft">
                            no target
                          </span>
                        ) : (
                          <VarianceBadge pp={row.variancePP} />
                        )}
                      </LedgerTd>
                    </LedgerRow>
                  ))}
                </LedgerBody>
              </LedgerTable>
            </LedgerTableScroll>
          </Section>
        )}

        <Section
          title="Drift over time"
          caption={`${drift.series.length} ${drift.series.length === 1 ? "quarter" : "quarters"} on record`}
        >
          {drift.buckets.length === 0 ? (
            <p className="type-body m-0 max-w-[52ch] text-ink-soft">
              No quarter on record had a target applied to it, so there is no
              drift to trace yet. Once a target has been in force for two
              quarters, this chart starts telling you something.
            </p>
          ) : (
            <>
              <p className="type-body mt-0 mb-6 max-w-[68ch] text-ink-soft">
                Each line is one bucket&rsquo;s distance from the target that
                applied in that quarter — not today&rsquo;s target. A line
                walking steadily away from the band is drift; a line that jumps
                is usually a target that changed.
              </p>
              <DriftChart series={drift.series} buckets={drift.buckets} />
            </>
          )}
        </Section>
      </div>
    </>
  );
}
