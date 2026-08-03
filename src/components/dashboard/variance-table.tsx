"use client";

/**
 * Target vs. Current by Bucket — FR-4's variance table, design §6.1.5.
 *
 * §6.1.5: "sorted by |variance| descending by default so the most-off-target
 * bucket is the first thing seen — the dashboard should surface drift, not bury
 * it." That default is the whole point of the table, so it is the initial state
 * rather than something the user has to ask for.
 *
 * A client component only because the column sort is interactive. The figures
 * arrive computed from the server; nothing is recalculated here.
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
import { VarianceBadge } from "@/components/ui/variance-badge";
import { bucketColor } from "@/lib/buckets";
import { formatGHSWithUnit, formatPct, sumMoney } from "@/lib/money";
import type { BucketAllocationDTO } from "@/server/dashboard";

type SortKey = "variance" | "name" | "current" | "target" | "value";

export function VarianceTable({
  allocation,
}: {
  allocation: readonly BucketAllocationDTO[];
}) {
  const [sortKey, setSortKey] = useState<SortKey>("variance");
  const [descending, setDescending] = useState(true);

  const rows = useMemo(() => {
    const copy = [...allocation];
    copy.sort((a, b) => {
      switch (sortKey) {
        case "name":
          return a.name.localeCompare(b.name);
        case "current":
          return a.pct - b.pct;
        case "target":
          return (a.targetPct ?? -1) - (b.targetPct ?? -1);
        case "value":
          return Number(a.valueGHS) - Number(b.valueGHS);
        case "variance":
        default: {
          // Buckets with no target sort last in either direction: "no target
          // set" is not a small variance, it's an absent one, and letting it
          // sort as 0 would bury a bucket that has never been given a target.
          const av = a.variancePP === null ? -1 : Math.abs(a.variancePP);
          const bv = b.variancePP === null ? -1 : Math.abs(b.variancePP);
          return av - bv;
        }
      }
    });
    return descending ? copy.reverse() : copy;
  }, [allocation, sortKey, descending]);

  function sort(key: SortKey) {
    if (key === sortKey) {
      setDescending((prev) => !prev);
      return;
    }
    setSortKey(key);
    // Names read naturally A–Z; every figure column is more useful largest-first.
    setDescending(key !== "name");
  }

  const direction = descending ? ("desc" as const) : ("asc" as const);
  const totalValue = sumMoney(allocation.map((bucket) => bucket.valueGHS));
  const totalTarget = allocation.reduce(
    (sum, bucket) => sum + (bucket.targetPct ?? 0),
    0,
  );
  const totalCurrent = allocation.reduce((sum, bucket) => sum + bucket.pct, 0);
  const anyTarget = allocation.some((bucket) => bucket.targetPct !== null);

  return (
    <LedgerTableScroll>
      <LedgerTable caption="Target versus current allocation by bucket, sorted by largest variance">
        <LedgerHead>
          <LedgerRow>
            <LedgerTh
              sticky
              sortable
              sortDirection={sortKey === "name" ? direction : null}
              onSort={() => sort("name")}
            >
              Bucket
            </LedgerTh>
            <LedgerTh
              numeric
              sortable
              sortDirection={sortKey === "value" ? direction : null}
              onSort={() => sort("value")}
            >
              Value
            </LedgerTh>
            <LedgerTh
              numeric
              sortable
              sortDirection={sortKey === "target" ? direction : null}
              onSort={() => sort("target")}
            >
              Target
            </LedgerTh>
            <LedgerTh
              numeric
              sortable
              sortDirection={sortKey === "current" ? direction : null}
              onSort={() => sort("current")}
            >
              Current
            </LedgerTh>
            <LedgerTh
              numeric
              sortable
              sortDirection={sortKey === "variance" ? direction : null}
              onSort={() => sort("variance")}
            >
              Variance
            </LedgerTh>
          </LedgerRow>
        </LedgerHead>
        <LedgerBody>
          {rows.map((bucket) => (
            <LedgerRow key={bucket.bucketId}>
              <LedgerTd sticky>
                <span className="flex items-center gap-2">
                  {/* §9 — the swatch is decorative; the bucket name beside it
                      carries the meaning, never the colour alone. */}
                  <span
                    aria-hidden="true"
                    className="inline-block h-[10px] w-[10px] shrink-0"
                    style={{
                      background: bucketColor({
                        id: bucket.bucketId,
                        name: bucket.name,
                        colorToken: bucket.colorToken,
                      }),
                    }}
                  />
                  {bucket.name}
                </span>
              </LedgerTd>
              <LedgerTd numeric>{formatGHSWithUnit(bucket.valueGHS)}</LedgerTd>
              <LedgerTd numeric>
                {bucket.targetPct === null ? (
                  <span className="text-ink-soft">—</span>
                ) : (
                  formatPct(bucket.targetPct)
                )}
              </LedgerTd>
              <LedgerTd numeric>{formatPct(bucket.pct)}</LedgerTd>
              <LedgerTd numeric>
                {bucket.variancePP === null ? (
                  <span className="type-body-sm text-ink-soft">no target</span>
                ) : (
                  <VarianceBadge pp={bucket.variancePP} />
                )}
              </LedgerTd>
            </LedgerRow>
          ))}
          <LedgerRow subtotal>
            <LedgerTd sticky>Total</LedgerTd>
            <LedgerTd numeric>{formatGHSWithUnit(totalValue)}</LedgerTd>
            <LedgerTd numeric>
              {anyTarget ? formatPct(totalTarget) : "—"}
            </LedgerTd>
            <LedgerTd numeric>{formatPct(totalCurrent)}</LedgerTd>
            <LedgerTd numeric>—</LedgerTd>
          </LedgerRow>
        </LedgerBody>
      </LedgerTable>
    </LedgerTableScroll>
  );
}
