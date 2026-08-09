"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS, WORDMARK } from "./nav-items";
import { getNavIcon, SignOutIcon, ToggleChevronIcon } from "./nav-icons";

import { ThemeToggle } from "@/components/ui/theme-toggle";

export function NavRail({
  isAdmin = false,
  isCollapsed = false,
  onToggleCollapse,
}: {
  isAdmin?: boolean;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  const pathname = usePathname();

  if (pathname === "/sign-in" || pathname.startsWith("/invite")) {
    return null;
  }

  const items = NAV_ITEMS.filter(
    (item) => !("adminOnly" in item && item.adminOnly) || isAdmin,
  );

  function handleSignOut() {
    fetch("/api/auth/sign-out", { method: "POST", keepalive: true }).catch(() => {});
    window.location.href = "/sign-in";
  }

  return (
    <nav
      aria-label="Main"
      className={[
        "fixed inset-y-0 left-0 z-20 hidden flex-col justify-between border-r border-rule bg-paper md:flex",
        "transition-all duration-300 ease-[--ease-confident] h-screen select-none",
        "overflow-y-auto overflow-x-hidden [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden",
        isCollapsed ? "w-[60px]" : "w-[200px]",
      ].join(" ")}
    >
      <div className="flex flex-col min-h-0">
        {/* Header with Wordmark and Menu Toggle Button */}
        <div
          className={[
            "flex items-center shrink-0 transition-all duration-300",
            isCollapsed ? "justify-center pt-3 pb-2" : "justify-between px-3 pt-3 pb-2",
          ].join(" ")}
        >
          {!isCollapsed ? (
            <>
              <Link
                href="/dashboard"
                className="type-display-md text-ink no-underline tracking-tight truncate text-[16px] font-medium"
              >
                {WORDMARK}
              </Link>
              {onToggleCollapse && (
                <button
                  type="button"
                  onClick={onToggleCollapse}
                  title="Collapse sidebar"
                  aria-label="Collapse sidebar"
                  className="p-1 rounded-md border border-brass/40 text-brass hover:bg-paper-raised transition-colors cursor-pointer"
                >
                  <ToggleChevronIcon isCollapsed={false} className="w-3.5 h-3.5 shrink-0" />
                </button>
              )}
            </>
          ) : (
            onToggleCollapse && (
              <button
                type="button"
                onClick={onToggleCollapse}
                title="Expand sidebar"
                aria-label="Expand sidebar"
                className="w-7 h-7 border border-brass/60 rounded-md flex items-center justify-center text-brass hover:bg-paper-raised transition-all cursor-pointer"
              >
                <ToggleChevronIcon isCollapsed={true} className="w-3.5 h-3.5 shrink-0" />
              </button>
            )
          )}
        </div>

        {/* Navigation Items List */}
        <ul
          className={[
            "flex list-none flex-col p-0 m-0",
            isCollapsed ? "items-center space-y-0.5 px-1.5 py-1" : "space-y-0.5 px-2 py-1",
          ].join(" ")}
        >
          {items.map((item) => {
            const active = pathname.startsWith(item.href);
            const icon = getNavIcon(
              item.href,
              isCollapsed ? "w-[14px] h-[14px] shrink-0" : "w-4 h-4 shrink-0"
            );

            return (
              <li key={item.href} className="w-full flex justify-center">
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  title={isCollapsed ? item.label : undefined}
                  aria-label={item.label}
                  className={[
                    "relative flex items-center no-underline transition-all duration-150",
                    isCollapsed
                      ? [
                          "justify-center w-7 h-7 rounded-md",
                          active
                            ? "text-brass font-medium"
                            : "text-ink-soft hover:text-ink",
                        ].join(" ")
                      : [
                          "w-full gap-2.5 px-2.5 py-1.5 rounded-md text-[13px]",
                          active
                            ? "bg-paper-raised text-brass font-medium shadow-xs"
                            : "text-ink-soft hover:bg-paper-raised/70 hover:text-ink font-normal",
                        ].join(" "),
                  ].join(" ")}
                >
                  {/* Left edge vertical brass pill bar for active tab */}
                  {active && (
                    <span
                      aria-hidden="true"
                      className={[
                        "absolute top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-r bg-brass",
                        isCollapsed ? "-left-1.5" : "left-0",
                      ].join(" ")}
                    />
                  )}
                  {icon}
                  {!isCollapsed ? (
                    <span className="truncate">{item.label}</span>
                  ) : (
                    <span className="sr-only">{item.label}</span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Footer Controls: Theme Toggle & Sign Out */}
      <div className={["border-t border-rule mt-auto shrink-0 space-y-1", isCollapsed ? "p-1.5 flex flex-col items-center pb-2.5" : "p-2 pb-2.5"].join(" ")}>
        <ThemeToggle isCollapsed={isCollapsed} />
        <button
          type="button"
          onClick={handleSignOut}
          title={isCollapsed ? "Sign Out" : undefined}
          aria-label="Sign Out"
          className={[
            "flex items-center text-ink-soft hover:text-ledger-red transition-all cursor-pointer",
            isCollapsed
              ? "justify-center w-7 h-7 rounded-md"
              : "w-full gap-2.5 px-2.5 py-0.5 text-[13px] text-left rounded-md hover:bg-paper-raised/70",
          ].join(" ")}
        >
          <SignOutIcon className={isCollapsed ? "w-[14px] h-[14px] shrink-0" : "w-4 h-4 shrink-0"} />
          {!isCollapsed ? (
            <span>Sign Out</span>
          ) : (
            <span className="sr-only">Sign Out</span>
          )}
        </button>
      </div>
    </nav>
  );
}
