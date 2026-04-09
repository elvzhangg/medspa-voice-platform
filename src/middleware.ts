import { NextRequest, NextResponse } from "next/server";

/**
 * Middleware to handle tenant-branded URLs
 * Example: vauxvoice.com/glowmedspa/dashboard -> rewrites to /dashboard (with tenant context)
 */
export function middleware(req: NextRequest) {
  const url = req.nextUrl.clone();
  const path = url.pathname;

  // Split path: /glowmedspa/dashboard/calendar -> ["", "glowmedspa", "dashboard", "calendar"]
  const parts = path.split("/").filter(Boolean);

  // If the path starts with a potential tenant slug (and isn't a reserved path like /api or /auth)
  if (parts.length >= 2 && parts[1] === "dashboard") {
    const tenantSlug = parts[0];
    const remainingPath = "/" + parts.slice(1).join("/");

    // Skip reserved slugs
    const reserved = ["api", "_next", "auth", "dashboard", "admin", "onboarding"];
    if (reserved.includes(tenantSlug)) {
      return NextResponse.next();
    }

    // Rewrite the URL internally to the dashboard path
    const response = NextResponse.rewrite(new URL(remainingPath, req.url));
    response.headers.set("x-url", req.url);
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!api|_next/static|_next/image|favicon.ico).*)",
  ],
};
