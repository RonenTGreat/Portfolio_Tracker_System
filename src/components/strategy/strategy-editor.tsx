"use client";

/**
 * Target management — FR-3, design §6.3.
 *
 * Both levels live in one component and save in one request, because FR-3's rule
 * ties them together: "Holding level ... must sum to the bucket's target,
 * validated on save". Two independent forms would make a valid end state
 * unreachable — lowering a bucket's target and lowering its holdings to match
 * would each be rejected on its own, in whichever order they were attempted.
 *
 * The sum is shown per bucket while editing rather than only on submit. The
 * server enforces it regardless (src/server/targets.ts), but discovering the
 * arithmetic after a round trip means re-deriving which of five buckets is off.
 */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  LedgerBody,
  LedgerGroupHeader,
  LedgerHead,
  LedgerRow,
  LedgerTable,
  LedgerTableScroll,
  LedgerTd,
  LedgerTh,
} from "@/components/ui/ledger-table";
import { VarianceBadge } from "@/components/ui/variance-badge";
import { ErrorState } from "@/components/ui/states";
import {
  PercentCell,
  fromThousandths,
  toThousandths,
} from "./percent-cell";
import { readApiError } from "@/lib/api";
import { ASSET_CLASS_LABELS } from "@/lib/asset-classes";
import { bucketColor } from "@/lib/buckets";
import { formatGHSWithUnit, formatPct, sumMoney } from "@/lib/money";
import { parseISODate, quarterLabel } from "@/lib/quarters";
import { AsOfCaption, Section } from "@/components/ui/page-header";
import type { StrategyBucketRow, StrategyHoldingRow } from "@/server/strategy";

interface TargetsPayload {
  effectiveFrom: string;
  targets: { bucketId?: string; holdingId?: string; targetPct: string }[];
  note: string | null;
}

