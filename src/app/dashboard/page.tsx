import Link from "next/link";
import { PageHeader, Section, AsOfCaption } from "@/components/ui/page-header";
import { KpiCard, KpiRow } from "@/components/ui/kpi-card";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { TotalValueChart } from "@/components/charts/total-value-chart";
import { CompositionChart } from "@/components/charts/composition-chart";
import { AllocationPie } from "@/components/charts/allocation-pie";
import { TargetBarChart } from "@/components/charts/target-bar-chart";
import { VarianceTable } from "@/components/dashboard/variance-table";
import { getDashboard, type AssetClassKpiDTO } from "@/server/dashboard";
import { ASSET_CLASS_LABELS } from "@/lib/asset-classes";
import {
  formatDelta,
  formatGHSWithUnit,
  formatPct,
  formatPctDelta,
} from "@/lib/money";
import { parseISODate, quarterLabel } from "@/lib/quarters";
import type { AssetClass } from "@/generated/prisma/enums";

/**
 * Dashboard — FR-4, design §6.1.
 *
 * Reads the query layer directly rather than fetching its own /api route, for
 * the same reason /data-entry does: both run in the same process, so an HTTP
 * round trip to localhost buys nothing but latency and a second failure mode.
 */

// Figures change on every write; a cached render would show a stale total.
export const dynamic = "force-dynamic";

/**
 * The two asset-class KPIs §6.1.2 names. Crypto is the volatile one worth
 * watching; "Safety Net" is the cash-and-safety floor.
 *
 * Keyed to AssetClass rather than to a bucket name because asset class is
 * intrinsic and never changes, while a bucket can be renamed — a KPI reading
 * `buckets.find(b => b.name === "Crypto")` would go blank the day someone
 * renames it.
 */
const KPI_ASSET_CLASSES: { assetClass: AssetClass; label: string }[] = [
  { assetClass: "CRYPTO", label: "Crypto" },
  { assetClass: "CASH_SAFETY", label: "Safety Net" },
];

function assetClassKpi(
  rows: readonly AssetClassKpiDTO[],
  assetClass: AssetClass,
) {
  const row = rows.find((r) => r.assetClass === assetClass);
  if (!row) {
    return {
      value: formatPct(0),
      sub: `nothing recorded in ${ASSET_CLASS_LABELS[assetClass]}`,
      tone: "neutral" as const,
    };
  }

  // Tone by DIRECTION against target, matching the variance badge's logic — and
  // only outside the ±5pp tolerance, so a bucket sitting near its target reads
  // as unremarkable rather than as a warning.
  const variance = row.targetPct === null ? null : row.pct - row.targetPct;
  const tone =
    variance === null || Math.abs(variance) <= 5
      ? ("neutral" as const)
      : variance > 0
        ? ("negative" as const)
        : ("positive" as const);

  return {
    value: formatPct(row.pct),
    sub:
      row.targetPct === null
        ? "no target set"
        : `target ${formatPct(row.targetPct)}`,
    tone,
  };
}

import { isRedirectError } from "@/server/auth";

