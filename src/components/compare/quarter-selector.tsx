"use client";

/**
 * Quarter Selector — design §5, used by §6.4.2.
 *
 * "Two side-by-side stamp-topped panels with a small 'vs.' set in Fraunces
 * italic between them — the one place italics appear in the whole system,
 * reserved for this single connective word to give it a slightly human,
 * handwritten-annotation feel."
 *
 * Each panel's dropdown is "styled as understated text with a small caret, not a
 * heavy select box", so the select is transparent and borderless until hovered
 * or focused. It stays a real <select>: a custom listbox would cost keyboard
 * support and the native mobile picker for no gain here.
 */

import { QuarterStamp } from "@/components/ui/quarter-stamp";
import { formatGHSWithUnit } from "@/lib/money";
import { parseISODate, quarterLabel } from "@/lib/quarters";
import type { QuarterOptionDTO } from "@/server/compare";

/**
 * One stamp-topped panel.
 *
 * Exported because §6.5.1 asks for the same control as a SINGLE picker ("a
 * quarter picker (single stamp, not a pair) defaulting to latest"). One
 * implementation means the stamp, the understated dropdown and the pre-migration
 * note cannot drift apart between the two pages.
 */
export function QuarterPanel({
  value,
  options,
  onChange,
  label,
  isLatest,
}: {
  value: string;
  options: readonly QuarterOptionDTO[];
  onChange: (iso: string) => void;
  /** Accessible name — "Quarter A" / "Quarter B" is not visible text. */
  label: string;
  isLatest: boolean;
}) {
  const selected = options.find((option) => option.quarterDate === value);
  const date = parseISODate(value);

  return (
    <div className="flex flex-1 flex-col items-center gap-2">
      {/* §2 — the latest recorded quarter reads as current; the rest recede. */}
      <QuarterStamp date={date} state={isLatest ? "current" : "past"} size="lg" />

      <label className="sr-only-ledger" htmlFor={`quarter-${label}`}>
        {label}
      </label>
      <div className="relative inline-flex items-center">
        <select
          id={`quarter-${label}`}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={[
            // Understated text, not a heavy select box (§5). The caret is the
            // only chrome until interaction.
            "type-data cursor-pointer appearance-none rounded-soft border border-transparent",
            "bg-transparent py-1 pr-6 pl-2 text-center text-ink",
            "hover:border-rule focus:border-rule focus:bg-paper-raised",
            "transition-colors duration-[--duration-hover] ease-[--ease-confident]",
          ].join(" ")}
        >
          {options.map((option) => (
            <option key={option.quarterDate} value={option.quarterDate}>
              {quarterLabel(parseISODate(option.quarterDate))}
            </option>
          ))}
        </select>
        <span
          aria-hidden="true"
          className="type-data-sm pointer-events-none absolute right-2 text-ink-soft"
        >
          ▾
        </span>
      </div>

      {selected && (
        <p className="type-data-sm m-0 text-ink-soft">
          {formatGHSWithUnit(selected.totalGHS)}
        </p>
      )}
      {selected?.isPreMigration && (
        // SRS §8 — stated on the panel itself, so the reason a per-holding row
        // is missing is visible where the quarter is chosen.
        <p className="type-body-sm m-0 text-center text-ink-soft">
          Bucket-level figures only
        </p>
      )}
    </div>
  );
}

/**
 * The "vs." connector — §5 for the word, §8.8 for its two orientations.
 *
 * §8.8: "The 'vs.' connector (Fraunces italic, §5) rotates from a vertical
 * divider to a horizontal one, centered between the stacked panels, with a short
 * rule extending on each side of the word — reads like a horizontal ledger-page
 * fold rather than a floating word."
 *
 * Both orientations are rendered and one is hidden per breakpoint rather than
 * switched in JS: a `matchMedia` read would be wrong on the server, and this is
 * two spans.
 */
function VsConnector() {
  return (
    <>
      {/* Stacked layout: a fold across the page, rules either side. */}
      <div
        aria-hidden="true"
        className="flex w-full items-center gap-3 mobile:hidden"
      >
        <span className="h-px flex-1 bg-rule" />
        <span className="type-display-md text-ink-soft italic">vs.</span>
        <span className="h-px flex-1 bg-rule" />
      </div>

      {/* Side-by-side layout: aligned to the stamps, not the dropdowns, so it
          reads as an annotation between the two marks. */}
      <span
        aria-hidden="true"
        className="type-display-md mt-6 hidden shrink-0 text-ink-soft italic mobile:inline"
      >
        vs.
      </span>
    </>
  );
}

export function QuarterSelector({
  valueA,
  valueB,
  options,
  onChangeA,
  onChangeB,
  latestQuarterDate,
}: {
  valueA: string;
  valueB: string;
  options: readonly QuarterOptionDTO[];
  onChangeA: (iso: string) => void;
  onChangeB: (iso: string) => void;
  latestQuarterDate: string | null;
}) {
  return (
    // §8.8 — "Side-by-side quarter panels ... stack vertically below
    // --bp-mobile, each keeping its own stamp header." Order stacked is
    // A → vs. → B, which is the source order.
    <div className="flex flex-col items-center gap-6 mobile:flex-row mobile:items-start mobile:justify-center mobile:gap-10">
      <QuarterPanel
        label="Quarter A"
        value={valueA}
        options={options}
        onChange={onChangeA}
        isLatest={valueA === latestQuarterDate}
      />

      <VsConnector />

      <QuarterPanel
        label="Quarter B"
        value={valueB}
        options={options}
        onChange={onChangeB}
        isLatest={valueB === latestQuarterDate}
      />
    </div>
  );
}
