import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Middleware does two things:
 *   1. Refreshes the Supabase auth session on every request so server
 *      components see a consistent cookie state. Without this step the
 *      first RSC navigation after login can read a stale/empty cookie
 *      and render blank until a manual refresh.
 *   2. Rewrites tenant-branded URLs like /glowmedspa/dashboard/* to the
 *      /dashboard/* internal path, preserving the original URL in an
 *      x-url header so server components can read the slug.
 */
export async function middleware(req: NextRequest) {
  const url = req.nextUrl.clone();
  const path = url.pathname;
  const parts = path.split("/").filter(Boolean);

  // Decide upfront whether this request should be rewritten.
  const reserved = ["api", "_next", "auth", "dashboard", "admin", "onboarding"];
  const shouldRewrite =
    parts.length >= 2 && parts[1] === "dashboard" && !reserved.includes(parts[0]);

  // Build the response we'll ultimately return. Supabase may mutate its
  // cookies on it via the setAll handler below.
  const response = shouldRewrite
    ? NextResponse.rewrite(new URL("/" + parts.slice(1).join("/"), req.url))
    : NextResponse.next();

  if (shouldRewrite) {
    response.headers.set("x-url", req.url);
  }

  // Refresh the Supabase auth session. This reads request cookies,
  // exchanges the refresh token if needed, and writes the updated
  // cookies back to the response so the browser + next server call
  // stay in sync.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            req.cookies.set(name, value);
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  // Touching getUser() forces the refresh + cookie write.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    // Run on every path except static assets. We still want auth pages
    // to refresh session cookies so the very first post-login navigation
    // has the fresh token.
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
