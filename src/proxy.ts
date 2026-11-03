import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { MaintenanceMode } from "@prisma/client";
import { RESERVED_EVENT_SLUGS } from "@/lib/events/slug-rules";

/** Paths that always bypass maintenance gate */
const BYPASS_PATHS = [
  "/api/auth",
  "/api/auth/register",
  "/api/admin",
  "/auth",
  "/api/site-config/maintenance",
  "/api/health",
  "/maintenance",
  "/admin",
  "/_next",
  "/favicon.ico",
  "/robots.txt",
  "/sitemap.xml",
];

function shouldBypass(pathname: string): boolean {
  return BYPASS_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}

/** Static files (by extension) bypass */
function isStaticFile(pathname: string): boolean {
  return /\.(ico|png|jpg|jpeg|gif|webp|svg|css|js|woff2?|ttf|map)$/i.test(
    pathname
  );
}

function getApiBase(request: NextRequest): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (appUrl) {
    try {
      new URL(appUrl);
      return appUrl.replace(/\/$/, "");
    } catch {
      /* invalid */
    }
  }
  return request.nextUrl.origin;
}

/** One path segment under /events; the redirect table decides whether it is an old address. */
const EVENT_DETAIL_PATH = /^\/events\/([^/]+)\/?$/;

/**
 * An old event address answers with a real 308 here, before rendering: the root loading
 * boundary streams every page, so a redirect thrown during render would be sent as a 200.
 */
async function redirectOldEventAddress(request: NextRequest): Promise<NextResponse | null> {
  const match = EVENT_DETAIL_PATH.exec(request.nextUrl.pathname);
  if (!match) return null;
  try {
    const slug = decodeURIComponent(match[1]);
    if (RESERVED_EVENT_SLUGS.has(slug)) return null;
    const { resolveEventSlugRedirect } = await import("@/lib/events/slug");
    const currentSlug = await resolveEventSlugRedirect(slug, { publishedOnly: true });
    if (!currentSlug) return null;
    const url = request.nextUrl.clone();
    url.pathname = `/events/${encodeURIComponent(currentSlug)}`;
    const response = NextResponse.redirect(url, 308);
    // Browsers keep an uncached 308 forever; no-store lets a later rename back take effect.
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch {
    return null;
  }
}

/**
 * Maintenance gate: when mode is ON, rewrite to /maintenance.
 * Privileged users (admin, vendor, organizer) bypass via the maintenance page
 * which runs on Node.js and can use auth() with database sessions.
 */
export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (isStaticFile(pathname)) {
    return NextResponse.next();
  }

  if (shouldBypass(pathname)) {
    return NextResponse.next();
  }

  const oldEventAddress = await redirectOldEventAddress(request);
  if (oldEventAddress) return oldEventAddress;

  try {
    const base = getApiBase(request);
    const res = await fetch(`${base}/api/site-config/maintenance`, {
      headers: { "Content-Type": "application/json" },
      next: { revalidate: 10 },
    });
    if (!res.ok) return NextResponse.next();

    const data = await res.json();
    const mode = (data.mode ?? "OFF") as MaintenanceMode;

    if (mode === "OFF") {
      return NextResponse.next();
    }

    const maintenanceUrl = new URL("/maintenance", request.url);
    maintenanceUrl.searchParams.set("next", pathname);
    return NextResponse.rewrite(maintenanceUrl);
  } catch {
    return NextResponse.next();
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\.).*)"],
};
