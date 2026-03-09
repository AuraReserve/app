/**
 * Standardized API Response Utilities
 *
 * Provides consistent error and success responses across all API routes.
 * Ensures uniform error message format and HTTP status codes.
 */

import { NextResponse } from "next/server";

/**
 * Standard error response format
 */
export interface ApiErrorResponse {
  error: string;
  details?: unknown;
  code?: string;
}

/**
 * Pre-built error responses for common cases
 */
export const ApiError = {
  /** 401 - User not authenticated */
  unauthorized: (message = "Unauthorized") =>
    NextResponse.json<ApiErrorResponse>({ error: message }, { status: 401 }),

  /** 403 - User lacks permission */
  forbidden: (message = "Forbidden") =>
    NextResponse.json<ApiErrorResponse>({ error: message }, { status: 403 }),

  /** 403 - Invalid CSRF token */
  csrfInvalid: () =>
    NextResponse.json<ApiErrorResponse>(
      { error: "Invalid or missing CSRF token", code: "CSRF_INVALID" },
      { status: 403 }
    ),

  /** 404 - Resource not found */
  notFound: (resource = "Resource") =>
    NextResponse.json<ApiErrorResponse>(
      { error: `${resource} not found` },
      { status: 404 }
    ),

  /** 404 - Space not found or no access */
  spaceNotFound: () =>
    NextResponse.json<ApiErrorResponse>(
      { error: "Space not found or access denied" },
      { status: 404 }
    ),

  /** 400 - Invalid input data */
  badRequest: (message: string, details?: unknown) =>
    NextResponse.json<ApiErrorResponse>(
      { error: message, details },
      { status: 400 }
    ),

  /** 400 - Validation error with field details */
  validationError: (details: unknown) =>
    NextResponse.json<ApiErrorResponse>(
      { error: "Validation failed", details },
      { status: 400 }
    ),

  /** 409 - Conflict (e.g., duplicate resource) */
  conflict: (message: string) =>
    NextResponse.json<ApiErrorResponse>({ error: message }, { status: 409 }),

  /** 429 - Rate limit exceeded */
  rateLimitExceeded: (retryAfter?: number) => {
    const response = NextResponse.json<ApiErrorResponse>(
      { error: "Too many requests. Please try again later.", code: "RATE_LIMIT" },
      { status: 429 }
    );
    if (retryAfter) {
      response.headers.set("Retry-After", String(retryAfter));
    }
    return response;
  },

  /** 500 - Internal server error (generic) */
  internal: (message = "Internal server error") =>
    NextResponse.json<ApiErrorResponse>({ error: message }, { status: 500 }),
} as const;

/**
 * Success response helpers
 */
export const ApiSuccess = {
  /** 200 - Standard success with data */
  ok: <T>(data: T) => NextResponse.json(data, { status: 200 }),

  /** 201 - Resource created */
  created: <T>(data: T) => NextResponse.json(data, { status: 201 }),

  /** 200 - Success with no content */
  noContent: () => new NextResponse(null, { status: 204 }),

  /** 200 - Simple success flag */
  success: () => NextResponse.json({ success: true }, { status: 200 }),
} as const;
