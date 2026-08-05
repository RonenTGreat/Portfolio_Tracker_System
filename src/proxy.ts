/**
 * Next.js proxy — SRS §4.1, FR-8.
 *
 * Guards every page route behind the session cookie. This is the edge-level
 * gate: it runs before the server component even starts rendering, so an
 * unauthenticated user sees a clean redirect to /sign-in rather than a page
 * that errors because getSessionUser() returned null.
 *
 * This does NOT validate the session against the database — that would add a
 * round-trip to every navigation and defeat the point of edge middleware being
 * fast. The full ACTIVE-status check happens in getSessionUser() (server/auth),
 * which every server component and API route calls independently.
 *
 * What this DOES is check for the presence of the session cookie: no cookie →
 * no chance of a valid session → redirect immediately. A deactivated user whose
 * cookie is still sitting around will pass here but be rejected by
 * getSessionUser() on the very next line the server component runs.
 *
 * Next 16 convention: the file is named `proxy.ts` and the function is named
 * `proxy` (replacing the deprecated `middleware.ts` / `middleware` convention).
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SESSION_COOKIE = "ledger_session";

/**
 * Routes that must be reachable without a session.
 *
 * /sign-in — the login page itself.
 * /invite  — the token-gated account-setup page (FR-9). The invite token in
 *            the URL is the credential; requiring a session to reach it would
 *            mean someone already has an account, defeating the purpose.
 */
const PUBLIC_PATHS = ["/sign-in", "/invite"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // API auth routes handle their own access: /api/auth/sign-in must be
  // reachable without a session, and /api/invite/[token] validates its own
  // token. Everything else under /api is protected by getSessionUser() in
  // the route handler itself, not here.
  if (pathname.startsWith("/api/auth") || pathname.startsWith("/api/invite")) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const isPublicPath = PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );

  // No cookie + protected route → redirect to sign-in.
  if (!token && !isPublicPath) {
    const signInUrl = new URL("/sign-in", request.url);
    return NextResponse.redirect(signInUrl);
  }

  // Already signed in and trying to visit sign-in → send to dashboard.
  // Prevents the confused state where someone bookmarked /sign-in and keeps
  // landing on a login form while already having a valid session.
  if (token && pathname === "/sign-in") {
    const dashboardUrl = new URL("/dashboard", request.url);
    return NextResponse.redirect(dashboardUrl);
  }

  return NextResponse.next();
}

/**
 * The matcher tells Next.js which routes to run the proxy on. Static assets
 * and image optimisation paths are excluded — they have no concept of sessions
 * and running the proxy on them would add latency to every CSS/JS/image load.
 */
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
