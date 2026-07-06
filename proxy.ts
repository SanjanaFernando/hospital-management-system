import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";

const AUTH_COOKIE_NAME = "hospital-auth-token";

// Routes that don't require authentication
const PUBLIC_PATHS = ["/login"];

// API routes that don't require authentication
const PUBLIC_API_PREFIXES = ["/api/auth"];

function base64UrlDecode(data: string): string {
  let padded = data.replace(/-/g, "+").replace(/_/g, "/");
  while (padded.length % 4 !== 0) {
    padded += "=";
  }
  return Buffer.from(padded, "base64").toString("utf-8");
}

function verifyTokenInProxy(token: string): Record<string, unknown> | null {
  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) return null;

    const [header, body, signature] = token.split(".");
    if (!header || !body || !signature) return null;

    const expectedSignature = createHmac("sha256", secret)
      .update(`${header}.${body}`)
      .digest("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");

    if (signature !== expectedSignature) return null;

    const payload = JSON.parse(base64UrlDecode(body));
    const now = Math.floor(Date.now() / 1000);

    if (payload.exp && payload.exp < now) return null;

    return payload;
  } catch {
    return null;
  }
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths
  if (PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
    if (token) {
      const payload = verifyTokenInProxy(token);
      if (payload) {
        // Authenticated user trying to access login → redirect to home
        return NextResponse.redirect(new URL("/", request.url));
      }
    }
    return NextResponse.next();
  }

  // Allow public API routes
  if (PUBLIC_API_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  // Allow static files and Next.js internals
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.endsWith(".svg") ||
    pathname.endsWith(".png") ||
    pathname.endsWith(".ico") ||
    pathname.endsWith(".jpg") ||
    pathname.endsWith(".jpeg")
  ) {
    return NextResponse.next();
  }

  // Check authentication
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;

  if (!token) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const payload = verifyTokenInProxy(token);

  if (!payload) {
    // Invalid or expired token — clear it and redirect
    const response = NextResponse.redirect(new URL("/login", request.url));
    response.cookies.delete(AUTH_COOKIE_NAME);
    return response;
  }

  // Inject user info into request headers for downstream use
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-user-id", String(payload.userId || ""));
  requestHeaders.set("x-user-role", String(payload.role || ""));
  requestHeaders.set("x-user-ward-id", String(payload.wardId || ""));
  const wardIds = Array.isArray(payload.wardIds) ? payload.wardIds : (payload.wardId ? [payload.wardId] : []);
  requestHeaders.set("x-user-ward-ids", wardIds.join(","));
  requestHeaders.set("x-user-name", String(payload.displayName || ""));

  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