export function StrategyEditor({
  buckets,
  holdings,
  effectiveFromOptions,
  latestQuarterLabel,
}: {
  buckets: readonly StrategyBucketRow[];
  holdings: readonly StrategyHoldingRow[];
  effectiveFromOptions: readonly string[];
  /** The quarter the "current %" figures are drawn from, or null if none. */
  latestQuarterLabel: string | null;
}) {
  const router = useRouter();

  const initialBuckets = useMemo(() => {
    const seeded: Record<string, string> = {};
    for (const row of buckets) seeded[row.bucketId] = row.targetPct ?? "";
    return seeded;
  }, [buckets]);

  const initialHoldings = useMemo(() => {
    const seeded: Record<string, string> = {};
    for (const row of holdings) seeded[row.holdingId] = row.targetPct ?? "";
    return seeded;
  }, [holdings]);

  const [bucketDrafts, setBucketDrafts] = useState(initialBuckets);
  const [holdingDrafts, setHoldingDrafts] = useState(initialHoldings);
  const [selectedDate, setSelectedDate] = useState(effectiveFromOptions[0]);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  const dirty =
    buckets.some(
      (row) =>
        (bucketDrafts[row.bucketId] ?? "").trim() !==
        (row.targetPct ?? "").trim(),
    ) ||
    holdings.some(
      (row) =>
        (holdingDrafts[row.holdingId] ?? "").trim() !==
        (row.targetPct ?? "").trim(),
    );

  const bucketTotal = useMemo(
    () =>
      buckets.reduce(
        (sum, row) => sum + toThousandths(bucketDrafts[row.bucketId] ?? ""),
        0,
      ),
    [buckets, bucketDrafts],
  );
  const totalIsWhole = bucketTotal === 100_000;

  /** Per bucket: the sum of its holdings' drafts, and whether it balances. */
  const holdingSums = useMemo(() => {
    const sums = new Map<
      string,
      { sum: number; target: number | null; anySet: boolean }
    >();

    for (const bucket of buckets) {
      const own = holdings.filter((h) => h.bucketId === bucket.bucketId);
      const sum = own.reduce(
        (total, h) => total + toThousandths(holdingDrafts[h.holdingId] ?? ""),
        0,
      );
      const anySet = own.some(
        (h) => (holdingDrafts[h.holdingId] ?? "").trim() !== "",
      );
      const draft = (bucketDrafts[bucket.bucketId] ?? "").trim();
      sums.set(bucket.bucketId, {
        sum,
        target: draft === "" ? null : toThousandths(draft),
        anySet,
      });
    }
    return sums;
  }, [buckets, holdings, holdingDrafts, bucketDrafts]);

  const unbalanced = useMemo(
    () =>
      buckets.filter((bucket) => {
        const entry = holdingSums.get(bucket.bucketId);
        if (!entry || !entry.anySet) return false;
        return entry.target === null || entry.sum !== entry.target;
      }),
    [buckets, holdingSums],
  );

  function setBucketDraft(bucketId: string, raw: string) {
    setConfirmation(null);
    setBucketDrafts((prev) => ({ ...prev, [bucketId]: raw }));
  }

  function setHoldingDraft(holdingId: string, raw: string) {
    setConfirmation(null);
    setHoldingDrafts((prev) => ({ ...prev, [holdingId]: raw }));
  }

  async function handleSave() {
    setError(null);
    setConfirmation(null);

    const payload: TargetsPayload = {
      effectiveFrom: selectedDate,
      targets: [
        ...buckets
          .filter((row) => (bucketDrafts[row.bucketId] ?? "").trim() !== "")
          .map((row) => ({
            bucketId: row.bucketId,
            targetPct: bucketDrafts[row.bucketId].trim(),
          })),
        ...holdings
          .filter((row) => (holdingDrafts[row.holdingId] ?? "").trim() !== "")
          .map((row) => ({
            holdingId: row.holdingId,
            targetPct: holdingDrafts[row.holdingId].trim(),
          })),
      ],
      note: note.trim() || null,
    };

    if (payload.targets.length === 0) {
      setError("Set a target for at least one bucket or holding.");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/targets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        setError(await readApiError(response));
        setSaving(false);
        return;
      }

      // §6.3.4 — the interface's own voice, not a generic "Success!".
      setConfirmation(
        `Target updated for ${quarterLabel(parseISODate(selectedDate))} onward.`,
      );
      setNote("");
      setSaving(false);
      router.refresh();
    } catch {
      setError(
        "Couldn't save the targets — check your connection and try again.",
      );
      setSaving(false);
    }
  }

  const holdingsByBucket = buckets.map((bucket) => ({
    bucket,
    rows: holdings.filter((h) => h.bucketId === bucket.bucketId),
  }));

  return (
    <>
      {error && (
        <div className="mb-6">
          <ErrorState message={error} />
        </div>
      )}

      {confirmation && (
        <p
          role="status"
          className="type-body-sm mb-6 border-l-[3px] border-ledger-green bg-paper-raised px-4 py-3 text-ink"
        >
          {confirmation}
        </p>
      )}

      {/* --- §6.3.2 by-bucket table ------------------------------------------ */}
      <Section
        title="Target vs. Current by Bucket"
        caption={
          latestQuarterLabel ? (
            <AsOfCaption label={latestQuarterLabel} />
          ) : undefined
        }
      >
        <LedgerTableScroll>
          <LedgerTable caption="Target and current allocation by bucket. Target percentages are editable.">
            <LedgerHead>
              <LedgerRow>
                <LedgerTh sticky>Bucket</LedgerTh>
                <LedgerTh numeric>Value</LedgerTh>
                <LedgerTh numeric>Target %</LedgerTh>
                <LedgerTh numeric>Current %</LedgerTh>
                <LedgerTh numeric>Variance</LedgerTh>
              </LedgerRow>
            </LedgerHead>
            <LedgerBody>
              {buckets.map((row) => {
                const draft = bucketDrafts[row.bucketId] ?? "";
                // Variance previews against the DRAFT: seeing what a target
                // change would do is the reason to edit it here at all.
                const preview =
                  draft.trim() === ""
                    ? null
                    : Math.round((row.currentPct - Number(draft)) * 10) / 10;

                return (
                  <LedgerRow key={row.bucketId}>
                    <LedgerTd sticky>
                      <span className="flex items-center gap-2">
                        <span
                          aria-hidden="true"
                          className="inline-block h-[10px] w-[10px] shrink-0"
                          style={{
                            background: bucketColor({
                              id: row.bucketId,
                              name: row.name,
                              colorToken: row.colorToken,
                            }),
                          }}
                        />
                        {row.name}
                      </span>
                    </LedgerTd>
                    <LedgerTd numeric>
                      {formatGHSWithUnit(row.valueGHS)}
                    </LedgerTd>
                    <LedgerTd numeric>
                      <PercentCell
                        value={draft}
                        onChange={(raw) => setBucketDraft(row.bucketId, raw)}
                        label={`Target percentage for ${row.name}`}
                      />
                    </LedgerTd>
                    <LedgerTd numeric>{formatPct(row.currentPct)}</LedgerTd>
                    <LedgerTd numeric>
                      {preview === null ? (
                        <span className="type-body-sm text-ink-soft">
                          no target
                        </span>
                      ) : (
                        <VarianceBadge pp={preview} />
                      )}
                    </LedgerTd>
                  </LedgerRow>
                );
              })}
              <LedgerRow subtotal>
                <LedgerTd sticky>Total</LedgerTd>
                <LedgerTd numeric>
                  {/* sumMoney, not a Number reduce: totals stay exact pesewa
                      arithmetic even in a client component. */}
                  {formatGHSWithUnit(
                    sumMoney(buckets.map((row) => row.valueGHS)),
                  )}
                </LedgerTd>
                <LedgerTd numeric>
                  <span className={totalIsWhole ? "" : "text-ledger-red"}>
                    {formatPct(bucketTotal / 1000)}
                  </span>
                </LedgerTd>
                <LedgerTd numeric>
                  {formatPct(
                    buckets.reduce((sum, row) => sum + row.currentPct, 0),
                  )}
                </LedgerTd>
                <LedgerTd numeric>—</LedgerTd>
              </LedgerRow>
            </LedgerBody>
          </LedgerTable>
        </LedgerTableScroll>

        {/* A 95% total with 5% deliberately unallocated is a real strategy; 105%
            is almost always a typo. Flagged either way, blocked neither way —
            blocking would be the tool overruling the user. */}
        {!totalIsWhole && (
          <p className="type-body-sm mt-4 text-ink-soft">
            Bucket targets total {formatPct(bucketTotal / 1000)}, not 100%.{" "}
            {bucketTotal > 100_000
              ? "That's more than the whole portfolio."
              : `${formatPct((100_000 - bucketTotal) / 1000)} is unallocated.`}
          </p>
        )}
      </Section>

      {/* --- §6.3.3 detailed holdings table --------------------------------- */}
      <Section title="Detailed Holdings">
        <p className="type-body-sm mt-0 mb-4 text-ink-soft">
          A holding&apos;s target is optional. Where set, the holdings in a
          bucket must add up to that bucket&apos;s target.
        </p>

        {holdings.length === 0 ? (
          <p className="type-body-sm m-0 text-ink-soft">
            No active holdings yet.
          </p>
        ) : (
          <LedgerTableScroll>
            <LedgerTable caption="Active holdings grouped by bucket, with editable holding-level targets">
              <LedgerHead>
                <LedgerRow>
                  <LedgerTh sticky>Holding</LedgerTh>
                  <LedgerTh>Type</LedgerTh>
                  <LedgerTh numeric>Target %</LedgerTh>
                  <LedgerTh numeric>Current %</LedgerTh>
                  <LedgerTh>Description</LedgerTh>
                </LedgerRow>
              </LedgerHead>
              <LedgerBody>
                {holdingsByBucket.map(({ bucket, rows }) => {
                  if (rows.length === 0) return null;
                  const sums = holdingSums.get(bucket.bucketId);
                  const balanced =
                    !sums?.anySet ||
                    (sums.target !== null && sums.sum === sums.target);

                  return (
                    <StrategyHoldingGroup
                      key={bucket.bucketId}
                      bucket={bucket}
                      rows={rows}
                      drafts={holdingDrafts}
                      onDraftChange={setHoldingDraft}
                      sum={sums?.sum ?? 0}
                      target={sums?.target ?? null}
                      anySet={sums?.anySet ?? false}
                      balanced={balanced}
                    />
                  );
                })}
              </LedgerBody>
            </LedgerTable>
          </LedgerTableScroll>
        )}

        {unbalanced.length > 0 && (
          <p className="type-body-sm mt-4 border-l-[3px] border-ledger-red bg-paper-raised px-4 py-3 text-ink">
            {unbalanced
              .map((bucket) => {
                const entry = holdingSums.get(bucket.bucketId);
                if (!entry) return "";
                return entry.target === null
                  ? `${bucket.name} needs a bucket target before its holdings can have one.`
                  : `${bucket.name}: holdings add up to ${fromThousandths(entry.sum)}%, but the bucket target is ${fromThousandths(entry.target)}%.`;
              })
              .filter(Boolean)
              .join(" ")}
          </p>
        )}
      </Section>

      {/* --- Effective from + save ------------------------------------------ */}
      <div className="flex flex-wrap items-end gap-6 border-t border-rule pt-8">
        <div className="flex flex-col gap-1">
          <label htmlFor="effective-from" className="type-body-sm text-ink">
            Effective from
          </label>
          <select
            id="effective-from"
            value={selectedDate}
            onChange={(event) => {
              setSelectedDate(event.target.value);
              setConfirmation(null);
            }}
            className="type-data min-h-[44px] rounded-soft border border-rule bg-paper-raised px-3 py-[10px] text-ink md:min-h-0"
          >
            {effectiveFromOptions.map((iso) => (
              <option key={iso} value={iso}>
                {quarterLabel(parseISODate(iso))}
              </option>
            ))}
          </select>
          <span className="type-body-sm text-ink-soft">
            Earlier quarters keep the target they already had.
          </span>
        </div>

        <div className="flex min-w-[240px] flex-1 flex-col gap-1">
          <label htmlFor="target-note" className="type-body-sm text-ink">
            Why (optional)
          </label>
          <input
            id="target-note"
            type="text"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={500}
            placeholder="Trimming crypto after the run-up"
            className="type-body min-h-[44px] w-full rounded-soft border border-rule bg-paper-raised px-3 py-[10px] text-ink md:min-h-0"
          />
          <span className="type-body-sm text-ink-soft">
            Stored with the target, so the change has a reason attached later.
          </span>
        </div>

        <Button
          onClick={handleSave}
          disabled={!dirty || saving || unbalanced.length > 0}
        >
          {saving ? "Saving…" : "Save targets"}
        </Button>
      </div>

      {!dirty && !confirmation && (
        <p className="type-body-sm mt-4 text-ink-soft">
          Click a target percentage to change it
          {latestQuarterLabel
            ? `. Current percentages are as of ${latestQuarterLabel}.`
            : "."}
        </p>
      )}
    </>
  );
}

