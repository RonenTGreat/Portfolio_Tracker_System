import { PageHeader } from "@/components/ui/page-header";
import { StrategyTabs } from "@/components/strategy/strategy-tabs";

/**
 * Strategy — FR-3 and FR-7, design §6.3 and §6.5.
 *
 * The header and tabs live in the layout so both tabs share one title and the
 * bar doesn't unmount between them: navigating Targets → Drift keeps the tab
 * strip in place rather than re-rendering it a frame later.
 */
export default function StrategyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <PageHeader
        title="Strategy"
        subtitle="Target allocation, updated quarterly."
      />
      <StrategyTabs />
      {children}
    </>
  );
}
