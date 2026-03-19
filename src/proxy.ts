/**
 * Next.js Proxy (formerly Middleware)
 *
 * Runs on every matched request in Edge runtime. Handles:
 * 1. Request size limits
 * 2. Rate limiting (per-IP, tiered by route)
 * 3. Authentication (session cookie check)
 */

import { NextRequest, NextResponse } from "next/server";
import { checkRequestSize } from "@/lib/request-size-limit";
import {
  checkRateLimit,
  getClientIp,
  rateLimitResponse,
  AUTH_LIMIT,
  API_MUTATING_LIMIT,
  API_GENERAL_LIMIT,
  PUBLIC_API_LIMIT,
} from "@/lib/rate-limit";

const STATE_CHANGING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export default async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const method = req.method;

  // ── 1. Request size limits for body-bearing methods ──────────
  if (method && STATE_CHANGING_METHODS.has(method)) {
    const sizeError = checkRequestSize(req);
    if (sizeError) {
      return sizeError;
    }
  }

  // ── 2. Rate limiting ─────────────────────────────────────────
  const ip = getClientIp(req);

  // Auth endpoints — strictest limit (brute force protection)
  if (pathname.startsWith("/api/auth")) {
    const result = checkRateLimit("auth", ip, AUTH_LIMIT);
    if (!result.allowed) {
      return rateLimitResponse(result);
    }
  }

  // Public v1 API — moderate limit
  if (pathname.startsWith("/api/v1/")) {
    const result = checkRateLimit("public-api", ip, PUBLIC_API_LIMIT);
    if (!result.allowed) {
      return rateLimitResponse(result);
    }
  }

  // Space-scoped & entity API — different limits for reads vs writes
  if (pathname.startsWith("/api/spaces/") || pathname.startsWith("/api/entities/")) {
    if (method && STATE_CHANGING_METHODS.has(method)) {
      const result = checkRateLimit("api-mutating", ip, API_MUTATING_LIMIT);
      if (!result.allowed) {
        return rateLimitResponse(result);
      }
    } else {
      const result = checkRateLimit("api-general", ip, API_GENERAL_LIMIT);
      if (!result.allowed) {
        return rateLimitResponse(result);
      }
    }
  }

  // ── 3. Authentication ────────────────────────────────────────

  // Public routes that don't require authentication
  const publicRoutes = ["/auth/signin", "/auth/signup", "/auth/error", "/auth/two-factor", "/auth/forgot-password", "/auth/reset-password", "/auth/verify-email", "/setup", "/verify"];

  // API routes that are public
  const publicApiRoutes = ["/api/auth", "/api/health", "/api/v1/reserves", "/api/setup"];

  // Public settings endpoint
  const isPublicSettings =
    pathname === "/api/settings" &&
    req.nextUrl.searchParams.get("public") === "true";

  const isPublicRoute = publicRoutes.some((route) =>
    pathname.startsWith(route)
  );
  const isPublicApiRoute = publicApiRoutes.some((route) =>
    pathname.startsWith(route)
  );

  // Allow public routes
  if (isPublicRoute || isPublicApiRoute || isPublicSettings) {
    return NextResponse.next();
  }

  // Check for session cookie
  const sessionCookie =
    req.cookies.get("better-auth.session_token") ||
    req.cookies.get("__Secure-better-auth.session_token");

  if (!sessionCookie) {
    // API routes: return 401 instead of redirect
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Page routes: redirect to sign-in
    const signInUrl = new URL("/auth/signin", req.url);
    const search = req.nextUrl.search;
    const callbackUrl = search ? `${pathname}${search}` : pathname;
    signInUrl.searchParams.set("callbackUrl", callbackUrl);
    return NextResponse.redirect(signInUrl, { status: 302 });
  }

  // User has session cookie, allow access
  return NextResponse.next();
}

// Configure which routes to protect
export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - static assets (svg, png, jpg, etc.)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
