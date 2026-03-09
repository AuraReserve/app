/**
 * Data Access Layer (DAL)
 *
 * Centralized data access for all database operations.
 * All API routes and services should use these functions instead of direct Prisma calls.
 *
 * Benefits:
 * - Single source of truth for data operations
 * - Consistent error handling
 * - Centralized audit logging
 * - Easy to test and mock
 * - Clean separation of concerns
 *
 * For React Server Components and API routes that may call the same function
 * multiple times per request, use the cached versions from "./cached".
 */

export * from "./space-members";
export * from "./spaces";
export * from "./audit";
export * from "./integration-api-keys";
export * from "./streams";
export * from "./stream-entries";
export * from "./artifact-validation";
export * from "./integrations";
export * from "./groups";
export * from "./data-inputs";
export * from "./data-outputs";
