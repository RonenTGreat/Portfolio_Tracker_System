"use client";

/**
 * The Strategy tabs — design §6.5 ("recommend a tab within Strategy called
 * 'Drift Over Time'").
 *
 * Real routes rather than client-side panels: a tab is a place you can link to,
 * bookmark, and reload into. §3 styles navigation as ledger-page tabs, so these
 * take the same treatment as the nav rail's — a rule underneath and a brass bar
 * on the active one, no pills.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Route } from "next";

const TABS: { href: Route; label: string }[] = [
  { href: "/strategy", label: "Targets" },
  { href: "/strategy/drift", label: "Drift Over Time" },
];

export function StrategyTabs() {
  const pathname = usePathname();

  return (
    <nav aria-label="Strategy sections" className="mb-8 border-b border-rule">
      <ul className="m-0 flex list-none gap-6 p-0">
        {TABS.map((tab) => {
          // Exact match, not startsWith: "/strategy" is a prefix of every tab
          // here, so a prefix test would light both up on the drift tab.
          const active = pathname === tab.href;
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={[
                  "type-body relative -mb-px block px-1 py-3 no-underline",
                  "transition-colors duration-[--duration-hover] ease-[--ease-confident]",
                  active ? "text-ink" : "text-ink-soft hover:text-ink",
                ].join(" ")}
              >
                {tab.label}
                {active && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 bottom-0 h-[3px] bg-brass"
                  />
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
