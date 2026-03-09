import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockCheckRequestSize = vi.fn();
const mockCheckRateLimit = vi.fn();
const mockGetClientIp = vi.fn();

vi.mock("@/lib/request-size-limit", () => ({
  checkRequestSize: (...args: unknown[]) => mockCheckRequestSize(...args),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  getClientIp: (...args: unknown[]) => mockGetClientIp(...args),
  rateLimitResponse: () => {
    const { NextResponse } = require("next/server");
    return NextResponse.json(
      { error: "Too many requests.", code: "RATE_LIMIT" },
      { status: 429 }
    );
  },
  AUTH_LIMIT: { maxRequests: 10, windowMs: 60_000 },
  API_MUTATING_LIMIT: { maxRequests: 60, windowMs: 60_000 },
  API_GENERAL_LIMIT: { maxRequests: 100, windowMs: 60_000 },
  PUBLIC_API_LIMIT: { maxRequests: 30, windowMs: 60_000 },
}));

function makeRequest(url: string, method = "GET", cookie?: string) {
  const headers: Record<string, string> = {};
  if (cookie) headers.cookie = cookie;
  return new NextRequest(new URL(url, "http://localhost"), { method, headers });
}

const allowedResult = { allowed: true, remaining: 99, resetAt: Date.now() + 60_000, retryAfterSeconds: 60 };
const blockedResult = { allowed: false, remaining: 0, resetAt: Date.now() + 30_000, retryAfterSeconds: 30 };

describe("Middleware", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockCheckRequestSize.mockReturnValue(null);
    mockCheckRateLimit.mockReturnValue(allowedResult);
    mockGetClientIp.mockReturnValue("1.2.3.4");
  });

  describe("rate limiting", () => {
    it("rate-limits /api/auth endpoints", async () => {
      mockCheckRateLimit.mockReturnValue(blockedResult);

      const middleware = (await import("@/proxy")).default;
      const req = makeRequest("http://localhost/api/auth/sign-in/email", "POST");
      const res = await middleware(req);

      expect(res.status).toBe(429);
      expect(mockCheckRateLimit).toHaveBeenCalledWith("auth", "1.2.3.4", expect.anything());
    });

    it("rate-limits /api/v1/ public API endpoints", async () => {
      mockCheckRateLimit.mockReturnValue(blockedResult);

      const middleware = (await import("@/proxy")).default;
      const req = makeRequest("http://localhost/api/v1/reserves/abc/streams");
      const res = await middleware(req);

      expect(res.status).toBe(429);
      expect(mockCheckRateLimit).toHaveBeenCalledWith("public-api", "1.2.3.4", expect.anything());
    });

    it("rate-limits mutating /api/spaces/ requests", async () => {
      mockCheckRateLimit.mockReturnValue(blockedResult);

      const middleware = (await import("@/proxy")).default;
      const req = makeRequest("http://localhost/api/spaces/sp1/stores", "POST");
      const res = await middleware(req);

      expect(res.status).toBe(429);
      expect(mockCheckRateLimit).toHaveBeenCalledWith("api-mutating", "1.2.3.4", expect.anything());
    });

    it("rate-limits GET /api/spaces/ with general tier", async () => {
      mockCheckRateLimit.mockReturnValue(blockedResult);

      const middleware = (await import("@/proxy")).default;
      const req = makeRequest("http://localhost/api/spaces/sp1/stores", "GET", "better-auth.session_token=abc");
      const res = await middleware(req);

      expect(res.status).toBe(429);
      expect(mockCheckRateLimit).toHaveBeenCalledWith("api-general", "1.2.3.4", expect.anything());
    });

    it("rate-limits /api/entities/ mutating requests", async () => {
      mockCheckRateLimit.mockReturnValue(blockedResult);

      const middleware = (await import("@/proxy")).default;
      const req = makeRequest("http://localhost/api/entities/spaces", "POST");
      const res = await middleware(req);

      expect(res.status).toBe(429);
      expect(mockCheckRateLimit).toHaveBeenCalledWith("api-mutating", "1.2.3.4", expect.anything());
    });

    it("allows requests within the rate limit", async () => {
      mockCheckRateLimit.mockReturnValue(allowedResult);

      const middleware = (await import("@/proxy")).default;
      const req = makeRequest("http://localhost/api/auth/session", "GET");
      const res = await middleware(req);

      // Auth routes are public — should pass through
      expect(res.status).toBe(200);
    });
  });

  describe("authentication", () => {
    it("allows public auth routes without session", async () => {
      const middleware = (await import("@/proxy")).default;
      const req = makeRequest("http://localhost/auth/signin");
      const res = await middleware(req);

      expect(res.status).toBe(200);
    });

    it("allows /auth/signup without session", async () => {
      const middleware = (await import("@/proxy")).default;
      const req = makeRequest("http://localhost/auth/signup");
      const res = await middleware(req);

      expect(res.status).toBe(200);
    });

    it("allows /api/auth/sign-up/email POST without session", async () => {
      const middleware = (await import("@/proxy")).default;
      const req = makeRequest("http://localhost/api/auth/sign-up/email", "POST");
      const res = await middleware(req);

      expect(res.status).toBe(200);
    });

    it("allows /api/settings?public=true without session", async () => {
      const middleware = (await import("@/proxy")).default;
      const req = makeRequest("http://localhost/api/settings?public=true");
      const res = await middleware(req);

      expect(res.status).toBe(200);
    });

    it("blocks /api/settings without public=true when unauthenticated", async () => {
      const middleware = (await import("@/proxy")).default;
      const req = makeRequest("http://localhost/api/settings");
      const res = await middleware(req);

      expect(res.status).toBe(401);
    });

    it("allows /api/health without session", async () => {
      const middleware = (await import("@/proxy")).default;
      const req = makeRequest("http://localhost/api/health");
      const res = await middleware(req);

      expect(res.status).toBe(200);
    });

    it("redirects unauthenticated page requests to sign-in", async () => {
      const middleware = (await import("@/proxy")).default;
      const req = makeRequest("http://localhost/spaces/my-space");
      const res = await middleware(req);

      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toContain("/auth/signin");
    });

    it("returns 401 for unauthenticated API requests", async () => {
      const middleware = (await import("@/proxy")).default;
      const req = makeRequest("http://localhost/api/spaces/sp1/stores");
      const res = await middleware(req);

      expect(res.status).toBe(401);
    });

    it("allows authenticated requests with session cookie", async () => {
      const middleware = (await import("@/proxy")).default;
      const req = makeRequest("http://localhost/api/spaces/sp1/stores", "GET", "better-auth.session_token=abc");
      const res = await middleware(req);

      expect(res.status).toBe(200);
    });
  });

  describe("request size limits", () => {
    it("blocks oversized POST requests", async () => {
      const { NextResponse } = await import("next/server");
      mockCheckRequestSize.mockReturnValue(
        NextResponse.json({ error: "Too large" }, { status: 413 })
      );

      const middleware = (await import("@/proxy")).default;
      const req = makeRequest("http://localhost/api/spaces/sp1/stores", "POST", "better-auth.session_token=abc");
      const res = await middleware(req);

      expect(res.status).toBe(413);
    });

    it("does not check size for GET requests", async () => {
      const middleware = (await import("@/proxy")).default;
      const req = makeRequest("http://localhost/api/spaces/sp1/stores", "GET", "better-auth.session_token=abc");
      await middleware(req);

      expect(mockCheckRequestSize).not.toHaveBeenCalled();
    });
  });
});
