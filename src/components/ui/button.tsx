import Link from "next/link";

/**
 * Buttons — design §5.
 *
 * Primary: ink fill, paper text, shifting to brass on hover.
 * Secondary: transparent with a 1px ink border.
 * Destructive: ledger-red text, no fill, border appearing only on hover.
 *
 * 2px radius throughout (§1.4) — enough to soften, not enough to feel app-like.
 */

type Variant = "primary" | "secondary" | "destructive";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-ink text-paper border border-ink font-medium hover:bg-brass hover:border-brass",
  secondary:
    "bg-transparent text-ink border border-ink hover:bg-paper-raised",
  destructive:
    "bg-transparent text-ledger-red border border-transparent hover:border-ledger-red",
};

const BASE = [
  "type-body inline-flex items-center justify-center gap-2 rounded-soft",
  // 44px min height keeps every button a legal tap target on mobile (§8.9).
  "min-h-[44px] px-4 py-2 md:min-h-0 md:py-[10px]",
  "cursor-pointer no-underline",
  "transition-colors duration-[--duration-hover] ease-[--ease-confident]",
  "disabled:cursor-not-allowed disabled:opacity-50",
].join(" ");

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      className={`${BASE} ${VARIANTS[variant]} ${className}`}
    />
  );
}

// Inherits Link's own href type rather than widening it to `string`, so
// typedRoutes still catches a link to a route that doesn't exist.
type ButtonLinkProps = React.ComponentProps<typeof Link> & {
  variant?: Variant;
};

export function ButtonLink({
  variant = "primary",
  className = "",
  ...props
}: ButtonLinkProps) {
  return (
    <Link {...props} className={`${BASE} ${VARIANTS[variant]} ${className}`} />
  );
}

/**
 * Icon-only button for row actions (edit / delete).
 *
 * §8.9 — on desktop these are revealed on row hover, but on touch there is no
 * hover, so hiding them until interaction makes them undiscoverable. The
 * `group-hover` opacity therefore only applies where hover actually exists;
 * touch devices get them permanently at 60%.
 */
export function IconButton({
  label,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      {...props}
      aria-label={label}
      title={label}
      className={[
        "tap-target inline-flex h-8 w-8 items-center justify-center rounded-soft",
        "cursor-pointer border-0 bg-transparent text-ink-soft",
        "transition-[opacity,color] duration-[--duration-hover] ease-[--ease-confident]",
        "hover:text-ink",
        // hover-capable pointers: hidden until the row is hovered.
        "[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100",
        "[@media(hover:hover)]:group-focus-within:opacity-100",
        // touch: always visible, reduced opacity.
        "[@media(hover:none)]:opacity-60",
        // keyboard users must never lose track of a focused control.
        "focus-visible:opacity-100",
        className,
      ].join(" ")}
    />
  );
}
