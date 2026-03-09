/**
 * API Utilities
 *
 * Centralized exports for API route helpers including response builders,
 * middleware wrappers, and validation utilities.
 */

export { ApiError, ApiSuccess, type ApiErrorResponse } from "./response";

export {
  // spaceRoute factory (preferred for new routes)
  spaceRoute,
  type SpaceHandlerContext,
  // Route context types
  type SpaceRouteContext,
  type SpaceResourceRouteContext,
  type SpaceMemberRouteContext,
  // Auth middleware
  withAuth,
  withAuthAndCsrf,
  // Space access middleware
  withSpaceAccess,
  withSpaceAdmin,
  withSpaceAccessAndCsrf,
  withSpaceAdminAndCsrf,
  // Resource middleware
  withSpaceResource,
  withSpaceResourceAdmin,
  withSpaceResourceAdminAndCsrf,
} from "./middleware";

export { validateRequestBody, type ValidationResult } from "./validation";
