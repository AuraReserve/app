/**
 * API Route Middleware
 *
 * Reusable middleware wrappers for common API route patterns:
 * - Authentication checks
 * - Space access verification
 * - CSRF protection
 * - Request validation
 *
 * Usage:
 * ```typescript
 * export async function POST(request: NextRequest, context: RouteContext) {
 *   return withSpaceAdmin(request, context, async (session, spaceId, access) => {
 *     // Your handler code here - session, spaceId, and access are guaranteed
 *     return ApiSuccess.ok({ data });
 *   });
 * }
 * ```
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth-utils";
import { checkSpaceAccess, type SpaceAccessCheck } from "@/lib/dal";
import { checkCsrfToken } from "@/lib/csrf";
import { ApiError } from "./response";
import type { ExtendedSession } from "@/lib/auth";

/**
 * Common route context type for space-scoped routes
 */
export interface SpaceRouteContext {
  params: Promise<{ spaceId: string }>;
}

/**
 * Extended route context with additional resource ID
 */
export interface SpaceResourceRouteContext {
  params: Promise<{ spaceId: string; id: string }>;
}

/**
 * Member-specific route context
 */
export interface SpaceMemberRouteContext {
  params: Promise<{ spaceId: string; memberId: string }>;
}

/**
 * Handler function types
 */
type AuthenticatedHandler = (
  session: ExtendedSession
) => Promise<NextResponse>;

type SpaceAccessHandler = (
  session: ExtendedSession,
  spaceId: string,
  access: SpaceAccessCheck
) => Promise<NextResponse>;

type SpaceResourceHandler<_T extends string = "id"> = (
  session: ExtendedSession,
  spaceId: string,
  resourceId: string,
  access: SpaceAccessCheck
) => Promise<NextResponse>;

/**
 * Require authenticated user
 * Returns 401 if not authenticated
 */
export async function withAuth(
  request: NextRequest,
  handler: AuthenticatedHandler
): Promise<NextResponse> {
  const session = await getSession();

  if (!session?.user) {
    return ApiError.unauthorized();
  }

  return handler(session);
}

/**
 * Require authenticated user with CSRF validation for state-changing requests
 */
