import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  auth: (handler: unknown) => handler,
}));

vi.mock("@/lib/request-size-limit", () => ({
  checkRequestSize: vi.fn().mockReturnValue(null),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  rateLimitResponse: vi.fn(),
  AUTH_LIMIT: { maxRequests: 100, windowMs: 60000 },
  API_MUTATING_LIMIT: { maxRequests: 100, windowMs: 60000 },
  API_GENERAL_LIMIT: { maxRequests: 100, windowMs: 60000 },
  PUBLIC_API_LIMIT: { maxRequests: 100, windowMs: 60000 },
}));

const proxyModule = await import("@/proxy");
const proxyHandler = proxyModule.default;
type ProxyRequest = Parameters<typeof proxyHandler>[0];

const createRequest = (inputUrl: string, options: { method?: string; auth?: unknown } = {}) => {
  const url = new URL(inputUrl);

  return {
    method: options.method ?? "GET",
    auth: options.auth,
    url: url.toString(),
    cookies: {
      get: () => undefined,
    },
    nextUrl: {
      pathname: url.pathname,
      search: url.search,
      searchParams: url.searchParams,
    },
  } as unknown as ProxyRequest;
};

describe("proxy authentication enforcement", () => {
  it("redirects unauthenticated requests to protected routes with callbackUrl preserved", async () => {
    const response = await proxyHandler(createRequest("https://app.aura.test/dashboard?tab=overview"));

    expect(response.status).toBe(302);
    const location = response.headers.get("location");
    expect(location).toBeTruthy();
    const redirectUrl = new URL(location!);
    expect(redirectUrl.pathname).toBe("/auth/signin");
    expect(redirectUrl.searchParams.get("callbackUrl")).toBe("/dashboard?tab=overview");
  });

  it("allows unauthenticated access to public endpoints", async () => {
    const apiResponse = await proxyHandler(createRequest("https://app.aura.test/api/health"));
    const signupResponse = await proxyHandler(createRequest("https://app.aura.test/auth/signup"));

    expect(apiResponse.status).toBe(200);
    expect(apiResponse.headers.get("location")).toBeNull();

    expect(signupResponse.status).toBe(200);
    expect(signupResponse.headers.get("location")).toBeNull();
  });
});
