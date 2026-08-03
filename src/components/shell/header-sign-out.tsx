"use client";

import { usePathname, useRouter } from "next/navigation";

export function HeaderSignOut() {
  const pathname = usePathname();
  const router = useRouter();

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
    <button
      type="button"
      onClick={handleSignOut}
      className="type-body-sm inline-flex items-center gap-1 text-ink-soft hover:text-ledger-red transition-colors border border-rule px-3 py-1.5 bg-paper"
    >
      Sign Out →
    </button>
  );
}
