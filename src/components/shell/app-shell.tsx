"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { NavRail } from "./nav-rail";
import { BottomBar } from "./bottom-bar";
import { TopBar } from "./top-bar";
import { ScrollToTop } from "@/components/ui/scroll-to-top";

export function AppShell({
  children,
  isAdmin = false,
}: {
  children: React.ReactNode;
  isAdmin?: boolean;
}) {
  const pathname = usePathname();
  const isAuthPage = pathname === "/sign-in" || pathname.startsWith("/invite");

  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("sidebar_collapsed");
    if (stored !== null) {
      setIsCollapsed(stored === "true");
    }
  }, []);

  const toggleCollapse = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("sidebar_collapsed", String(next));
      return next;
    });
  };

  if (isAuthPage) {
    return (
      <div className="min-h-screen bg-paper">
        <main className="mx-auto max-w-[1200px] py-2 lg:px-4">
          {children}
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden">
      <NavRail
        isAdmin={isAdmin}
        isCollapsed={isCollapsed}
        onToggleCollapse={toggleCollapse}
      />
      <BottomBar isAdmin={isAdmin} />

      <div
        className={[
          "w-full max-w-full overflow-x-hidden transition-[padding] duration-300 ease-[--ease-confident]",
          isCollapsed ? "md:pl-[60px]" : "md:pl-[200px]",
        ].join(" ")}
      >
        <TopBar />
        <main
          className="mx-auto w-full max-w-[1200px] min-w-0 overflow-x-hidden px-2 pt-6 pb-[calc(72px+env(safe-area-inset-bottom)+16px)] md:px-8 md:pt-8 md:pb-16 lg:px-4"
        >
          {children}
        </main>
      </div>
      <ScrollToTop />
    </div>
  );
}
