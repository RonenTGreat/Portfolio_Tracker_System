"use client";

import { useState, useEffect } from "react";

export function ScrollToTop() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 300) {
        setIsVisible(true);
      } else {
        setIsVisible(false);
      }
    };

    // Check scroll position on mount
    handleScroll();

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  };

  if (!isVisible) return null;

  return (
    <button
      type="button"
      onClick={scrollToTop}
      title="Scroll to top"
      aria-label="Scroll to top"
      className={[
        "fixed z-30 flex items-center justify-center cursor-pointer",
        "bottom-18 right-4 md:bottom-6 md:right-6",
        "w-5 h-5 rounded-full bg-paper-raised text-brass border border-brass/50 shadow-xs",
        "hover:bg-paper hover:text-brass-deep hover:border-brass hover:shadow-sm hover:-translate-y-0.5",
        "transition-all duration-200 ease-out active:translate-y-0",
      ].join(" ")}
    >
      <svg
        className="w-2.5 h-2.5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 19V5" />
        <path d="m5 12 7-7 7 7" />
      </svg>
    </button>
  );
}