export async function withAuthAndCsrf(
  request: NextRequest,
  handler: AuthenticatedHandler
): Promise<NextResponse> {
  // Check CSRF for state-changing methods
  const method = request.method;
  if (method && ["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    const csrfValid = await checkCsrfToken(request);
    if (!csrfValid) {
      return ApiError.csrfInvalid();
    }
  }

  return withAuth(request, handler);
}

/**
 * Require space access (any role)
 * Returns 401 if not authenticated, 404 if no space access
 */
export async function withSpaceAccess(
  request: NextRequest,
  context: SpaceRouteContext,
  handler: SpaceAccessHandler
): Promise<NextResponse> {
  const session = await getSession();

  if (!session?.user) {
    return ApiError.unauthorized();
  }

  const { spaceId } = await context.params;
  const access = await checkSpaceAccess(spaceId, session.user.id, session.user.role ?? null);

  if (!access.hasAccess) {
    return ApiError.spaceNotFound();
  }

  return handler(session, spaceId, access);
}

/**
 * Require space admin access
 * Returns 401 if not authenticated, 404 if no admin access
 */
export async function withSpaceAdmin(
  request: NextRequest,
  context: SpaceRouteContext,
  handler: SpaceAccessHandler
): Promise<NextResponse> {
  const session = await getSession();

  if (!session?.user) {
    return ApiError.unauthorized();
  }

  const { spaceId } = await context.params;
  const access = await checkSpaceAccess(spaceId, session.user.id, session.user.role ?? null);

  if (!access.isAdmin) {
    return ApiError.spaceNotFound();
  }

  return handler(session, spaceId, access);
}

/**
 * Require space access with CSRF validation
 */
export async function withSpaceAccessAndCsrf(
  request: NextRequest,
  context: SpaceRouteContext,
  handler: SpaceAccessHandler
): Promise<NextResponse> {
  const method = request.method;
  if (method && ["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    const csrfValid = await checkCsrfToken(request);
    if (!csrfValid) {
      return ApiError.csrfInvalid();
    }
  }

  return withSpaceAccess(request, context, handler);
}

/**
 * Require space admin access with CSRF validation
 */
export async function withSpaceAdminAndCsrf(
  request: NextRequest,
  context: SpaceRouteContext,
  handler: SpaceAccessHandler
): Promise<NextResponse> {
  const method = request.method;
  if (method && ["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    const csrfValid = await checkCsrfToken(request);
    if (!csrfValid) {
      return ApiError.csrfInvalid();
    }
  }

  return withSpaceAdmin(request, context, handler);
}

/**
 * Require space access with resource ID
 * Extracts both spaceId and resource ID from params
 */
export async function withSpaceResource(
  request: NextRequest,
  context: SpaceResourceRouteContext,
  handler: SpaceResourceHandler
): Promise<NextResponse> {
  const session = await getSession();

  if (!session?.user) {
    return ApiError.unauthorized();
  }

  const { spaceId, id } = await context.params;
  const access = await checkSpaceAccess(spaceId, session.user.id, session.user.role ?? null);

  if (!access.hasAccess) {
    return ApiError.spaceNotFound();
  }

  return handler(session, spaceId, id, access);
}

/**
 * Require space admin access with resource ID
 */
export async function withSpaceResourceAdmin(
  request: NextRequest,
  context: SpaceResourceRouteContext,
  handler: SpaceResourceHandler
): Promise<NextResponse> {
  const session = await getSession();

  if (!session?.user) {
    return ApiError.unauthorized();
  }

  const { spaceId, id } = await context.params;
  const access = await checkSpaceAccess(spaceId, session.user.id, session.user.role ?? null);

  if (!access.isAdmin) {
    return ApiError.spaceNotFound();
  }

  return handler(session, spaceId, id, access);
}

/**
 * Require space admin with resource ID and CSRF validation
 */
export async function withSpaceResourceAdminAndCsrf(
  request: NextRequest,
  context: SpaceResourceRouteContext,
  handler: SpaceResourceHandler
): Promise<NextResponse> {
  const method = request.method;
  if (method && ["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    const csrfValid = await checkCsrfToken(request);
    if (!csrfValid) {
      return ApiError.csrfInvalid();
    }
  }

  return withSpaceResourceAdmin(request, context, handler);
}

// ---------------------------------------------------------------------------
// spaceRoute — higher-order factory for space-scoped API handlers
// ---------------------------------------------------------------------------

/**
 * Context passed to spaceRoute handler functions
 */
export interface SpaceHandlerContext<P extends Record<string, string> = Record<string, string>> {
  /** Authenticated user session (guaranteed to have .user) */
  session: ExtendedSession;
  /** Resolved route params (always includes spaceId) */
  params: P & { spaceId: string };
  /** Space access check result */
  access: SpaceAccessCheck;
  /** Original request */
  request: NextRequest;
}

interface SpaceRouteOpts {
  /** Access level required. Defaults to "read". */
  requiredAccess?: "read" | "admin" | "auditor";
  /** Check CSRF for mutations. Defaults to true for non-GET methods. */
  csrf?: boolean;
  /** Label for error messages, e.g. "list stores" → "Failed to list stores" */
  label: string;
}

/**
 * Factory for space-scoped API route handlers.
 * Handles authentication, CSRF validation, space access checks, and error handling.
 *
 * @example
 * export const GET = spaceRoute(
 *   { label: "list stores" },
 *   async ({ params }) => {
 *     const stores = await getSpaceStores(params.spaceId);
 *     return ApiSuccess.ok(stores);
 *   }
 * );
 */
export function spaceRoute<P extends Record<string, string> = Record<string, string>>(
  options: SpaceRouteOpts,
  handler: (ctx: SpaceHandlerContext<P>) => Promise<NextResponse>
) {
  return async (
    request: NextRequest,
    { params }: { params: Promise<P & { spaceId: string }> }
  ): Promise<NextResponse> => {
    try {
      // CSRF check for mutations (unless explicitly disabled)
      if (request.method !== "GET" && options.csrf !== false) {
        if (!(await checkCsrfToken(request))) {
          return ApiError.csrfInvalid();
        }
      }

      // Authentication
      const session = await getSession();
      if (!session?.user) {
        return ApiError.unauthorized();
      }

      // Resolve params
      const resolvedParams = await params;
      const { spaceId } = resolvedParams;

      // Space access check
      const access = await checkSpaceAccess(spaceId, session.user.id, session.user.role ?? null);

      const required = options.requiredAccess ?? "read";
      if (required === "admin" && !access.isAdmin) {
        return ApiError.forbidden();
      } else if (required === "auditor" && access.role !== "admin" && access.role !== "auditor") {
        return ApiError.forbidden();
      } else if (required === "read" && !access.hasAccess) {
        return ApiError.forbidden();
      }

      return await handler({ session, params: resolvedParams, access, request });
    } catch (error) {
      console.error(`Error: Failed to ${options.label}:`, error);
      return ApiError.internal(`Failed to ${options.label}`);
    }
  };
}
