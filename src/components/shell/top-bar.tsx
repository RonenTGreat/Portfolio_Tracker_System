"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { WORDMARK } from "./nav-items";
import { SignOutIcon } from "./nav-icons";
import { ThemeToggle } from "@/components/ui/theme-toggle";

export function TopBar() {
  const pathname = usePathname();

  // Hide top bar on sign-in page
  if (pathname === "/sign-in" || pathname.startsWith("/invite")) {
    return null;
  }

  function handleSignOut() {
    fetch("/api/auth/sign-out", { method: "POST", keepalive: true }).catch(() => {});
    window.location.href = "/sign-in";
  }

  return (
    <header className="flex items-center justify-between border-b border-rule bg-paper px-4 py-3 md:hidden">
      <Link href="/dashboard" className="type-display-md text-ink no-underline">
        {WORDMARK}
      </Link>

      <div className="flex items-center gap-2">
        <ThemeToggle iconSize={20} isCollapsed={true} />
        <button
          type="button"
          onClick={handleSignOut}
          title="Sign Out"
          aria-label="Sign Out"
          className="p-1 rounded-md text-ink-soft hover:text-ledger-red transition-colors cursor-pointer"
        >
          <SignOutIcon className="w-3 h-3 shrink-0" />
        </button>
      </div>
    </header>
  );
}
