"use client";

import { useId, useState } from "react";
import {
  quarterLabel,
  stampRotation,
  fullDateLabel,
  quarterOf,
  yearOf,
} from "@/lib/quarters";

export type StampState = "current" | "past" | "upcoming";
export type StampSize = "sm" | "md" | "lg";

/** §2 uses ~72px; §6.2 an inline 40px; §8.5 drops to ~28px on mobile lines. */
const SIZES: Record<StampSize, number> = { sm: 28, md: 40, lg: 72 };

interface QuarterStampProps {
  date: Date;
  state?: StampState;
  size?: StampSize;
  /** Renders as a button — used on the timeline and for the "+" placeholder. */
  onClick?: () => void;
  className?: string;
}

/**
 * The Quarter Stamp — design §2. The one memorable device in the system:
 * every recorded quarter gets an ink stamp.
 *
 * Three details carry the effect, and all three are easy to get subtly wrong:
 *
 *  - The tilt is SEEDED per quarter (lib/quarters#stampRotation), never random.
 *    Random would re-tilt on every render, and would differ between server and
 *    client badly enough to trip a hydration mismatch.
 *  - The ink bleed is a blurred duplicate of the ring offset 1–2px, not a
 *    drop-shadow — §1.4 forbids shadows anywhere in the system.
 *  - `upcoming` is a dashed outline with a "+", no fill: it's an invitation to
 *    record the quarter, not a record of one.
 */
export function QuarterStamp({
  date,
  state = "past",
  size = "lg",
  onClick,
  className = "",
}: QuarterStampProps) {
  const px = SIZES[size];
  const rotation = stampRotation(date);
  const label = quarterLabel(date);
  const [showTip, setShowTip] = useState(false);
  const tipId = useId();

  const isUpcoming = state === "upcoming";
  // --brass-deep, not --brass: the stamp carries readable text (`Q2 2026`), and
  // plain brass is 2.66:1 on paper, which fails even the 3:1 graphical bar.
  // The deep shade reads as the same warm brass at this size while clearing AA.
  const color = isUpcoming ? "var(--color-ink-soft)" : "var(--color-brass-deep)";
  // §2 — past quarters recede to 70% so the latest one reads as current.
  const opacity = state === "past" ? 0.7 : 1;

  // Type scales with the ring; below ~40px the label is illegible, so the small
  // stamp becomes a plain marker and the detail moves to the tooltip (§8.5).
  const showText = px >= 40;

  const stamp = (
    <span
      className="relative inline-flex shrink-0 items-center justify-center"
      style={{ width: px, height: px }}
    >
      <svg
        width={px}
        height={px}
        viewBox="0 0 72 72"
        role="img"
        aria-label={
          isUpcoming ? `${label} — not yet recorded` : `Quarter ${label}`
        }
        style={{
          transform: `rotate(${rotation}deg)`,
          opacity,
          transition: `transform var(--duration-hover) var(--ease-confident)`,
        }}
      >
        {/* ink bleed: blurred duplicate of the ring, offset 1.5px (§2) */}
        {!isUpcoming && (
          <g
            transform="translate(1.5, 1.5)"
            opacity="0.28"
            style={{ filter: "blur(1.5px)" }}
          >
            <circle
              cx="36"
              cy="36"
              r="32"
              fill="none"
              stroke={color}
              strokeWidth="3"
            />
          </g>
        )}

        <circle
          cx="36"
          cy="36"
          r="32"
          fill="none"
          stroke={color}
          strokeWidth={isUpcoming ? 2 : 3}
          strokeDasharray={isUpcoming ? "5 4" : undefined}
        />

        {/* inner hairline — the double-ring of a real rubber stamp */}
        {!isUpcoming && (
          <circle
            cx="36"
            cy="36"
            r="27"
            fill="none"
            stroke={color}
            strokeWidth="1"
            opacity="0.55"
          />
        )}

        {isUpcoming ? (
          <text
            x="36"
            y="36"
            textAnchor="middle"
            dominantBaseline="central"
            fill={color}
            fontSize="24"
            fontFamily="var(--font-data)"
          >
            +
          </text>
        ) : (
          showText && (
            <>
              <text
                x="36"
                y="31"
                textAnchor="middle"
                dominantBaseline="central"
                fill={color}
                fontSize="15"
                fontFamily="var(--font-data)"
                letterSpacing="0.5"
              >
                Q{quarterOf(date)}
              </text>
              <text
                x="36"
                y="46"
                textAnchor="middle"
                dominantBaseline="central"
                fill={color}
                fontSize="12"
                fontFamily="var(--font-data)"
                letterSpacing="0.5"
              >
                {yearOf(date)}
              </text>
            </>
          )
        )}
      </svg>

      {/* §2 / §8.9 — tooltip on hover AND on tap, since touch has no hover.
          Anchored to the stamp, mono, paper-raised, hairline border, no shadow. */}
      {showTip && (
        <span
          id={tipId}
          role="tooltip"
          className="type-data-sm pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 -translate-x-1/2 whitespace-nowrap rounded-soft border border-rule bg-paper-raised px-2 py-1 text-ink"
        >
          {isUpcoming ? "Not yet recorded" : fullDateLabel(date)}
        </span>
      )}
    </span>
  );

  if (!onClick) {
    return (
      <span
        className={`inline-flex ${className}`}
        onMouseEnter={() => setShowTip(true)}
        onMouseLeave={() => setShowTip(false)}
      >
        {stamp}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setShowTip(true)}
      onMouseLeave={() => setShowTip(false)}
      onFocus={() => setShowTip(true)}
      onBlur={() => setShowTip(false)}
      aria-describedby={showTip ? tipId : undefined}
      className={[
        "inline-flex cursor-pointer border-0 bg-transparent p-0",
        // §2 — a 2px lift on hover. Suppressed under reduced-motion by the
        // global rule in globals.css.
        "transition-transform duration-[--duration-hover] ease-[--ease-confident]",
        "hover:-translate-y-[2px] focus-visible:-translate-y-[2px]",
        className,
      ].join(" ")}
    >
      {stamp}
    </button>
  );
}
