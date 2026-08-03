import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SESSION_COOKIE = "ledger_session";

// Public routes that don't require authentication
const PUBLIC_PATHS = ["/sign-in", "/invite"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Static assets and API auth routes bypass middleware/proxy
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/auth") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const isPublicPath = PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );

  // If trying to access protected route without a session cookie
  if (!token && !isPublicPath) {
    const signInUrl = new URL("/sign-in", request.url);
    return NextResponse.redirect(signInUrl);
  }

  // If already authenticated and trying to visit sign-in page
  if (token && pathname === "/sign-in") {
    const dashboardUrl = new URL("/dashboard", request.url);
    return NextResponse.redirect(dashboardUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
