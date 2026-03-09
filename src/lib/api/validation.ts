/**
 * API Request Validation Utilities
 *
 * Provides Zod-based validation for API request bodies and parameters.
 * Centralizes validation logic to reduce duplication across routes.
 */

import { NextRequest } from "next/server";
import { z, type ZodSchema, type ZodError } from "zod";
import { ApiError } from "./response";

/**
 * Result of validating a request body
 */
export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; error: ReturnType<typeof ApiError.validationError> };

/**
 * Parse and validate request body against a Zod schema
 *
 * @example
 * const schema = z.object({ name: z.string().min(1), type: z.enum(['manual', 'blockchain']) });
 * const result = await validateRequestBody(request, schema);
 * if (!result.success) return result.error;
 * const { name, type } = result.data;
 */
export async function validateRequestBody<T>(
  request: NextRequest,
  schema: ZodSchema<T>
): Promise<ValidationResult<T>> {
  try {
    const body = await request.json();
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      return {
        success: false,
        error: ApiError.validationError(formatZodErrors(parsed.error)),
      };
    }

    return { success: true, data: parsed.data };
  } catch {
    return {
      success: false,
      error: ApiError.badRequest("Invalid JSON in request body"),
    };
  }
}

/**
 * Format Zod errors into a user-friendly format
 */
function formatZodErrors(error: ZodError): Record<string, string[]> {
  const formatted: Record<string, string[]> = {};

  for (const issue of error.issues) {
    const path = issue.path.join(".") || "_root";
    if (!formatted[path]) {
      formatted[path] = [];
    }
    formatted[path].push(issue.message);
  }

  return formatted;
}

/**
 * Validate and parse a query parameter as a positive integer with optional max
 */
export function parsePositiveInt(
  value: string | null,
  defaultValue: number,
  max?: number
): number {
  if (!value) return defaultValue;

  const parsed = parseInt(value, 10);
  if (isNaN(parsed) || parsed < 1) return defaultValue;
  if (max && parsed > max) return max;

  return parsed;
}

/**
 * Common validation schemas
 */
export const schemas = {
  /** Pagination limit (1-100, default 50) */
  limit: z.coerce.number().int().min(1).max(100).default(50),

  /** Sort direction with field */
  sort: z.string().regex(/^-?[a-z_]+$/i).optional(),

  /** UUID format */
  uuid: z.string().uuid(),

  /** Non-empty string */
  requiredString: z.string().min(1, "This field is required"),

  /** Email with RFC-5322 approximation */
  email: z
    .string()
    .email("Invalid email format")
    .regex(
      /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/,
      "Invalid email format"
    ),

  /** Space role */
  spaceRole: z.enum(["admin", "auditor", "member"]),

  /** Integration status */
  status: z.enum(["active", "inactive", "error"]),

  /** Cron schedule expression */
  cronSchedule: z
    .string()
    .regex(/^(\*|[0-9,\-/]+)\s+(\*|[0-9,\-/]+)\s+(\*|[0-9,\-/]+)\s+(\*|[0-9,\-/]+)\s+(\*|[0-9,\-/]+)$/)
    .nullable()
    .optional(),

  /** Ethereum address */
  ethereumAddress: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, "Invalid Ethereum address format"),
} as const;

/**
 * Pre-built request body schemas for common operations
 */
export const requestSchemas = {
  /** Add member to space */
  addMember: z.object({
    userId: schemas.uuid,
    role: schemas.spaceRole,
  }),

  /** Update member role */
  updateMemberRole: z.object({
    role: schemas.spaceRole,
  }),

} as const;
