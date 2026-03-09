import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  checkRateLimit,
  getClientIp,
  rateLimitResponse,
  _resetAllStores,
  AUTH_LIMIT,
  API_MUTATING_LIMIT,
  API_GENERAL_LIMIT,
  PUBLIC_API_LIMIT,
} from "@/lib/rate-limit";

describe("Rate limiter", () => {
  beforeEach(() => {
    _resetAllStores();
  });

  afterEach(() => {
    _resetAllStores();
  });

  describe("checkRateLimit", () => {
    it("allows requests within the limit", () => {
      const config = { maxRequests: 3, windowMs: 60_000 };

      const r1 = checkRateLimit("test", "ip-1", config);
      expect(r1.allowed).toBe(true);
      expect(r1.remaining).toBe(2);

      const r2 = checkRateLimit("test", "ip-1", config);
      expect(r2.allowed).toBe(true);
      expect(r2.remaining).toBe(1);

      const r3 = checkRateLimit("test", "ip-1", config);
      expect(r3.allowed).toBe(true);
      expect(r3.remaining).toBe(0);
    });

    it("blocks requests exceeding the limit", () => {
      const config = { maxRequests: 2, windowMs: 60_000 };

      checkRateLimit("test", "ip-1", config);
      checkRateLimit("test", "ip-1", config);

      const r3 = checkRateLimit("test", "ip-1", config);
      expect(r3.allowed).toBe(false);
      expect(r3.remaining).toBe(0);
      expect(r3.retryAfterSeconds).toBeGreaterThan(0);
    });

    it("tracks different keys independently", () => {
      const config = { maxRequests: 1, windowMs: 60_000 };

      const r1 = checkRateLimit("test", "ip-1", config);
      expect(r1.allowed).toBe(true);

      const r2 = checkRateLimit("test", "ip-2", config);
      expect(r2.allowed).toBe(true);

      // ip-1 is now rate limited
      const r3 = checkRateLimit("test", "ip-1", config);
      expect(r3.allowed).toBe(false);

      // ip-2 is also rate limited
      const r4 = checkRateLimit("test", "ip-2", config);
      expect(r4.allowed).toBe(false);
    });

    it("tracks different tiers independently", () => {
      const config = { maxRequests: 1, windowMs: 60_000 };

      const r1 = checkRateLimit("auth", "ip-1", config);
      expect(r1.allowed).toBe(true);

      // Same IP, different tier — allowed
      const r2 = checkRateLimit("api", "ip-1", config);
      expect(r2.allowed).toBe(true);
    });

    it("resets after the time window expires", () => {
      vi.useFakeTimers();
      const config = { maxRequests: 1, windowMs: 1_000 };

      try {
        const r1 = checkRateLimit("test", "ip-1", config);
        expect(r1.allowed).toBe(true);

        const r2 = checkRateLimit("test", "ip-1", config);
        expect(r2.allowed).toBe(false);

        // Advance past the window
        vi.advanceTimersByTime(1_100);

        const r3 = checkRateLimit("test", "ip-1", config);
        expect(r3.allowed).toBe(true);
      } finally {
        vi.useRealTimers();
      }
    });

    it("returns correct retryAfterSeconds", () => {
      vi.useFakeTimers({ now: 1000000 });
      const config = { maxRequests: 1, windowMs: 30_000 };

      try {
        checkRateLimit("test", "ip-1", config);

        const result = checkRateLimit("test", "ip-1", config);
        expect(result.allowed).toBe(false);
        expect(result.retryAfterSeconds).toBeGreaterThanOrEqual(1);
        expect(result.retryAfterSeconds).toBeLessThanOrEqual(30);
      } finally {
        vi.useRealTimers();
      }
    });

    it("returns correct resetAt timestamp", () => {
      const before = Date.now();
      const config = { maxRequests: 5, windowMs: 60_000 };

      const result = checkRateLimit("test", "ip-1", config);
      const after = Date.now();

      expect(result.resetAt).toBeGreaterThanOrEqual(before + 60_000);
      expect(result.resetAt).toBeLessThanOrEqual(after + 60_000);
    });
  });

  describe("pre-configured tiers", () => {
    it("AUTH_LIMIT is 10 per 60s", () => {
      expect(AUTH_LIMIT.maxRequests).toBe(10);
      expect(AUTH_LIMIT.windowMs).toBe(60_000);
    });

    it("API_MUTATING_LIMIT is 60 per 60s", () => {
      expect(API_MUTATING_LIMIT.maxRequests).toBe(60);
      expect(API_MUTATING_LIMIT.windowMs).toBe(60_000);
    });

    it("API_GENERAL_LIMIT is 100 per 60s", () => {
      expect(API_GENERAL_LIMIT.maxRequests).toBe(100);
      expect(API_GENERAL_LIMIT.windowMs).toBe(60_000);
    });

    it("PUBLIC_API_LIMIT is 30 per 60s", () => {
      expect(PUBLIC_API_LIMIT.maxRequests).toBe(30);
      expect(PUBLIC_API_LIMIT.windowMs).toBe(60_000);
    });
  });

  describe("getClientIp", () => {
    it("extracts IP from x-forwarded-for header", () => {
      const req = new Request("http://localhost", {
        headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
      });
      expect(getClientIp(req)).toBe("1.2.3.4");
    });

    it("extracts IP from x-real-ip header", () => {
      const req = new Request("http://localhost", {
        headers: { "x-real-ip": "10.0.0.1" },
      });
      expect(getClientIp(req)).toBe("10.0.0.1");
    });

    it("prefers x-forwarded-for over x-real-ip", () => {
      const req = new Request("http://localhost", {
        headers: {
          "x-forwarded-for": "1.2.3.4",
          "x-real-ip": "10.0.0.1",
        },
      });
      expect(getClientIp(req)).toBe("1.2.3.4");
    });

    it("returns 'unknown' when no IP headers are present", () => {
      const req = new Request("http://localhost");
      expect(getClientIp(req)).toBe("unknown");
    });
  });

  describe("rateLimitResponse", () => {
    it("returns 429 status with correct headers", () => {
      const result = {
        allowed: false,
        remaining: 0,
        resetAt: Date.now() + 30_000,
        retryAfterSeconds: 30,
      };

      const response = rateLimitResponse(result);

      expect(response.status).toBe(429);
      expect(response.headers.get("Retry-After")).toBe("30");
      expect(response.headers.get("X-RateLimit-Remaining")).toBe("0");
      expect(response.headers.get("X-RateLimit-Reset")).toBeDefined();
    });

    it("returns correct JSON body", async () => {
      const result = {
        allowed: false,
        remaining: 0,
        resetAt: Date.now() + 30_000,
        retryAfterSeconds: 30,
      };

      const response = rateLimitResponse(result);
      const body = await response.json();

      expect(body.error).toBe("Too many requests. Please try again later.");
      expect(body.code).toBe("RATE_LIMIT");
      expect(body.retryAfter).toBe(30);
    });
  });
});
