import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { getHoldingHistory } from "@/server/holdings";
import { formatGHSWithUnit } from "@/lib/money";
import { parseISODate, quarterLabel } from "@/lib/quarters";
import { SingleHoldingChart } from "@/components/charts/single-holding-chart";

export const dynamic = "force-dynamic";

export default async function SingleHoldingPage({
  params,
}: {
  params: Promise<{ ticker: string }>;
}) {
  const { ticker } = await params;
  const data = await getHoldingHistory(decodeURIComponent(ticker));

  if (!data) {
    notFound();
  }

  const { holding, series } = data;
  const latestPoint = series.length > 0 ? series[series.length - 1] : null;

  return (
    <>
      <div className="mb-4">
        <Link href="/holdings" className="type-body-sm text-ink underline">
          ← Back to Holdings
        </Link>
      </div>

      <PageHeader
        title={`${holding.ticker} — ${holding.displayName}`}
        subtitle={`${holding.bucketName} · ${holding.notes || "No notes"}`}
      />

      {latestPoint && (
        <div className="mb-8 border border-rule bg-paper-raised p-6">
          <span className="type-label block mb-1">Latest Value</span>
          <span className="type-display-lg text-ink font-mono">
            {formatGHSWithUnit(latestPoint.valueGHS)}
          </span>
          <span className="type-body-sm block mt-1 text-ink-soft">
            as of {quarterLabel(parseISODate(latestPoint.quarterDate))}
          </span>
        </div>
      )}

      <section className="mb-8 border border-rule bg-paper-raised p-6">
        <h2 className="type-display-md mb-4 text-ink">Historical Performance</h2>
        {series.length > 0 ? (
          <SingleHoldingChart series={series} colorToken={holding.bucketColorToken} />
        ) : (
          <p className="type-body-sm text-ink-soft">
            No quarterly values recorded for this holding yet.
          </p>
        )}
      </section>

      {/* History Ledger Table */}
      <section className="border border-rule bg-paper-raised p-6">
        <h2 className="type-display-md mb-4 text-ink">Quarterly Values</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-rule bg-paper text-ink-soft type-body-sm font-medium">
                <th className="px-4 py-3">Quarter</th>
                <th className="px-4 py-3 text-right">Value (GHS)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule type-body-sm text-ink">
              {[...series].reverse().map((point) => (
                <tr key={point.quarterDate} className="hover:bg-paper">
                  <td className="px-4 py-3 font-mono font-medium">
                    {quarterLabel(parseISODate(point.quarterDate))}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    {formatGHSWithUnit(point.valueGHS)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