/**
 * One bucket's group of holding rows: the §6.3.3 colour accent, the rows, and a
 * subtotal line stating whether they add up to the bucket's target.
 *
 * Extracted because a group header, N rows and a subtotal are siblings in a
 * <tbody> — returning them from a mapped fragment needs a keyed wrapper, and a
 * component is a clearer one than <Fragment key>.
 */
function StrategyHoldingGroup({
  bucket,
  rows,
  drafts,
  onDraftChange,
  sum,
  target,
  anySet,
  balanced,
}: {
  bucket: StrategyBucketRow;
  rows: readonly StrategyHoldingRow[];
  drafts: Record<string, string>;
  onDraftChange: (holdingId: string, raw: string) => void;
  sum: number;
  target: number | null;
  anySet: boolean;
  balanced: boolean;
}) {
  // §6.3.3 — the accent is 3px on the GROUP, not a badge on every row.
  const accent = bucketColor({
    id: bucket.bucketId,
    name: bucket.name,
    colorToken: bucket.colorToken,
  });

  return (
    <>
      <LedgerGroupHeader label={bucket.name} color={accent} colSpan={5} />

      {rows.map((holding) => (
        <LedgerRow key={holding.holdingId}>
          <LedgerTd sticky>
            <span className="flex flex-col">
              <span className="type-data">{holding.ticker}</span>
              <span className="type-body-sm text-ink-soft">
                {holding.displayName}
              </span>
            </span>
          </LedgerTd>
          <LedgerTd>{ASSET_CLASS_LABELS[holding.assetClass]}</LedgerTd>
          <LedgerTd numeric>
            <PercentCell
              value={drafts[holding.holdingId] ?? ""}
              onChange={(raw) => onDraftChange(holding.holdingId, raw)}
              label={`Target percentage for ${holding.ticker}`}
            />
          </LedgerTd>
          <LedgerTd numeric>
            <span className="flex flex-col items-end">
              <span>{formatPct(holding.currentPct)}</span>
              <span className="type-data-sm text-ink-soft">
                {formatGHSWithUnit(holding.valueGHS)}
              </span>
            </span>
          </LedgerTd>
          {/* §8.6 — Description drops first on a narrow screen; it is the only
              column whose absence costs nothing. */}
          <LedgerTd className="hidden mobile:table-cell">
            <span className="type-body-sm text-ink-soft">
              {holding.notes ?? "—"}
            </span>
          </LedgerTd>
        </LedgerRow>
      ))}

      {anySet && (
        <LedgerRow>
          <LedgerTd sticky>
            <span className="type-body-sm text-ink-soft">
              {bucket.name} holdings
            </span>
          </LedgerTd>
          <LedgerTd>{null}</LedgerTd>
          <LedgerTd numeric>
            <span
              className={`type-data ${balanced ? "text-ink-soft" : "text-ledger-red"}`}
            >
              {fromThousandths(sum)}%
            </span>
          </LedgerTd>
          <LedgerTd numeric>
            <span className="type-body-sm text-ink-soft">
              {target === null
                ? "no bucket target"
                : balanced
                  ? "balances"
                  : `needs ${fromThousandths(target)}%`}
            </span>
          </LedgerTd>
          <LedgerTd>{null}</LedgerTd>
        </LedgerRow>
      )}
    </>
  );
}
