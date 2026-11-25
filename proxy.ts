import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic check only: bounce visitors without a session cookie away from
 * app pages. The real check happens in lib/session.ts (getCurrentUser).
 */
const SESSION_COOKIES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
];

export function proxy(request: NextRequest) {
  const hasSession = SESSION_COOKIES.some((name) => request.cookies.has(name));
  if (hasSession) return NextResponse.next();

  const login = new URL("/login", request.url);
  login.searchParams.set(
    "callbackUrl",
    request.nextUrl.pathname + request.nextUrl.search,
  );
  return NextResponse.redirect(login);
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/add/:path*",
    "/settings/:path*",
    "/onboarding/:path*",
    "/purchases/:path*",
    "/dev/:path*",
  ],
};
