"use client";

import { useId } from "react";

/**
 * Inputs — design §5.
 *
 * paper-raised fill, 1px rule border, 2px radius. Numeric GHS fields are set in
 * mono (§5) so what you type visually matches how it will display once saved.
 * Focus is a 1.5px slate border — no glow, no shadow (§1.4).
 */

const FIELD = [
  "w-full rounded-soft border border-rule bg-paper-raised",
  "px-3 py-[10px] text-ink",
  // 44px min height for touch (§8.9)
  "min-h-[44px] md:min-h-0",
  "transition-colors duration-[--duration-hover] ease-[--ease-confident]",
  "focus:border-[1.5px] focus:border-slate focus:outline-none",
  "disabled:opacity-50",
].join(" ");

interface TextFieldProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "id"> {
  label: string;
  hint?: string;
  error?: string;
  /** Hide the visible label but keep it for screen readers. */
  labelHidden?: boolean;
}

export function TextField({
  label,
  hint,
  error,
  labelHidden = false,
  className = "",
  ...props
}: TextFieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor={id}
        className={labelHidden ? "sr-only-ledger" : "type-body-sm text-ink"}
      >
        {label}
      </label>
      <input
        id={id}
        {...props}
        aria-describedby={
          [hint && hintId, error && errorId].filter(Boolean).join(" ") ||
          undefined
        }
        aria-invalid={error ? true : undefined}
        className={[
          FIELD,
          "type-body",
          error && "border-ledger-red",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
      />
      {hint && !error && (
        <span id={hintId} className="type-body-sm text-ink-soft">
          {hint}
        </span>
      )}
      {error && (
        <span id={errorId} className="type-body-sm text-ledger-red">
          {error}
        </span>
      )}
    </div>
  );
}

/**
 * GHS money field — §6.2.
 *
 * Mono, right-aligned, with a soft-ink `GHS` prefix sitting inside the field.
 * `inputMode="decimal"` brings up the numeric keypad on mobile, which matters
 * a lot for a form that is 13 numeric fields long.
 *
 * Kept as a text input rather than `type="number"`: number inputs silently
 * mangle values on scroll, reject comma grouping, and vary between browsers on
 * what they consider valid — none of which is acceptable for money.
 */
interface MoneyFieldProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "id" | "type"> {
  label: string;
  error?: string;
  labelHidden?: boolean;
}

export function MoneyField({
  label,
  error,
  labelHidden = false,
  className = "",
  ...props
}: MoneyFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;

  return (
    <div className="flex w-full flex-col gap-1">
      <label
        htmlFor={id}
        className={labelHidden ? "sr-only-ledger" : "type-body-sm text-ink"}
      >
        {label}
      </label>
      <div className="relative">
        <span
          aria-hidden="true"
          className="type-data-sm pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft"
        >
          GHS
        </span>
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          {...props}
          aria-describedby={error ? errorId : undefined}
          aria-invalid={error ? true : undefined}
          className={[
            FIELD,
            "type-data pl-[46px] text-right",
            error && "border-ledger-red",
            className,
          ]
            .filter(Boolean)
            .join(" ")}
        />
      </div>
      {error && (
        <span id={errorId} className="type-body-sm text-ledger-red">
          {error}
        </span>
      )}
    </div>
  );
}

export function SelectField({
  label,
  children,
  labelHidden = false,
  className = "",
  ...props
}: Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "id"> & {
  label: string;
  labelHidden?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor={id}
        className={labelHidden ? "sr-only-ledger" : "type-body-sm text-ink"}
      >
        {label}
      </label>
      <select
        id={id}
        {...props}
        className={`${FIELD} type-body ${className}`}
      >
        {children}
      </select>
    </div>
  );
}

export function Input({
  className = "",
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={[
        FIELD,
        "type-body",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    />
  );
}


