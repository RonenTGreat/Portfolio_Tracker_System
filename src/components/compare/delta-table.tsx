"use client";

/**
 * The FR-6 delta table — design §6.4.4.
 *
 * "Columns Holding / Bucket / Quarter A value / Quarter B value / Δ GHS / Δ %,
 * sortable by clicking any column header (default sort: |Δ GHS| descending, so
 * the biggest mover leads)."
 *
 * FR-6 wants both levels ("per-holding ... per-bucket"), so the level is a
 * toggle over one table rather than two stacked tables: the columns are
 * identical, and two of them would double the page height to say the same thing
 * at two granularities the user is choosing between anyway.
 */

import { useMemo, useState } from "react";
import {
  LedgerBody,
  LedgerHead,
  LedgerRow,
  LedgerTable,
  LedgerTableScroll,
  LedgerTd,
  LedgerTh,
} from "@/components/ui/ledger-table";
import { bucketColor } from "@/lib/buckets";
import {
  formatDelta,
  formatGHSWithUnit,
  formatPctDelta,
  pctChange,
  subMoney,
  sumMoney,
} from "@/lib/money";
import { parseISODate, quarterLabelShort } from "@/lib/quarters";
import type { DeltaRowDTO } from "@/server/compare";

type SortKey = "delta" | "deltaPct" | "label" | "bucket" | "valueA" | "valueB";
type Level = "holding" | "bucket";

/**
 * A signed figure, coloured by direction.
 *
 * FR-6: "up/down indicator or color per row (e.g., green for growth, red for
 * decline), consistent with the variance color-scale already used for target
 * comparison". Note this is a DIFFERENT axis from the variance badge: that one
 * colours over-target red and under-target slate, because over and under a
 * target are not good and bad. Growth and decline are directional in the way
 * §1.1 assigns the palette ("--ledger-green: positive, growth"), so green/red
 * is right here and would be wrong there.
 *
 * §9 — the sign is always rendered, so direction never depends on the colour.
 */
function DeltaFigure({ value, formatted }: { value: number; formatted: string }) {
  const color =
    value === 0
      ? "var(--color-ink-soft)"
      : value > 0
        ? "var(--color-ledger-green)"
        : "var(--color-ledger-red)";

  return (
    <span className="type-data" style={{ color }}>
      {formatted}
      <span className="sr-only-ledger">
        {value === 0 ? " no change" : value > 0 ? " increase" : " decrease"}
      </span>
    </span>
  );
}

