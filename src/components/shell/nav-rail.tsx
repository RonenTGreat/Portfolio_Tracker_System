"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS, WORDMARK } from "./nav-items";

/**
 * Desktop left rail — design §3.
 *
 * Styled as ledger-page tabs, not a conventional sidebar: each item is a
 * horizontal label with thin rules above and below, never a rounded pill or an
 * icon-first button. The active item takes --paper-raised with a 3px brass bar
 * on its left edge, like a tab flag.
 */
import { useRouter } from "next/navigation";

export function NavRail({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();

  if (pathname === "/sign-in" || pathname.startsWith("/invite")) {
    return null;
  }

  const items = NAV_ITEMS.filter(
    (item) => !("adminOnly" in item && item.adminOnly) || isAdmin,
  );

  async function handleSignOut() {
    try {
      await fetch("/api/auth/sign-out", { method: "POST" });
      router.push("/sign-in");
      router.refresh();
    } catch {
      // fallback redirect
      window.location.href = "/sign-in";
    }
  }

  return (
    <nav
      aria-label="Main"
      className="fixed inset-y-0 left-0 z-20 hidden w-[240px] flex-col justify-between border-r border-rule bg-paper md:flex"
    >
      <div>
        <div className="px-6 py-4">
          <Link
            href="/dashboard"
            className="type-display-md text-ink no-underline"
          >
            {WORDMARK}
          </Link>
        </div>

        <ul className="flex list-none flex-col p-0">
          {items.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <li key={item.href} className="border-b border-rule first:border-t">
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={[
                    "relative block px-6 py-3 no-underline transition-colors",
                    "duration-[--duration-hover] ease-[--ease-confident]",
                    active
                      ? "bg-paper-raised text-ink"
                      : "text-ink-soft hover:bg-paper-raised hover:text-ink",
                  ].join(" ")}
                >
                  {/* the tab flag — 3px brass on the left edge, not a pill */}
                  {active && (
                    <span
                      aria-hidden="true"
                      className="absolute inset-y-0 left-0 w-[3px] bg-brass"
                    />
                  )}
                  {item.label}
                </Link>
              </li>
            );
          })}

          <div className="p-3 border-t border-rule">
        <button
          type="button"
          onClick={handleSignOut}
          className="type-body-sm w-full text-left text-ink-soft hover:text-ledger-red transition-colors"
        >
          Sign Out →
        </button>
      </div>
        </ul>
      </div>

      
    </nav>
  );
}

