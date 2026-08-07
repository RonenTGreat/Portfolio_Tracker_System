"use client";

import React, { useEffect, useState } from "react";
import { useTheme } from "@/components/theme/theme-provider";
import { SunIcon, MoonIcon } from "@/components/shell/nav-icons";

export interface ThemeToggleProps {
  isCollapsed?: boolean;
  className?: string;
  iconClassName?: string;
  iconWidth?: string | number;
  iconHeight?: string | number;
  iconSize?: string | number;
}

export function ThemeToggle({
  isCollapsed = false,
  className = "",
  iconClassName = "",
  iconWidth,
  iconHeight,
  iconSize,
}: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div
        className={[
          "flex items-center text-ink-soft opacity-0 pointer-events-none",
          isCollapsed ? "justify-center w-7 h-7" : "w-full gap-2.5 px-2.5 py-1.5",
          className,
        ].join(" ")}
      />
    );
  }

  const isDark = theme === "dark";
  const titleText = isDark ? "Switch to Light Mode" : "Switch to Dark Mode";

  // Build icon class and sizing
  const hasCustomSize = iconWidth !== undefined || iconHeight !== undefined || iconSize !== undefined;
  const defaultIconClass = isCollapsed
    ? "w-[14px] h-[14px] shrink-0"
    : "w-4 h-4 shrink-0";

  const computedIconClass = [
    !hasCustomSize && !iconClassName ? defaultIconClass : "",
    isDark ? "text-amber-500" : "",
    iconClassName,
  ].filter(Boolean).join(" ");

  const iconElement = isDark ? (
    <SunIcon
      className={computedIconClass || undefined}
      width={iconWidth}
      height={iconHeight}
      size={iconSize}
    />
  ) : (
    <MoonIcon
      className={computedIconClass || undefined}
      width={iconWidth}
      height={iconHeight}
      size={iconSize}
    />
  );

  return (
    <button
      type="button"
      onClick={toggleTheme}
      title={titleText}
      aria-label={titleText}
      className={[
        "flex items-center text-ink-soft hover:text-ink transition-all cursor-pointer",
        isCollapsed
          ? "justify-center w-7 h-7 rounded-md hover:bg-paper-raised"
          : "w-full gap-2.5 px-2.5 py-1.5 text-[13px] text-left rounded-md hover:bg-paper-raised/70",
        className,
      ].join(" ")}
    >
      {iconElement}
      {!isCollapsed && (
        <span className="truncate">{isDark ? "Light Mode" : "Dark Mode"}</span>
      )}
    </button>
  );
}