export function DeltaTable({
  byHolding,
  byBucket,
  quarterDateA,
  quarterDateB,
  holdingLevelIncomplete,
}: {
  byHolding: readonly DeltaRowDTO[];
  byBucket: readonly DeltaRowDTO[];
  quarterDateA: string;
  quarterDateB: string;
  holdingLevelIncomplete: boolean;
}) {
  // Bucket level is the default when one side is pre-migration: at holding level
  // that quarter has only synthetic aggregates, so every real holding would read
  // as "new" — an artefact of the import, not a move (SRS §8).
  const [level, setLevel] = useState<Level>(
    holdingLevelIncomplete ? "bucket" : "holding",
  );
  const [sortKey, setSortKey] = useState<SortKey>("delta");
  const [descending, setDescending] = useState(true);

  const source = level === "holding" ? byHolding : byBucket;

  const rows = useMemo(() => {
    const copy = [...source];
    copy.sort((a, b) => {
      switch (sortKey) {
        case "label":
          return a.label.localeCompare(b.label);
        case "bucket":
          return (
            a.bucketName.localeCompare(b.bucketName) ||
            a.label.localeCompare(b.label)
          );
        case "valueA":
          return Number(a.valueA) - Number(b.valueA);
        case "valueB":
          return Number(a.valueB) - Number(b.valueB);
        case "deltaPct": {
          // A row with no percentage (grew from zero) sorts last either way: it
          // is not a small change, it has no percentage at all.
          const ap = a.pctChange === null ? -Infinity : Math.abs(a.pctChange);
          const bp = b.pctChange === null ? -Infinity : Math.abs(b.pctChange);
          return ap - bp;
        }
        case "delta":
        default:
          return (
            Math.abs(Number(a.deltaGHS)) - Math.abs(Number(b.deltaGHS))
          );
      }
    });
    return descending ? copy.reverse() : copy;
  }, [source, sortKey, descending]);

  function sort(key: SortKey) {
    if (key === sortKey) {
      setDescending((prev) => !prev);
      return;
    }
    setSortKey(key);
    // Labels read naturally A–Z; every figure column is more useful largest-first.
    setDescending(key !== "label" && key !== "bucket");
  }

  const direction = descending ? ("desc" as const) : ("asc" as const);
  const labelA = quarterLabelShort(parseISODate(quarterDateA));
  const labelB = quarterLabelShort(parseISODate(quarterDateB));

  // Exact decimal arithmetic, not Number(b) - Number(a): this is the row a
  // reader checks the others against, so it is the last place to accept drift.
  const totalA = sumMoney(rows.map((row) => row.valueA));
  const totalB = sumMoney(rows.map((row) => row.valueB));
  const totalDeltaGHS = subMoney(totalB, totalA);
  const totalDelta = Number(totalDeltaGHS);
  const totalPctChange = pctChange(totalA, totalB);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        {/* A two-option segmented control, ruled rather than boxed (§1.4). */}
        <div
          role="group"
          aria-label="Comparison level"
          className="inline-flex overflow-hidden rounded-soft border border-rule"
        >
          {(["holding", "bucket"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setLevel(option)}
              aria-pressed={level === option}
              className={[
                "type-body-sm min-h-[36px] cursor-pointer border-0 px-3 py-1",
                "transition-colors duration-[--duration-hover] ease-[--ease-confident]",
                level === option
                  ? "bg-ink text-paper"
                  : "bg-transparent text-ink-soft hover:bg-paper-raised",
              ].join(" ")}
            >
              {option === "holding" ? "By holding" : "By bucket"}
            </button>
          ))}
        </div>

        <span className="type-body-sm text-ink-soft">
          {rows.length} {rows.length === 1 ? "row" : "rows"}
        </span>
      </div>

      {level === "holding" && holdingLevelIncomplete && (
        <p className="type-body-sm mb-4 border-l-[3px] border-brass bg-paper-raised px-4 py-3 text-ink-soft">
          One of these quarters was imported with bucket-level figures only, so
          it has no per-holding detail. Compare by bucket for a like-for-like
          reading.
        </p>
      )}

      <LedgerTableScroll>
        <LedgerTable
          caption={`Change per ${level} between ${labelA} and ${labelB}, sorted by largest movement`}
        >
          <LedgerHead>
            <LedgerRow>
              <LedgerTh
                sticky
                sortable
                sortDirection={sortKey === "label" ? direction : null}
                onSort={() => sort("label")}
              >
                {level === "holding" ? "Holding" : "Bucket"}
              </LedgerTh>
              {level === "holding" && (
                <LedgerTh
                  sortable
                  sortDirection={sortKey === "bucket" ? direction : null}
                  onSort={() => sort("bucket")}
                >
                  Bucket
                </LedgerTh>
              )}
              <LedgerTh
                numeric
                sortable
                sortDirection={sortKey === "valueA" ? direction : null}
                onSort={() => sort("valueA")}
              >
                {labelA}
              </LedgerTh>
              <LedgerTh
                numeric
                sortable
                sortDirection={sortKey === "valueB" ? direction : null}
                onSort={() => sort("valueB")}
              >
                {labelB}
              </LedgerTh>
              <LedgerTh
                numeric
                sortable
                sortDirection={sortKey === "delta" ? direction : null}
                onSort={() => sort("delta")}
              >
                Δ GHS
              </LedgerTh>
              <LedgerTh
                numeric
                sortable
                sortDirection={sortKey === "deltaPct" ? direction : null}
                onSort={() => sort("deltaPct")}
              >
                Δ %
              </LedgerTh>
            </LedgerRow>
          </LedgerHead>
          <LedgerBody>
            {rows.map((row) => (
              <LedgerRow key={row.id}>
                <LedgerTd sticky>
                  <span className="flex items-center gap-2">
                    {/* §9 — decorative; the name beside it carries the meaning. */}
                    <span
                      aria-hidden="true"
                      className="inline-block h-[10px] w-[10px] shrink-0"
                      style={{
                        background: bucketColor({
                          id: row.bucketId,
                          name: row.bucketName,
                          colorToken: row.colorToken,
                        }),
                      }}
                    />
                    <span className="flex flex-col">
                      <span className="type-data">{row.label}</span>
                      {row.sublabel && (
                        <span className="type-body-sm text-ink-soft">
                          {row.sublabel}
                          {row.isAggregate ? " · imported" : ""}
                        </span>
                      )}
                    </span>
                  </span>
                </LedgerTd>
                {level === "holding" && (
                  <LedgerTd>
                    <span className="type-body-sm">{row.bucketName}</span>
                  </LedgerTd>
                )}
                <LedgerTd numeric>
                  {row.onlyInB ? (
                    <span className="text-ink-soft">—</span>
                  ) : (
                    formatGHSWithUnit(row.valueA)
                  )}
                </LedgerTd>
                <LedgerTd numeric>
                  {row.onlyInA ? (
                    <span className="text-ink-soft">—</span>
                  ) : (
                    formatGHSWithUnit(row.valueB)
                  )}
                </LedgerTd>
                <LedgerTd numeric>
                  <DeltaFigure
                    value={Number(row.deltaGHS)}
                    formatted={formatDelta(row.deltaGHS)}
                  />
                </LedgerTd>
                <LedgerTd numeric>
                  {row.pctChange === null ? (
                    // Not "+100%" and not "∞": there was nothing to grow from.
                    <span className="type-body-sm text-ink-soft">
                      {row.onlyInA ? "closed" : "new"}
                    </span>
                  ) : (
                    <DeltaFigure
                      value={row.pctChange}
                      formatted={formatPctDelta(row.pctChange)}
                    />
                  )}
                </LedgerTd>
              </LedgerRow>
            ))}
            <LedgerRow subtotal>
              <LedgerTd sticky>Total</LedgerTd>
              {level === "holding" && <LedgerTd>{null}</LedgerTd>}
              <LedgerTd numeric>{formatGHSWithUnit(totalA)}</LedgerTd>
              <LedgerTd numeric>{formatGHSWithUnit(totalB)}</LedgerTd>
              <LedgerTd numeric>
                <DeltaFigure
                  value={totalDelta}
                  formatted={formatDelta(totalDeltaGHS)}
                />
              </LedgerTd>
              <LedgerTd numeric>
                {totalPctChange === null ? (
                  <span className="type-body-sm text-ink-soft">—</span>
                ) : (
                  <DeltaFigure
                    value={totalPctChange}
                    formatted={formatPctDelta(totalPctChange)}
                  />
                )}
              </LedgerTd>
            </LedgerRow>
          </LedgerBody>
        </LedgerTable>
      </LedgerTableScroll>
    </>
  );
}
