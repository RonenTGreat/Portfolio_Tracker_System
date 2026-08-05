/**
 * Nav items, shared by the desktop rail and the mobile bottom bar so the two
 * can't drift out of sync. Order is fixed by design §3.
 */
export const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/data-entry", label: "Data Entry" },
  { href: "/strategy", label: "Strategy" },
  { href: "/compare", label: "Compare" },
  { href: "/holdings", label: "Holdings" },
  { href: "/admin", label: "Admin", adminOnly: true },
] as const;

/** §6.1 etc. — the wordmark, set in Fraunces at the top of the rail. */
export const WORDMARK = "Ledger";

