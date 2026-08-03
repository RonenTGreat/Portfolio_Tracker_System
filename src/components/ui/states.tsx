/**
 * Empty, loading and error states — design §7.
 *
 * The voice is specified and worth preserving exactly: plain, specific, no
 * exclamation points, no apology, no "Oops!". An empty ledger is an invitation
 * to write the first entry, not a cartoon — so no illustration, just the line
 * and the action beneath it.
 */

export function EmptyState({
  message,
  action,
}: {
  message: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-6 py-12">
      <p className="type-body-lg m-0 max-w-[48ch] text-ink-soft">{message}</p>
      {action}
    </div>
  );
}

export function ErrorState({
  message,
  action,
}: {
  message: string;
  action?: React.ReactNode;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-4 border-l-[3px] border-ledger-red bg-paper-raised px-4 py-4"
    >
      <p className="type-body m-0 text-ink">{message}</p>
      {action}
    </div>
  );
}

/**
 * §7 — skeletons are rule-coloured blocks in the exact shape of the real
 * content, never a spinner. A spinner says "something is happening"; a skeleton
 * in the shape of ledger rows says "your rows are arriving", which is the more
 * honest signal and doesn't shift the layout when it resolves.
 */
export function SkeletonRows({ rows = 5 }: { rows?: number }) {
  return (
    <div aria-hidden="true" className="flex flex-col">
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="flex items-center justify-between border-b border-rule py-3"
        >
          <span className="h-[14px] w-[35%] bg-rule" />
          <span className="h-[14px] w-[18%] bg-rule" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonBlock({ height = 240 }: { height?: number }) {
  return (
    <div
      aria-hidden="true"
      className="w-full bg-paper-raised"
      style={{ height }}
    />
  );
}

/** Announces a load to screen readers, which see no skeleton. */
export function LoadingAnnouncement({ what }: { what: string }) {
  return (
    <span role="status" aria-live="polite" className="sr-only-ledger">
      Loading {what}
    </span>
  );
}
