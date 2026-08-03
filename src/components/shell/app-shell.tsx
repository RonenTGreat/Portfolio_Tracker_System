import { NavRail } from "./nav-rail";
import { BottomBar } from "./bottom-bar";
import { TopBar } from "./top-bar";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <NavRail />
      <BottomBar />

      <div className="md:pl-[240px]">
        <TopBar />
        <main
          className="mx-auto max-w-[1200px] px-4 pt-6 pb-[calc(72px+env(safe-area-inset-bottom)+16px)] md:px-8 md:pt-8 md:pb-16"
        >
          {children}
        </main>
      </div>
    </div>
  );
}

