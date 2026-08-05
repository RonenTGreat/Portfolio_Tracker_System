"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "./nav-items";

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
          return (
            <li key={item.href} className="flex-1 min-w-[60px]">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={[
                  "relative flex min-h-[44px] items-center justify-center px-1 py-3 text-center",
                  "type-body-sm no-underline transition-colors",
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
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
