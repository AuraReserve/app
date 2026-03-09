import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockGetSession = vi.fn();
const mockCheckSpaceAccess = vi.fn();
const mockCheckCsrfToken = vi.fn();

vi.mock("@/lib/auth-utils", () => ({
  getSession: () => mockGetSession(),
}));

vi.mock("@/lib/csrf", () => ({
  checkCsrfToken: (...args: unknown[]) => mockCheckCsrfToken(...args),
}));

vi.mock("@/lib/dal", () => ({
  checkSpaceAccess: (...args: unknown[]) => mockCheckSpaceAccess(...args),
}));

import { spaceRoute, ApiSuccess } from "@/lib/api";

const session = {
  user: { id: "user-1", email: "test@test.com", role: "admin" },
};

function makeRequest(url: string, method = "GET") {
  return new NextRequest(new URL(url, "http://localhost"), { method });
}

describe("spaceRoute", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockGetSession.mockResolvedValue(session);
    mockCheckSpaceAccess.mockResolvedValue({ hasAccess: true, isAdmin: true, role: "admin" });
    mockCheckCsrfToken.mockResolvedValue(true);
  });

  it("returns 401 when not authenticated", async () => {
    mockGetSession.mockResolvedValue(null);

    const handler = spaceRoute(
      { label: "test" },
      async () => ApiSuccess.ok({ ok: true })
    );

    const res = await handler(
      makeRequest("http://localhost/api/spaces/sp1/test"),
      { params: Promise.resolve({ spaceId: "sp1" }) }
    );

    expect(res.status).toBe(401);
  });

  it("returns 403 when user has no space access (read)", async () => {
    mockCheckSpaceAccess.mockResolvedValue({ hasAccess: false, isAdmin: false, role: null });

    const handler = spaceRoute(
      { label: "test" },
      async () => ApiSuccess.ok({ ok: true })
    );

    const res = await handler(
      makeRequest("http://localhost/api/spaces/sp1/test"),
      { params: Promise.resolve({ spaceId: "sp1" }) }
    );

    expect(res.status).toBe(403);
  });

  it("returns 403 when user is not admin (admin required)", async () => {
    mockCheckSpaceAccess.mockResolvedValue({ hasAccess: true, isAdmin: false, role: "member" });

    const handler = spaceRoute(
      { requiredAccess: "admin", label: "test" },
      async () => ApiSuccess.ok({ ok: true })
    );

    const res = await handler(
      makeRequest("http://localhost/api/spaces/sp1/test", "POST"),
      { params: Promise.resolve({ spaceId: "sp1" }) }
    );

    expect(res.status).toBe(403);
  });

  it("returns 403 when user is member (auditor required)", async () => {
    mockCheckSpaceAccess.mockResolvedValue({ hasAccess: true, isAdmin: false, role: "member" });

    const handler = spaceRoute(
      { requiredAccess: "auditor", label: "test" },
      async () => ApiSuccess.ok({ ok: true })
    );

    const res = await handler(
      makeRequest("http://localhost/api/spaces/sp1/test", "POST"),
      { params: Promise.resolve({ spaceId: "sp1" }) }
    );

    expect(res.status).toBe(403);
  });

  it("allows auditor when auditor access required", async () => {
    mockCheckSpaceAccess.mockResolvedValue({ hasAccess: true, isAdmin: false, role: "auditor" });

    const handler = spaceRoute(
      { requiredAccess: "auditor", label: "test" },
      async () => ApiSuccess.ok({ ok: true })
    );

    const res = await handler(
      makeRequest("http://localhost/api/spaces/sp1/test", "POST"),
      { params: Promise.resolve({ spaceId: "sp1" }) }
    );

    expect(res.status).toBe(200);
  });

  it("checks CSRF for POST requests", async () => {
    mockCheckCsrfToken.mockResolvedValue(false);

    const handler = spaceRoute(
      { label: "test" },
      async () => ApiSuccess.ok({ ok: true })
    );

    const res = await handler(
      makeRequest("http://localhost/api/spaces/sp1/test", "POST"),
      { params: Promise.resolve({ spaceId: "sp1" }) }
    );
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.code).toBe("CSRF_INVALID");
  });

  it("does not check CSRF for GET requests", async () => {
    const handler = spaceRoute(
      { label: "test" },
      async () => ApiSuccess.ok({ ok: true })
    );

    const res = await handler(
      makeRequest("http://localhost/api/spaces/sp1/test"),
      { params: Promise.resolve({ spaceId: "sp1" }) }
    );

    expect(res.status).toBe(200);
    expect(mockCheckCsrfToken).not.toHaveBeenCalled();
  });

  it("skips CSRF when csrf option is false", async () => {
    const handler = spaceRoute(
      { label: "test", csrf: false },
      async () => ApiSuccess.ok({ ok: true })
    );

    const res = await handler(
      makeRequest("http://localhost/api/spaces/sp1/test", "POST"),
      { params: Promise.resolve({ spaceId: "sp1" }) }
    );

    expect(res.status).toBe(200);
    expect(mockCheckCsrfToken).not.toHaveBeenCalled();
  });

  it("passes resolved params to handler", async () => {
    const handler = spaceRoute<{ streamId: string }>(
      { label: "test" },
      async ({ params }) => ApiSuccess.ok({ spaceId: params.spaceId, streamId: params.streamId })
    );

    const res = await handler(
      makeRequest("http://localhost/api/spaces/sp1/stores/st1"),
      { params: Promise.resolve({ spaceId: "sp1", streamId: "st1" }) }
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.spaceId).toBe("sp1");
    expect(body.streamId).toBe("st1");
  });

  it("catches handler errors and returns 500", async () => {
    const handler = spaceRoute(
      { label: "do something" },
      async () => { throw new Error("boom"); }
    );

    const res = await handler(
      makeRequest("http://localhost/api/spaces/sp1/test"),
      { params: Promise.resolve({ spaceId: "sp1" }) }
    );
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe("Failed to do something");
  });

  it("passes session and access to handler", async () => {
    const handler = spaceRoute(
      { label: "test" },
      async ({ session: s, access }) => ApiSuccess.ok({ userId: s.user.id, role: access.role })
    );

    const res = await handler(
      makeRequest("http://localhost/api/spaces/sp1/test"),
      { params: Promise.resolve({ spaceId: "sp1" }) }
    );
    const body = await res.json();

    expect(body.userId).toBe("user-1");
    expect(body.role).toBe("admin");
  });
});
