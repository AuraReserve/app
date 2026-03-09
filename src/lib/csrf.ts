/**
 * CSRF Protection Utilities
 * Provides Cross-Site Request Forgery protection for state-changing operations
 *
 * Better Auth handles auth-route CSRF protection.
 * This module provides additional CSRF protection for API routes.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthSecret } from "@/lib/auth-env";

function getCsrfSecret(): string {
  return process.env.CSRF_SECRET || requireAuthSecret();
}
const CSRF_HEADER_NAME = "x-csrf-token";
const CSRF_COOKIE_NAME = "csrf-token";

/**
 * Generate a CSRF token
 */
export async function generateCsrfToken(): Promise<string> {
  const crypto = await import("crypto");
  const token = crypto.randomBytes(32).toString("hex");

  // Create HMAC signature
  const hmac = crypto.createHmac("sha256", getCsrfSecret());
  hmac.update(token);
  const signature = hmac.digest("hex");

  return `${token}.${signature}`;
}

/**
 * Verify a CSRF token
 */
export async function verifyCsrfToken(token: string): Promise<boolean> {
  try {
    const [tokenPart, signaturePart] = token.split(".");

    if (!tokenPart || !signaturePart) {
      return false;
    }

    // Verify signature
    const crypto = await import("crypto");
    const hmac = crypto.createHmac("sha256", getCsrfSecret());
    hmac.update(tokenPart);
    const expectedSignature = hmac.digest("hex");

    // Constant-time comparison to prevent timing attacks
    return crypto.timingSafeEqual(
      Buffer.from(signaturePart, "hex"),
      Buffer.from(expectedSignature, "hex")
    );
  } catch (error) {
    console.error("CSRF token verification error:", error);
    return false;
  }
}

/**
 * Middleware to check CSRF token for state-changing requests
 * Should be called in API routes that modify data
 */
export async function checkCsrfToken(request: NextRequest): Promise<boolean> {
  // Only check for state-changing methods
  const method = request.method;
  if (!method || !["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    return true; // GET, HEAD, OPTIONS don't need CSRF protection
  }

  // Only accept token from header — never from cookie.
  // Cookies are sent automatically by the browser on cross-origin requests,
  // so accepting them would defeat CSRF protection.
  const token = request.headers.get(CSRF_HEADER_NAME);

  if (!token) {
    return false;
  }

  return await verifyCsrfToken(token);
}

/**
 * Create a response with CSRF token in cookie
 */
export async function createCsrfResponse(response: NextResponse): Promise<NextResponse> {
  const token = await generateCsrfToken();

  response.cookies.set(CSRF_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 24, // 24 hours
  });

  // Also send in header for client-side access
  response.headers.set(CSRF_HEADER_NAME, token);

  return response;
}

/**
 * API route helper to handle CSRF protection
 * Returns error response if CSRF check fails
 */
export async function withCsrfProtection(
  request: NextRequest,
  handler: () => Promise<NextResponse>
): Promise<NextResponse> {
  const isValid = await checkCsrfToken(request);

  if (!isValid) {
    return NextResponse.json(
      { error: "Invalid or missing CSRF token" },
      { status: 403 }
    );
  }

  return handler();
}

/**
 * Get CSRF token endpoint handler
 * Should be exposed as a GET endpoint for clients to fetch tokens
 */
export async function getCsrfTokenHandler(): Promise<NextResponse> {
  const token = await generateCsrfToken();

  const response = NextResponse.json({ csrfToken: token });

  response.cookies.set(CSRF_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 24, // 24 hours
  });

  return response;
}