export default async function DashboardPage() {
  let data;
  try {
    data = await getDashboard();
  } catch (cause) {
    if (isRedirectError(cause)) throw cause;
    console.error("[dashboard] failed to load", cause);
    return (
      <>
        <PageHeader title="Dashboard" />
        <ErrorState message="Couldn't load your portfolio — check the database connection and reload." />
      </>
    );
  }

  if (!data.latest) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <EmptyState
          message="Nothing recorded yet. Enter your first quarter to open the ledger."
          action={<ButtonLink href="/data-entry/new">Add Quarter</ButtonLink>}
        />
      </>
    );
  }

  const latestDate = parseISODate(data.latest.quarterDate);
  const latestLabel = quarterLabel(latestDate);
  const firstLabel = quarterLabel(parseISODate(data.totalSeries[0].quarterDate));

  const crypto = assetClassKpi(data.byAssetClass, "CRYPTO");
  const safety = assetClassKpi(data.byAssetClass, "CASH_SAFETY");

  const qoqTone = !data.qoq
    ? ("neutral" as const)
    : Number(data.qoq.deltaGHS) > 0
      ? ("positive" as const)
      : Number(data.qoq.deltaGHS) < 0
        ? ("negative" as const)
        : ("neutral" as const);

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle={
          data.quarterCount > 1
            ? `${firstLabel} — ${latestLabel} · ${data.quarterCount} quarters recorded`
            : `${latestLabel} · 1 quarter recorded`
        }
        action={<ButtonLink href="/data-entry/new">Add Quarter</ButtonLink>}
      />

      {/* §6.1.2 — the four FR-4 figures, divided by rules rather than boxed. */}
      <KpiRow>
        <KpiCard
          hero
          label="Total Portfolio Value"
          value={formatGHSWithUnit(data.latest.totalGHS)}
          sub={<AsOfCaption label={latestLabel} />}
        />
        <KpiCard
          label="QoQ Change"
          value={data.qoq ? `GHS ${formatDelta(data.qoq.deltaGHS)}` : "—"}
          tone={qoqTone}
          sub={
            data.qoq
              ? `${
                  data.qoq.pctChange === null
                    ? "no prior base"
                    : formatPctDelta(data.qoq.pctChange)
                } vs. ${quarterLabel(parseISODate(data.qoq.previousQuarterDate))}`
              : "no earlier quarter to compare"
          }
        />
        <KpiCard
          label="Crypto"
          value={crypto.value}
          tone={crypto.tone}
          sub={crypto.sub}
        />
        <KpiCard
          label="Safety Net"
          value={safety.value}
          tone={safety.tone}
          sub={safety.sub}
        />
      </KpiRow>

      {data.latest.isPreMigration && (
        // SRS §8 — the imported quarters hold bucket totals only, so the pie's
        // drill-down and any per-holding reading of this quarter is aggregated.
        <p className="type-body-sm mt-6 border-l-[3px] border-brass bg-paper-raised px-4 py-3 text-ink-soft">
          {latestLabel} was imported at bucket level — its figures are
          aggregated, not per holding.
        </p>
      )}

      {/* §6.1.3 — full-width line chart. */}
      <Section title="Total Portfolio Value Over Time">
        {data.totalSeries.length > 1 ? (
          <TotalValueChart series={data.totalSeries} />
        ) : (
          <p className="type-body-sm m-0 text-ink-soft">
            One quarter recorded. A second quarter draws the trend line.
          </p>
        )}
      </Section>

      {/* §6.1.4 — two columns on desktop, stacked on mobile. */}
      <Section ruled={false}>
        <div className="grid grid-cols-1 gap-8 border-t border-rule pt-8 tablet:grid-cols-2">
          <div className="min-w-0">
            <h2 className="type-display-md m-0 mb-4 text-ink">
              Portfolio Composition Over Time
            </h2>
            {data.composition.length > 1 ? (
              <CompositionChart
                points={data.composition}
                buckets={data.buckets}
              />
            ) : (
              <p className="type-body-sm m-0 text-ink-soft">
                One quarter recorded. Composition over time needs a second.
              </p>
            )}
          </div>

          <div className="min-w-0">
            <h2 className="type-display-md m-0 mb-1 text-ink">
              Current Allocation
            </h2>
            <p className="mb-4">
              <AsOfCaption label={latestLabel} />
            </p>
            <AllocationPie
              allocation={data.allocation}
              asOfLabel={latestLabel}
            />
          </div>
        </div>
      </Section>

      {/* FR-4 — bar chart: target % vs. current % by bucket, with drill-down
          to individual holdings. The visual complement to the variance table
          below: this makes a 20pp gap visible, the table makes it precise. */}
      <Section
        title="Target vs. Current"
        caption={<AsOfCaption label={latestLabel} />}
      >
        <TargetBarChart allocation={data.allocation} />
      </Section>

      {/* §6.1.5 — the variance table, drift first. */}
      <Section
        title="Target vs. Current by Bucket"
        caption={<AsOfCaption label={latestLabel} />}
      >
        <VarianceTable allocation={data.allocation} />
        <p className="type-body-sm mt-4 text-ink-soft">
          Sorted by largest variance. Set or adjust targets on{" "}
          <Link href="/strategy" className="text-ink underline">
            Strategy
          </Link>
          .
        </p>
      </Section>
    </>
  );
}
