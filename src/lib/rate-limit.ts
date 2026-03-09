/**
 * In-memory Sliding Window Rate Limiter
 *
 * Edge-compatible (no Node.js APIs). Uses a sliding window counter
 * to track requests per key (typically IP address) within a time window.
 *
 * Not suitable for multi-instance deployments — use Redis-backed
 * rate limiting (e.g. @upstash/ratelimit) for distributed setups.
 */

import { NextResponse } from "next/server";

interface RateLimitEntry {
  /** Timestamps of requests within the current window */
  timestamps: number[];
}

interface RateLimitConfig {
  /** Maximum number of requests allowed within the window */
  maxRequests: number;
  /** Time window in milliseconds */
  windowMs: number;
}

interface RateLimitResult {
  /** Whether the request is allowed */
  allowed: boolean;
  /** Number of requests remaining in the current window */
  remaining: number;
  /** Timestamp (ms) when the rate limit resets */
  resetAt: number;
  /** Seconds until the rate limit resets (for Retry-After header) */
  retryAfterSeconds: number;
}

// Module-level stores — one per rate limit tier
const stores = new Map<string, Map<string, RateLimitEntry>>();

// Cleanup interval: every 60 seconds, purge expired entries
let cleanupInterval: ReturnType<typeof setInterval> | null = null;

function getStore(tierName: string): Map<string, RateLimitEntry> {
  let store = stores.get(tierName);
  if (!store) {
    store = new Map();
    stores.set(tierName, store);
  }
  return store;
}

function startCleanup() {
  if (cleanupInterval) return;
  cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [, store] of stores) {
      for (const [key, entry] of store) {
        // Remove entries with no recent timestamps
        if (entry.timestamps.length === 0 || entry.timestamps[entry.timestamps.length - 1] < now - 120_000) {
          store.delete(key);
        }
      }
    }
  }, 60_000);

  // Don't keep the process alive just for cleanup
  if (typeof cleanupInterval === "object" && "unref" in cleanupInterval) {
    cleanupInterval.unref();
  }
}

/**
 * Check rate limit for a given key within a tier.
 */
export function checkRateLimit(
  tierName: string,
  key: string,
  config: RateLimitConfig
): RateLimitResult {
  startCleanup();

  const store = getStore(tierName);
  const now = Date.now();
  const windowStart = now - config.windowMs;

  let entry = store.get(key);
  if (!entry) {
    entry = { timestamps: [] };
    store.set(key, entry);
  }

  // Slide the window: remove expired timestamps
  entry.timestamps = entry.timestamps.filter((t) => t > windowStart);

  if (entry.timestamps.length >= config.maxRequests) {
    // Rate limited — calculate when the oldest entry in window expires
    const oldestInWindow = entry.timestamps[0];
    const resetAt = oldestInWindow + config.windowMs;
    const retryAfterSeconds = Math.ceil((resetAt - now) / 1000);

    return {
      allowed: false,
      remaining: 0,
      resetAt,
      retryAfterSeconds: Math.max(1, retryAfterSeconds),
    };
  }

  // Allow — record this request
  entry.timestamps.push(now);

  return {
    allowed: true,
    remaining: config.maxRequests - entry.timestamps.length,
    resetAt: now + config.windowMs,
    retryAfterSeconds: Math.ceil(config.windowMs / 1000),
  };
}

// ─── Pre-configured rate limit tiers ───────────────────────────────

/** Auth endpoints: 10 requests per 60 seconds per IP */
export const AUTH_LIMIT: RateLimitConfig = {
  maxRequests: 10,
  windowMs: 60_000,
};

/** API state-changing endpoints: 60 requests per 60 seconds per IP */
export const API_MUTATING_LIMIT: RateLimitConfig = {
  maxRequests: 60,
  windowMs: 60_000,
};

/** General API (GET): 100 requests per 60 seconds per IP */
export const API_GENERAL_LIMIT: RateLimitConfig = {
  maxRequests: 100,
  windowMs: 60_000,
};

/** Public v1 API: 30 requests per 60 seconds per IP */
export const PUBLIC_API_LIMIT: RateLimitConfig = {
  maxRequests: 30,
  windowMs: 60_000,
};

// ─── Helpers ───────────────────────────────────────────────────────

/**
 * Extract a client identifier from the request.
 * Uses standard proxy headers, falling back to "unknown".
 */
export function getClientIp(request: Request): string {
  const headers = request.headers;
  return (
    headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    headers.get("x-real-ip") ||
    "unknown"
  );
}

/**
 * Create a 429 Too Many Requests response with standard headers.
 */
export function rateLimitResponse(result: RateLimitResult): NextResponse {
  const response = NextResponse.json(
    {
      error: "Too many requests. Please try again later.",
      code: "RATE_LIMIT",
      retryAfter: result.retryAfterSeconds,
    },
    { status: 429 }
  );
  response.headers.set("Retry-After", String(result.retryAfterSeconds));
  response.headers.set("X-RateLimit-Remaining", String(result.remaining));
  response.headers.set(
    "X-RateLimit-Reset",
    String(Math.ceil(result.resetAt / 1000))
  );
  return response;
}

// ─── Testing helpers ───────────────────────────────────────────────

/** Reset all rate limit stores. For testing only. */
export function _resetAllStores(): void {
  for (const [, store] of stores) {
    store.clear();
  }
  stores.clear();
}
