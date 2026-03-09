/**
 * CSRF Token API Endpoint
 * Provides CSRF tokens for client-side requests
 */

import { getCsrfTokenHandler } from "@/lib/csrf";

/**
 * GET /api/csrf-token
 * Returns a CSRF token for use in subsequent requests
 */
export async function GET() {
  return await getCsrfTokenHandler();
}
