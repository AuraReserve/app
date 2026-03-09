import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ──────────────────────────────────────────────────────────

const mockVerificationFindFirst = vi.fn();
const mockVerificationDelete = vi.fn();
const mockVerificationDeleteMany = vi.fn();
const mockVerificationCreate = vi.fn();
const mockUserFindUnique = vi.fn();
const mockUserUpdate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    verification: {
      findFirst: (...args: unknown[]) => mockVerificationFindFirst(...args),
      delete: (...args: unknown[]) => mockVerificationDelete(...args),
      deleteMany: (...args: unknown[]) => mockVerificationDeleteMany(...args),
      create: (...args: unknown[]) => mockVerificationCreate(...args),
    },
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
      update: (...args: unknown[]) => mockUserUpdate(...args),
    },
  },
}));

vi.mock("@/lib/auth-env", () => ({
  getAuthBaseUrl: () => "http://localhost:3000",
}));

vi.mock("@/lib/email", () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue(true),
}));

const { GET, POST } = await import("@/app/api/auth/verify-email/route");

function makeRequest(url: string, method = "GET", body?: Record<string, unknown>) {
  const init: RequestInit = { method };
  if (body) {
    init.body = JSON.stringify(body);
    init.headers = { "content-type": "application/json" };
  }
  return new NextRequest(new URL(url, "http://localhost:3000"), init as Record<string, unknown>);
}

// ── GET (verify token) ────────────────────────────────────────────

describe("GET /api/auth/verify-email", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when no token is provided", async () => {
    const req = makeRequest("/api/auth/verify-email");
    const res = await GET(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Verification token is required");
  });

  it("returns 400 when token is invalid", async () => {
    mockVerificationFindFirst.mockResolvedValue(null);

    const req = makeRequest("/api/auth/verify-email?token=invalid-token");
    const res = await GET(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Invalid or expired verification token");
  });

  it("returns 400 and deletes token when expired", async () => {
    mockVerificationFindFirst.mockResolvedValue({
      id: "v-1",
      identifier: "test@example.com",
      value: "expired-token",
      expiresAt: new Date(Date.now() - 1000), // expired
    });
    mockVerificationDelete.mockResolvedValue({});

    const req = makeRequest("/api/auth/verify-email?token=expired-token");
    const res = await GET(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Verification token has expired");
    expect(mockVerificationDelete).toHaveBeenCalledWith({ where: { id: "v-1" } });
  });

  it("returns 404 when user not found for token", async () => {
    mockVerificationFindFirst.mockResolvedValue({
      id: "v-2",
      identifier: "ghost@example.com",
      value: "valid-token",
      expiresAt: new Date(Date.now() + 86400000),
    });
    mockUserFindUnique.mockResolvedValue(null);

    const req = makeRequest("/api/auth/verify-email?token=valid-token");
    const res = await GET(req);
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe("User not found");
  });

  it("verifies email, updates user, and deletes token on success", async () => {
    mockVerificationFindFirst.mockResolvedValue({
      id: "v-3",
      identifier: "user@example.com",
      value: "good-token",
      expiresAt: new Date(Date.now() + 86400000),
    });
    mockUserFindUnique.mockResolvedValue({
      id: "user-1",
      email: "user@example.com",
      emailVerified: false,
    });
    mockUserUpdate.mockResolvedValue({});
    mockVerificationDelete.mockResolvedValue({});

    const req = makeRequest("/api/auth/verify-email?token=good-token");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.message).toBe("Email verified successfully");

    expect(mockUserUpdate).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { emailVerified: true },
    });
    expect(mockVerificationDelete).toHaveBeenCalledWith({ where: { id: "v-3" } });
  });
});

// ── POST (resend verification) ────────────────────────────────────

describe("POST /api/auth/verify-email", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when no email is provided", async () => {
    const req = makeRequest("/api/auth/verify-email", "POST", {});
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Email is required");
  });

  it("returns success even when user does not exist (security)", async () => {
    mockUserFindUnique.mockResolvedValue(null);

    const req = makeRequest("/api/auth/verify-email", "POST", { email: "noone@example.com" });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    // Should NOT reveal that user doesn't exist
    expect(data.message).toMatch(/if the email exists/i);
  });

  it("returns success without sending when user is already verified (security)", async () => {
    mockUserFindUnique.mockResolvedValue({
      id: "user-1",
      email: "verified@example.com",
      emailVerified: true,
    });

    const req = makeRequest("/api/auth/verify-email", "POST", { email: "verified@example.com" });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    // Should NOT create a new token or send email
    expect(mockVerificationDeleteMany).not.toHaveBeenCalled();
    expect(mockVerificationCreate).not.toHaveBeenCalled();
  });

  it("generates new token and sends email for unverified user", async () => {
    mockUserFindUnique.mockResolvedValue({
      id: "user-2",
      email: "unverified@example.com",
      emailVerified: false,
    });
    mockVerificationDeleteMany.mockResolvedValue({});
    mockVerificationCreate.mockResolvedValue({});

    const req = makeRequest("/api/auth/verify-email", "POST", { email: "unverified@example.com" });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.message).toBe("Verification email sent");

    // Should delete old tokens
    expect(mockVerificationDeleteMany).toHaveBeenCalledWith({
      where: { identifier: "unverified@example.com" },
    });

    // Should create new token
    expect(mockVerificationCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        identifier: "unverified@example.com",
        value: expect.any(String),
        expiresAt: expect.any(Date),
      }),
    });
  });
});
