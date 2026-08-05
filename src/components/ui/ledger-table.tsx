/**
 * Ledger table — design §5.
 *
 * No zebra striping. Rows separated by one hairline rule. Figure columns
 * right-aligned, mono, tabular-nums, so magnitudes compare straight down the
 * column — the alignment discipline of a real ledger sheet (§1.3).
 *
 * A subtotal row takes a 1px --ink top border and weight 600, the way a real
 * ledger rules off a total.
 *
 * §8.6 — below 600px the table may scroll horizontally within itself (never the
 * whole page) with the first column stuck, so row context is never lost. Wrap
 * in <LedgerTableScroll> to opt in.
 */

export function LedgerTableScroll({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">{children}</div>
  );
}

export function LedgerTable({
  children,
  className = "",
  caption,
}: {
  children: React.ReactNode;
  className?: string;
  /** Screen-reader caption. §9 wants every data region self-describing. */
  caption?: string;
}) {
  return (
    <table className={`w-full border-collapse ${className}`}>
      {caption && <caption className="sr-only-ledger">{caption}</caption>}
      {children}
    </table>
  );
}

export function LedgerHead({ children }: { children: React.ReactNode }) {
  return <thead>{children}</thead>;
}

export function LedgerBody({ children }: { children: React.ReactNode }) {
  return <tbody>{children}</tbody>;
}

export function LedgerRow({
  children,
  subtotal = false,
  interactive = false,
  className = "",
}: {
  children: React.ReactNode;
  /** Draws the ink rule above and sets weight 600 (§5). */
  subtotal?: boolean;
  /** Adds the paper-raised hover tint. Only for rows that do something. */
  interactive?: boolean;
  className?: string;
}) {
  return (
    <tr
      className={[
        "border-b border-rule",
        subtotal && "border-t-2 border-t-ink font-semibold",
        // §5 — hover is a background tint only, never a shadow or a lift.
        // §8.9's tap-flash equivalent is added in phase 9.
        interactive &&
          "transition-colors duration-[--duration-hover] ease-[--ease-confident] hover:bg-paper-raised",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </tr>
  );
}

/** Header cell. `numeric` right-aligns it to sit over its figure column. */
export function LedgerTh({
  children,
  numeric = false,
  sortable = false,
  sortDirection,
  onSort,
  className = "",
  sticky = false,
}: {
  children: React.ReactNode;
  numeric?: boolean;
  sortable?: boolean;
  sortDirection?: "asc" | "desc" | null;
  onSort?: () => void;
  className?: string;
  /** §8.6 — freeze the first column during horizontal scroll. */
  sticky?: boolean;
}) {
  const align = numeric ? "text-right" : "text-left";

  return (
    <th
      scope="col"
      aria-sort={
        !sortable
          ? undefined
          : sortDirection === "asc"
            ? "ascending"
            : sortDirection === "desc"
              ? "descending"
              : "none"
      }
      className={[
        "type-body-sm border-b border-rule py-2 px-3 md:px-4 font-normal text-ink-soft",
        align,
        sticky && "sticky left-0 z-10 bg-paper pl-0",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {sortable ? (
        <button
          type="button"
          onClick={onSort}
          className={[
            "tap-target inline-flex cursor-pointer items-center gap-1 border-0 bg-transparent p-0",
            "type-body-sm text-ink-soft hover:text-ink",
            "transition-colors duration-[--duration-hover] ease-[--ease-confident]",
            numeric && "flex-row-reverse",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {children}
          {/* §1.5 — an icon only where it replaces a real action. A sort
              indicator qualifies; a decorative header icon would not. */}
          <span aria-hidden="true" className="type-data-sm">
            {sortDirection === "asc"
              ? "↑"
              : sortDirection === "desc"
                ? "↓"
                : "↕"}
          </span>
        </button>
      ) : (
        children
      )}
    </th>
  );
}

/** Body cell. `numeric` makes it mono + right-aligned — every figure column. */
export function LedgerTd({
  children,
  numeric = false,
  className = "",
  sticky = false,
  colSpan,
}: {
  children: React.ReactNode;
  numeric?: boolean;
  className?: string;
  sticky?: boolean;
  colSpan?: number;
}) {
  return (
    <td
      colSpan={colSpan}
      className={[
        // §8.6 — row height grows on touch for comfortable tap targets.
        "py-3 md:py-2 px-3 md:px-4",
        numeric ? "type-data text-right" : "type-body",
        sticky && "sticky left-0 z-10 bg-inherit pl-0",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </td>
  );
}

/**
 * §6.3 — a group of rows belonging to one bucket takes a 3px left border in
 * that bucket's colour. Applied per GROUP, not per row, so grouping reads
 * without a badge on every line.
 */
export function LedgerGroupHeader({
  label,
  color,
  colSpan,
}: {
  label: string;
  color: string;
  colSpan: number;
}) {
  return (
    <tr>
      <td
        colSpan={colSpan}
        className="type-body-sm border-b border-rule pt-6 pb-2 font-medium text-ink"
        style={{ borderLeft: `3px solid ${color}`, paddingLeft: 12 }}
      >
        {label}
      </td>
    </tr>
  );
}
