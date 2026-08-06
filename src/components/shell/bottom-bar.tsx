"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "./nav-items";
import { getNavIcon } from "./nav-icons";

/**
 * Mobile bottom bar — design §8.2.
 *
 * Equispaced navigation tabs for primary pages.
 */
export function BottomBar({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname = usePathname();

  if (pathname === "/sign-in" || pathname.startsWith("/invite")) {
    return null;
  }

  const items = NAV_ITEMS.filter(
    (item) => !("adminOnly" in item && item.adminOnly) || isAdmin,
  );

  return (
    <nav
      aria-label="Mobile Navigation"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-rule bg-paper-raised pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="m-0 flex list-none items-center justify-around p-0 overflow-x-auto">
        {items.map((item) => {
          const active = pathname.startsWith(item.href);
          const icon = getNavIcon(item.href, "w-4 h-4 mb-0.5");

          return (
            <li key={item.href} className="flex-1 min-w-[60px]">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={[
                  "relative flex min-h-[48px] flex-col items-center justify-center px-1 py-1.5 text-center",
                  "no-underline transition-colors",
                  "duration-[--duration-hover] ease-[--ease-confident]",
                  active ? "text-ink font-medium" : "text-ink-soft",
                ].join(" ")}
              >
                {active && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 top-0 h-[3px] bg-brass"
                  />
                )}
                {icon}
                <span className="text-[11px] leading-tight truncate max-w-[64px]">
                  {item.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
