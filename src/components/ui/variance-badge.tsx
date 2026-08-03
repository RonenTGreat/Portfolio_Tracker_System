import { formatPP } from "@/lib/money";

/**
 * Variance badge — design §5.
 *
 * Colour logic: inside the tolerance band it stays quiet (soft ink on
 * paper-raised — nothing to flag). Outside it, colour by DIRECTION, not by
 * good/bad: over-target is ledger-red, under-target is slate.
 *
 * §9 requires the meaning never be carried by colour alone, so the signed
 * number is always rendered — never a bare coloured dot — and the direction is
 * also stated in the accessible label.
 */

interface VarianceBadgeProps {
  /** Variance in percentage POINTS. Positive = over target. */
  pp: number;
  /** Tolerance band, ±pp. Defaults to the ±5pp the spec suggests. */
  tolerance?: number;
  className?: string;
}

export function VarianceBadge({
  pp,
  tolerance = 5,
  className = "",
}: VarianceBadgeProps) {
  const withinTolerance = Math.abs(pp) <= tolerance;
  const over = pp > 0;

  const tone = withinTolerance
    ? { color: "var(--color-ink-soft)", background: "var(--color-paper-raised)" }
    : over
      ? {
          color: "var(--color-ledger-red)",
          background:
            "color-mix(in oklab, var(--color-ledger-red) 12%, transparent)",
        }
      : {
          // --slate-deep for the text; plain --slate is 4.18:1 on paper-raised
          // and misses AA. The 12% tint behind it still uses plain --slate, so
          // the badge reads as the same colour family.
          color: "var(--color-slate-deep)",
          background:
            "color-mix(in oklab, var(--color-slate) 12%, transparent)",
        };

  const direction = pp === 0 ? "on target" : over ? "over target" : "under target";

  return (
    <span
      className={`type-data-sm inline-block rounded-soft px-[6px] py-[2px] ${className}`}
      style={tone}
      title={
        withinTolerance
          ? `${direction}, within ±${tolerance}pp tolerance`
          : `${direction}, outside ±${tolerance}pp tolerance`
      }
    >
      {formatPP(pp)}
      <span className="sr-only-ledger"> {direction}</span>
    </span>
  );
}
