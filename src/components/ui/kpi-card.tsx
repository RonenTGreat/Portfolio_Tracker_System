/**
 * KPI card — design §5.
 *
 * Explicitly NOT a card: no border, no shadow, no background box. Just a
 * tracked uppercase label above a figure, separated from its neighbours by a
 * single hairline rule. The point is "one page, ruled into sections" rather
 * than "four floating widgets".
 *
 * The divider is drawn by the parent row (kpi-row.tsx) rather than per-card,
 * since a trailing rule on the last card would read as an unfinished column.
 */

interface KpiCardProps {
  label: string;
  /** Pre-formatted. Money formatting belongs to lib/money, not here. */
  value: string;
  /** e.g. "vs. Q1 · 2026" or "target 20%" */
  sub?: React.ReactNode;
  /** The hero figure (Total Portfolio Value) gets display-xl, others data-lg. */
  hero?: boolean;
  /** Tints the figure for growth/decline. Omit for neutral figures. */
  tone?: "positive" | "negative" | "neutral";
}

export function KpiCard({
  label,
  value,
  sub,
  hero = false,
  tone = "neutral",
}: KpiCardProps) {
  const toneClass =
    tone === "positive"
      ? "text-ledger-green"
      : tone === "negative"
        ? "text-ledger-red"
        : "text-ink";

  return (
    <div className="flex flex-col gap-1 px-0 py-2 md:px-6 md:first:pl-0 md:last:pr-0">
      <span className="type-label">{label}</span>
      <span
        className={[
          // §1.2 — the hero KPI is the one figure set in the display face;
          // the other three stay mono so they align as a row of figures.
          hero ? "type-display-xl" : "type-data-lg",
          toneClass,
        ].join(" ")}
      >
        {value}
      </span>
      {sub && <span className="type-body-sm text-ink-soft">{sub}</span>}
    </div>
  );
}

/**
 * §8.4 — 4 columns divided by vertical rules on desktop; 2×2 at tablet and
 * mobile with a horizontal rule appearing between the rows; single column
 * below 480px with horizontal rules only.
 *
 * `divide-*` handles this without per-child border juggling: at each
 * breakpoint the flow direction changes, and the divider follows it.
 */
export function KpiRow({ children }: { children: React.ReactNode }) {
  // Divider logic lives in globals.css (.kpi-row) because it depends on grid
  // POSITION, which Tailwind's divide-* utilities can't express.
  return <div className="kpi-row">{children}</div>;
}
