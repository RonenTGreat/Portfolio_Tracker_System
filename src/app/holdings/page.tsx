import { PageHeader } from "@/components/ui/page-header";
import { HoldingsManager } from "@/components/holdings/holdings-manager";
import { listAllHoldings, listBuckets } from "@/server/holdings";

export const dynamic = "force-dynamic";

export default async function HoldingsPage() {
  const [holdings, buckets] = await Promise.all([
    listAllHoldings(),
    listBuckets(),
  ]);

  return (
    <>
      <PageHeader
        title="Holdings"
        subtitle="Manage funds, tickers, and asset classifications."
      />
      <HoldingsManager initialHoldings={holdings} buckets={buckets} />
    </>
  );
}
