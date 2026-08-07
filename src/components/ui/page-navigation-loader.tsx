"use client";

import { useEffect, useState, Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { ThreeDotsMove } from "@/components/ui/three-dots-move";

export function triggerPageLoader() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("page-loader-start"));
  }
}

export function stopPageLoader() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("page-loader-stop"));
  }
}

function NavigationLoaderContent() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);

  // Hide loader when route transition finishes
  useEffect(() => {
    setIsLoading(false);
  }, [pathname, searchParams]);

  // Handle global link clicks, popstate, and custom trigger events
  useEffect(() => {
    let timer: NodeJS.Timeout;

    const startLoader = () => {
      setIsLoading(true);
      clearTimeout(timer);
      // Fallback timer: hide loader after 5s in case navigation is aborted or fails
      timer = setTimeout(() => {
        setIsLoading(false);
      }, 5000);
    };

    const stopLoader = () => {
      setIsLoading(false);
      clearTimeout(timer);
    };

    const handleAnchorClick = (e: MouseEvent) => {
      if (e.defaultPrevented) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      const target = e.target as HTMLElement | null;
      const anchor = target?.closest("a");
      if (!anchor) return;

      const href = anchor.getAttribute("href");
      if (!href) return;

      // Skip external, download, anchor, or special protocol links
      if (anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      if (href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("javascript:")) return;

      try {
        const targetUrl = new URL(href, window.location.href);
        // Only trigger for same origin
        if (targetUrl.origin !== window.location.origin) return;

        // Check if navigating to a different pathname or query string
        const currentUrl = new URL(window.location.href);
        if (
          targetUrl.pathname === currentUrl.pathname &&
          targetUrl.search === currentUrl.search
        ) {
          return;
        }

        startLoader();
      } catch {
        // Invalid URL ignore
      }
    };

    const handlePopState = () => {
      startLoader();
    };

    window.addEventListener("page-loader-start", startLoader);
    window.addEventListener("page-loader-stop", stopLoader);
    document.addEventListener("click", handleAnchorClick, true);
    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("page-loader-start", startLoader);
      window.removeEventListener("page-loader-stop", stopLoader);
      document.removeEventListener("click", handleAnchorClick, true);
      window.removeEventListener("popstate", handlePopState);
      clearTimeout(timer);
    };
  }, []);

  if (!isLoading) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Loading page..."
      className="fixed inset-0 z-[99999] flex flex-col items-center justify-center bg-paper/85 dark:bg-paper/90 backdrop-blur-md transition-opacity duration-300 animate-in fade-in"
    >
        <ThreeDotsMove className="h-10 w-28 md:h-12 md:w-36 drop-shadow" colorCycle={true} />
    </div>
  );
}

export function PageNavigationLoader() {
  return (
    <Suspense fallback={null}>
      <NavigationLoaderContent />
    </Suspense>
  );
}
