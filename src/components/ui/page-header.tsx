/**
 * Page furniture — design §3 (top bar) and §6 (page headers).
 *
 * Title left, primary action right. No logo treatment here; the wordmark lives
 * at the top of the nav rail.
 */

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="type-display-lg m-0 text-ink">{title}</h1>
        {subtitle && (
          <p className="type-body-sm m-0 text-ink-soft">{subtitle}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}

/**
 * A dashboard section. Separated by a rule rather than wrapped in a card —
 * §1.4 explicitly rejects "everything in its own rounded card".
 */
export function Section({
  title,
  caption,
  action,
  children,
  ruled = true,
}: {
  title?: string;
  /** The "as of Q2 · 2026" line — mono, per §6.1.4. */
  caption?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  ruled?: boolean;
}) {
  return (
    <section
      className={[
        "py-8",
        ruled && "border-t border-rule first:border-t-0 first:pt-0",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {(title || action) && (
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <div className="flex flex-col gap-1">
            {title && (
              <h2 className="type-display-md m-0 text-ink">{title}</h2>
            )}
            {caption && (
              <span className="type-data-sm text-ink-soft">{caption}</span>
            )}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/**
 * The recurring "as of" caption (§10 asks for this as a shared component since
 * it appears on every single-quarter snapshot chart).
 */
export function AsOfCaption({ label }: { label: string }) {
  return <span className="type-data-sm text-ink-soft">as of {label}</span>;
}
