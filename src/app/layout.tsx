import type { Metadata } from "next";
import { Fraunces, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/shell/app-shell";
import { getSessionUser } from "@/server/auth";

/* §1.2 + §8.10 — next/font/google gives font-display: swap by default, so
   mobile users on slow connections see correctly-sized fallback text
   immediately rather than a layout shift when the webfont lands. */

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
  // §1.2 — optical size + soft ink-traps are what give it the crafted-record
  // warmth; without SOFT it reads as a generic display serif.
  axes: ["SOFT", "opsz"],
});

const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-sans",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Ledger — Portfolio Tracker",
  description: "A quarterly record of holdings, targets, and drift.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  // §8.2 — the bottom nav bar respects env(safe-area-inset-bottom), which
  // requires viewport-fit=cover to be meaningful on iOS.
  viewportFit: "cover" as const,
  themeColor: "#efede4",
};

import { ThemeProvider } from "@/components/theme/theme-provider";
import { PageNavigationLoader } from "@/components/ui/page-navigation-loader";

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getSessionUser();
  const isAdmin = user?.role === "ADMIN";

  const themeScript = `
    (function() {
      try {
        var stored = localStorage.getItem('portfolio_theme');
        if (stored === 'dark' || (!stored && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
      } catch (e) {}
    })();
  `;

  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${plexSans.variable} ${plexMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <ThemeProvider>
          <PageNavigationLoader />
          <AppShell isAdmin={isAdmin}>{children}</AppShell>
        </ThemeProvider>
      </body>
    </html>
  );
}
