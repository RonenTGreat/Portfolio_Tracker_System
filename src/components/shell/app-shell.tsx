import { NavRail } from "./nav-rail";
import { BottomBar } from "./bottom-bar";

/**
 * App shell — design §3.
 *
 * Desktop: fixed 240px left rail. Below --bp-mobile (768px) the rail is
 * replaced by a fixed bottom tab bar (§8.2). Both are rendered and toggled by
 * CSS rather than by measuring the viewport in JS, so the correct one is in the
 * server-rendered HTML and there's no flash of the wrong navigation.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <NavRail />
      <BottomBar />

      {/* Left offset matches the rail width; bottom padding clears the mobile
          bar plus the iOS home indicator (§8.2). */}
      <div className="md:pl-[240px]">
        <main
          className="mx-auto max-w-[1200px] px-4 pt-6 pb-[calc(72px+env(safe-area-inset-bottom)+16px)] md:px-8 md:pt-8 md:pb-16"
          /* §1.3 — 1200px content max-width, 32px side padding, 16px on mobile */
        >
          {children}
        </main>
      </div>
    </div>
  );
}
