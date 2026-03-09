/**
 * Client-side CSRF protection hook.
 *
 * Fetches a CSRF token from /api/csrf-token on first use, caches it
 * in module scope, and returns a `csrfFetch` wrapper that automatically
 * attaches the `x-csrf-token` header to state-changing requests
 * (POST, PUT, PATCH, DELETE).
 */

"use client";

import { useCallback } from "react";

const STATE_CHANGING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// Module-level cache so the token is shared across all components
let tokenCache: string | null = null;
let tokenPromise: Promise<string> | null = null;

async function fetchCsrfToken(): Promise<string> {
  if (tokenCache) return tokenCache;
  if (tokenPromise) return tokenPromise;

  tokenPromise = fetch("/api/csrf-token")
    .then((res) => {
      if (!res.ok) throw new Error("Failed to fetch CSRF token");
      return res.json();
    })
    .then((data: { csrfToken: string }) => {
      tokenCache = data.csrfToken;
      return data.csrfToken;
    })
    .catch((err) => {
      // Reset so the next call retries
      tokenPromise = null;
      throw err;
    });

  return tokenPromise;
}

/**
 * Invalidate the cached CSRF token so the next `csrfFetch` call
 * will request a fresh one. Call this if a request returns 403
 * with code CSRF_INVALID.
 */
export function invalidateCsrfToken(): void {
  tokenCache = null;
  tokenPromise = null;
}

/**
 * Hook that returns a fetch wrapper with automatic CSRF header injection.
 *
 * Usage:
 * ```tsx
 * const { csrfFetch } = useCsrfFetch();
 * await csrfFetch("/api/spaces/x/stores", { method: "POST", body: ... });
 * ```
 */
export function useCsrfFetch() {
  const csrfFetch = useCallback(
    async (
      url: string | URL | Request,
      init?: RequestInit
    ): Promise<Response> => {
      const method = (init?.method ?? "GET").toUpperCase();

      if (STATE_CHANGING_METHODS.has(method)) {
        const token = await fetchCsrfToken();
        const headers = new Headers(init?.headers);
        headers.set("x-csrf-token", token);
        return fetch(url, { ...init, headers });
      }

      return fetch(url, init);
    },
    []
  );

  return { csrfFetch };
}
