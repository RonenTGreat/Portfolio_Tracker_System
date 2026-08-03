"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "./nav-items";

/**
 * Mobile bottom bar — design §8.2.
 *
 * Same four items, equally spaced, labels still text (no icons introduced).
 * The active-state brass bar rotates from the left edge to the TOP edge, since
 * "left edge" carries no meaning in a horizontal bar. Elevation stays a
 * paper→paper-raised shift plus one hairline rule — no shadow, per §1.4.
 */
export function BottomBar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-rule bg-paper-raised pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="m-0 flex list-none justify-around p-0">
        {NAV_ITEMS.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={[
                  // §8.2 — 44px minimum tap target, padded rather than by
                  // enlarging the label.
                  "relative flex min-h-[44px] items-center justify-center px-1 py-3",
                  "type-body-sm no-underline transition-colors",
                  "duration-[--duration-hover] ease-[--ease-confident]",
                  active ? "text-ink" : "text-ink-soft",
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
