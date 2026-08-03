"use client";

/**
 * An inline-editable percentage cell — design §6.3.2.
 *
 * "Inline edit on click, not a separate edit mode toggle": the input reads as
 * ordinary table text until hovered or focused, when it takes the paper-raised
 * field treatment. No pencil icon, no edit mode to enter or leave.
 *
 * Shared by the bucket table and the holdings table so both behave identically —
 * the holdings table's cells are the ones that have to add up to the bucket's,
 * and a difference in how they round or reject input would show up as a sum that
 * refuses to balance for no visible reason.
 */

/** Up to 3 decimal places, matching TargetAllocation's Decimal(6,3). */
const PERCENT_PATTERN = /^\d{0,3}(\.\d{0,3})?$/;

export function PercentCell({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (raw: string) => void;
  /** Accessible name — the cell has no visible label of its own. */
  label: string;
}) {
  return (
    <span className="inline-flex items-baseline justify-end gap-1">
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(event) => {
          const raw = event.target.value;
          // Reject the keystroke rather than accept it and complain later: a
          // 4th decimal place cannot be stored, so there is nothing to gain by
          // letting it be typed.
          if (raw !== "" && !PERCENT_PATTERN.test(raw)) return;
          onChange(raw);
        }}
        aria-label={label}
        placeholder="—"
        /* 32px min height is §8.9's floor for a tap-to-edit target, even though
           the visible text is smaller. */
        className={[
          "type-data min-h-[32px] w-[72px] rounded-soft border border-transparent",
          "bg-transparent px-1 py-0 text-right text-ink",
          "hover:border-rule focus:border-rule focus:bg-paper-raised",
          "transition-colors duration-[--duration-hover] ease-[--ease-confident]",
        ].join(" ")}
      />
      <span className="type-data-sm text-ink-soft">%</span>
    </span>
  );
}

/** Percent → integer thousandths. Compared as integers so 33.333 × 3 balances. */
export function toThousandths(pct: string): number {
  const trimmed = pct.trim();
  if (trimmed === "") return 0;
  const [whole, frac = ""] = trimmed.split(".");
  return Number(whole || "0") * 1000 + Number((frac + "000").slice(0, 3));
}

export function fromThousandths(value: number): string {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  const frac = (abs % 1000).toString().padStart(3, "0").replace(/0+$/, "");
  return `${sign}${Math.floor(abs / 1000)}${frac ? `.${frac}` : ""}`;
}
