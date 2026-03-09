import { describe, it, expect } from "vitest";
import {
  extractApiKey,
  sanitizeIp,
  sanitizeUserAgent,
} from "@/lib/api/public-api-helpers";

function makeRequest(headers: Record<string, string> = {}) {
  return {
    headers: {
      get(name: string) {
        return headers[name.toLowerCase()] ?? null;
      },
    },
  } as unknown as import("next/server").NextRequest;
}

describe("Public API helpers", () => {
  describe("extractApiKey", () => {
    it("extracts key from x-api-key header", () => {
      const req = makeRequest({ "x-api-key": "my-key-123" });
      expect(extractApiKey(req)).toBe("my-key-123");
    });

    it("trims whitespace from x-api-key", () => {
      const req = makeRequest({ "x-api-key": "  padded-key  " });
      expect(extractApiKey(req)).toBe("padded-key");
    });

    it("extracts key from Bearer authorization header", () => {
      const req = makeRequest({ authorization: "Bearer token-abc" });
      expect(extractApiKey(req)).toBe("token-abc");
    });

    it("handles case-insensitive Bearer prefix", () => {
      const req = makeRequest({ authorization: "bearer lower-case" });
      expect(extractApiKey(req)).toBe("lower-case");
    });

    it("prefers x-api-key over Authorization", () => {
      const req = makeRequest({
        "x-api-key": "header-key",
        authorization: "Bearer auth-key",
      });
      expect(extractApiKey(req)).toBe("header-key");
    });

    it("returns null when no key is provided", () => {
      const req = makeRequest();
      expect(extractApiKey(req)).toBeNull();
    });

    it("returns null for non-Bearer authorization", () => {
      const req = makeRequest({ authorization: "Basic dXNlcjpwYXNz" });
      expect(extractApiKey(req)).toBeNull();
    });
  });

  describe("sanitizeIp", () => {
    it("returns unknown for null", () => {
      expect(sanitizeIp(null)).toBe("unknown");
    });

    it("returns unknown for undefined", () => {
      expect(sanitizeIp(undefined)).toBe("unknown");
    });

    it("returns the IP unchanged when no commas", () => {
      expect(sanitizeIp("192.168.1.1")).toBe("192.168.1.1");
    });

    it("takes the first IP from a comma-separated list", () => {
      expect(sanitizeIp("10.0.0.1, 192.168.1.1, 172.16.0.1")).toBe("10.0.0.1");
    });

    it("trims whitespace", () => {
      expect(sanitizeIp("  10.0.0.1  ")).toBe("10.0.0.1");
    });

    it("truncates to 255 characters", () => {
      const longIp = "a".repeat(300);
      expect(sanitizeIp(longIp).length).toBe(255);
    });
  });

  describe("sanitizeUserAgent", () => {
    it("returns unknown for null", () => {
      expect(sanitizeUserAgent(null)).toBe("unknown");
    });

    it("returns unknown for undefined", () => {
      expect(sanitizeUserAgent(undefined)).toBe("unknown");
    });

    it("returns short user agent unchanged", () => {
      const ua = "Mozilla/5.0 (Test)";
      expect(sanitizeUserAgent(ua)).toBe(ua);
    });

    it("truncates to 512 characters", () => {
      const longUa = "x".repeat(1000);
      expect(sanitizeUserAgent(longUa).length).toBe(512);
    });
  });
});
