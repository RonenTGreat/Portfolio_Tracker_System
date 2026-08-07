"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { WORDMARK } from "./nav-items";
import {SignOutIcon} from "./nav-icons"

export function TopBar() {
  const pathname = usePathname();
  const router = useRouter();

  // Hide top bar on sign-in page
  if (pathname === "/sign-in" || pathname.startsWith("/invite")) {
    return null;
  }

  async function handleSignOut() {
    try {
      await fetch("/api/auth/sign-out", { method: "POST" });
      router.push("/sign-in");
      router.refresh();
    } catch {
      window.location.href = "/sign-in";
    }
  }

  return (
    <header className="flex items-center justify-between border-b border-rule bg-paper px-4 py-3 md:hidden">
      <Link href="/dashboard" className="type-display-md text-ink no-underline">
        {WORDMARK}
      </Link>

      <button
        type="button"
        onClick={handleSignOut}
        className="type-body-sm text-ink-soft hover:text-ledger-red transition-colors"
      >
        <SignOutIcon className = "w-3 h-3" />
      </button>
    </header>
  );
}
