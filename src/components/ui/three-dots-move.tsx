import React from "react";

/**
 * ThreeDotsMove — Dynamic loading animation where 3 dots slide horizontally back and forth.
 */
export function ThreeDotsMove({ className = "h-5 w-12 text-current" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 56 16"
      fill="currentColor"
      className={`inline-block shrink-0 align-middle ${className}`}
      aria-label="Loading..."
      role="status"
    >
      <circle cx="10" cy="8" r="4">
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
      </circle>
      <circle cx="28" cy="8" r="4">
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
      </circle>
      <circle cx="46" cy="8" r="4">
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
      </circle>
    </svg>
  );
}
