import React from "react";

/**
 * ThreeDotsMove — Dynamic loading animation where 3 dots slide horizontally back and forth
 * while continuously cycling through design token colors.
 */
export function ThreeDotsMove({
  className = "h-5 w-12 text-current",
  colorCycle = true,
  colors,
}: {
  className?: string;
  colorCycle?: boolean;
  colors?: string[];
}) {
  const customColorString = colors ? colors.join(";") : null;

  return (
    <svg
      viewBox="0 0 56 16"
      fill="currentColor"
      className={`inline-block shrink-0 align-middle ${className}`}
      aria-label="Loading..."
      role="status"
    >
      <circle
        cx="10"
        cy="8"
        r="4"
        className={colorCycle && !customColorString ? "animate-dot-color-1" : undefined}
      >
        <animate
          attributeName="cx"
          values="10;46;10"
          dur="1.2s"
          repeatCount="indefinite"
          keyTimes="0;0.5;1"
          keySplines="0.45 0 0.55 1;0.45 0 0.55 1"
          calcMode="spline"
        />
        <animate
          attributeName="opacity"
          values="0.4;1;0.4"
          dur="1.2s"
          repeatCount="indefinite"
        />
        {colorCycle && customColorString && (
          <animate
            attributeName="fill"
            values={customColorString}
            dur="2.4s"
            repeatCount="indefinite"
          />
        )}
      </circle>
      <circle
        cx="28"
        cy="8"
        r="4"
        className={colorCycle && !customColorString ? "animate-dot-color-2" : undefined}
      >
        <animate
          attributeName="cx"
          values="10;46;10"
          dur="1.2s"
          begin="0.18s"
          repeatCount="indefinite"
          keyTimes="0;0.5;1"
          keySplines="0.45 0 0.55 1;0.45 0 0.55 1"
          calcMode="spline"
        />
        <animate
          attributeName="opacity"
          values="0.4;1;0.4"
          dur="1.2s"
          begin="0.18s"
          repeatCount="indefinite"
        />
        {colorCycle && customColorString && (
          <animate
            attributeName="fill"
            values={customColorString}
            dur="2.4s"
            begin="0.25s"
            repeatCount="indefinite"
          />
        )}
      </circle>
      <circle
        cx="46"
        cy="8"
        r="4"
        className={colorCycle && !customColorString ? "animate-dot-color-3" : undefined}
      >
        <animate
          attributeName="cx"
          values="10;46;10"
          dur="1.2s"
          begin="0.36s"
          repeatCount="indefinite"
          keyTimes="0;0.5;1"
          keySplines="0.45 0 0.55 1;0.45 0 0.55 1"
          calcMode="spline"
        />
        <animate
          attributeName="opacity"
          values="0.4;1;0.4"
          dur="1.2s"
          begin="0.36s"
          repeatCount="indefinite"
        />
        {colorCycle && customColorString && (
          <animate
            attributeName="fill"
            values={customColorString}
            dur="2.4s"
            begin="0.5s"
            repeatCount="indefinite"
          />
        )}
      </circle>
    </svg>
  );
}


