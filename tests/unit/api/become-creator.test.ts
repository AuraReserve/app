import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next/server", async (importOriginal) => {
  const mod = await importOriginal<typeof import("next/server")>();
  return { ...mod, after: vi.fn((fn: () => void) => fn()) };
});

const mockRequireAuth = vi.fn();
vi.mock("@/lib/auth-utils", () => ({
  requireAuth: () => mockRequireAuth(),
}));

const mockUserUpdate = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      update: (...args: unknown[]) => mockUserUpdate(...args),
    },
  },
}));

const mockEnv: Record<string, unknown> = { SELF_HOSTED: false };
vi.mock("@/lib/env", () => ({
  getEnv: () => mockEnv,
}));

vi.mock("@/lib/dal/audit", () => ({
  auditUserOperation: vi.fn(),
}));

const { POST } = await import("@/app/api/user/become-creator/route");

function makeRequest() {
  return new NextRequest("http://localhost/api/user/become-creator", {
    method: "POST",
  });
}

describe("POST /api/user/become-creator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv.SELF_HOSTED = false;
  });

  it("returns 401 if not authenticated", async () => {
    mockRequireAuth.mockRejectedValue(new Error("Unauthorized"));
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 403 in self-hosted mode", async () => {
    mockEnv.SELF_HOSTED = true;
    mockRequireAuth.mockResolvedValue({ id: "user-1", role: null });
    const res = await POST(makeRequest());
    expect(res.status).toBe(403);
  });

  it("returns 400 if user already has a platform role", async () => {
    mockRequireAuth.mockResolvedValue({ id: "user-1", role: "admin" });
    const res = await POST(makeRequest());
    expect(res.status).toBe(400);
  });

  it("assigns creator role to user with no platform role", async () => {
    mockRequireAuth.mockResolvedValue({ id: "user-1", role: null, email: "user@test.com" });
    mockUserUpdate.mockResolvedValue({ id: "user-1", role: "creator" });
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(mockUserUpdate).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { role: "CREATOR" },
    });
  });
});
