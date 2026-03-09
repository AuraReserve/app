import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock auth-env to provide a secret
vi.mock("@/lib/auth-env", () => ({
  requireAuthSecret: () => "test-secret-key-for-csrf-testing",
}));

describe("CSRF protection", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  describe("generateCsrfToken", () => {
    it("returns a token with format: random.signature", async () => {
      const { generateCsrfToken } = await import("@/lib/csrf");
      const token = await generateCsrfToken();

      expect(token).toMatch(/^[a-f0-9]+\.[a-f0-9]+$/);
      const [random, signature] = token.split(".");
      expect(random.length).toBe(64); // 32 bytes hex
      expect(signature.length).toBe(64); // HMAC-SHA256 hex
    });

    it("generates unique tokens each time", async () => {
      const { generateCsrfToken } = await import("@/lib/csrf");
      const t1 = await generateCsrfToken();
      const t2 = await generateCsrfToken();

      expect(t1).not.toBe(t2);
    });
  });

  describe("verifyCsrfToken", () => {
    it("returns true for a valid token", async () => {
      const { generateCsrfToken, verifyCsrfToken } = await import("@/lib/csrf");
      const token = await generateCsrfToken();

      expect(await verifyCsrfToken(token)).toBe(true);
    });

    it("returns false for a tampered signature", async () => {
      const { generateCsrfToken, verifyCsrfToken } = await import("@/lib/csrf");
      const token = await generateCsrfToken();
      const [random] = token.split(".");
      const tampered = `${random}.${"a".repeat(64)}`;

      expect(await verifyCsrfToken(tampered)).toBe(false);
    });

    it("returns false for a tampered random part", async () => {
      const { generateCsrfToken, verifyCsrfToken } = await import("@/lib/csrf");
      const token = await generateCsrfToken();
      const [, signature] = token.split(".");
      const tampered = `${"b".repeat(64)}.${signature}`;

      expect(await verifyCsrfToken(tampered)).toBe(false);
    });

    it("returns false for empty string", async () => {
      const { verifyCsrfToken } = await import("@/lib/csrf");
      expect(await verifyCsrfToken("")).toBe(false);
    });

    it("returns false for string without separator", async () => {
      const { verifyCsrfToken } = await import("@/lib/csrf");
      expect(await verifyCsrfToken("notavalidtoken")).toBe(false);
    });
  });

  describe("checkCsrfToken", () => {
    it("returns true for GET requests without token", async () => {
      const { checkCsrfToken } = await import("@/lib/csrf");
      const { NextRequest } = await import("next/server");
      const req = new NextRequest(new URL("http://localhost/api/test"), { method: "GET" });

      expect(await checkCsrfToken(req)).toBe(true);
    });

    it("returns false for POST requests without token", async () => {
      const { checkCsrfToken } = await import("@/lib/csrf");
      const { NextRequest } = await import("next/server");
      const req = new NextRequest(new URL("http://localhost/api/test"), {
        method: "POST",
        body: "{}",
      });

      expect(await checkCsrfToken(req)).toBe(false);
    });

    it("returns true for POST with valid x-csrf-token header", async () => {
      const { checkCsrfToken, generateCsrfToken } = await import("@/lib/csrf");
      const { NextRequest } = await import("next/server");
      const token = await generateCsrfToken();
      const req = new NextRequest(new URL("http://localhost/api/test"), {
        method: "POST",
        headers: { "x-csrf-token": token },
        body: "{}",
      });

      expect(await checkCsrfToken(req)).toBe(true);
    });

    it("rejects POST with invalid x-csrf-token header", async () => {
      const { checkCsrfToken } = await import("@/lib/csrf");
      const { NextRequest } = await import("next/server");
      const req = new NextRequest(new URL("http://localhost/api/test"), {
        method: "POST",
        headers: { "x-csrf-token": "invalid.token" },
        body: "{}",
      });

      expect(await checkCsrfToken(req)).toBe(false);
    });

    it("does NOT accept token from cookie (header-only enforcement)", async () => {
      const { checkCsrfToken, generateCsrfToken } = await import("@/lib/csrf");
      const { NextRequest } = await import("next/server");
      const token = await generateCsrfToken();

      // Create request with token in cookie but NOT in header
      const req = new NextRequest(new URL("http://localhost/api/test"), {
        method: "POST",
        body: "{}",
        headers: {
          cookie: `csrf-token=${token}`,
        },
      });

      expect(await checkCsrfToken(req)).toBe(false);
    });

    it("returns true for DELETE with valid header", async () => {
      const { checkCsrfToken, generateCsrfToken } = await import("@/lib/csrf");
      const { NextRequest } = await import("next/server");
      const token = await generateCsrfToken();
      const req = new NextRequest(new URL("http://localhost/api/test"), {
        method: "DELETE",
        headers: { "x-csrf-token": token },
      });

      expect(await checkCsrfToken(req)).toBe(true);
    });

    it("returns true for PATCH with valid header", async () => {
      const { checkCsrfToken, generateCsrfToken } = await import("@/lib/csrf");
      const { NextRequest } = await import("next/server");
      const token = await generateCsrfToken();
      const req = new NextRequest(new URL("http://localhost/api/test"), {
        method: "PATCH",
        headers: { "x-csrf-token": token },
        body: "{}",
      });

      expect(await checkCsrfToken(req)).toBe(true);
    });
  });

  describe("getCsrfTokenHandler", () => {
    it("returns token in JSON body and sets cookie", async () => {
      const { getCsrfTokenHandler, verifyCsrfToken } = await import("@/lib/csrf");
      const response = await getCsrfTokenHandler();
      const data = await response.json();

      expect(data.csrfToken).toBeDefined();
      expect(typeof data.csrfToken).toBe("string");
      expect(await verifyCsrfToken(data.csrfToken)).toBe(true);

      // Check cookie was set
      const setCookie = response.headers.get("set-cookie");
      expect(setCookie).toContain("csrf-token=");
    });
  });
});
