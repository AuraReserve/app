import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ──────────────────────────────────────────────────────────

const mockVerificationFindFirst = vi.fn();
const mockVerificationDelete = vi.fn();
const mockUserFindUnique = vi.fn();
const mockUserUpdate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    verification: {
      findFirst: (...args: unknown[]) => mockVerificationFindFirst(...args),
      delete: (...args: unknown[]) => mockVerificationDelete(...args),
    },
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
      update: (...args: unknown[]) => mockUserUpdate(...args),
    },
  },
}));

vi.mock("@/lib/password", () => ({
  validatePassword: (password: string) => {
    const errors: string[] = [];
    if (password.length < 8) errors.push("Password must be at least 8 characters long");
    if (!/[A-Z]/.test(password)) errors.push("Must contain uppercase");
    if (!/[a-z]/.test(password)) errors.push("Must contain lowercase");
    if (!/\d/.test(password)) errors.push("Must contain number");
    if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) errors.push("Must contain symbol");
    return { isValid: errors.length === 0, errors };
  },
  hashPassword: vi.fn().mockResolvedValue("$2b$10$newhash"),
}));

const { POST } = await import("@/app/api/auth/reset-password/route");

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest(new URL("http://localhost:3000/api/auth/reset-password"), {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/auth/reset-password", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when token is missing", async () => {
    const res = await POST(makeRequest({ password: "Secure@Pass1" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Reset token is required");
  });

  it("returns 400 when password is missing", async () => {
    const res = await POST(makeRequest({ token: "some-token" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("New password is required");
  });

  it("returns 400 when password is too weak", async () => {
    const res = await POST(makeRequest({ token: "some-token", password: "weak" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/password/i);
  });

  it("returns 400 when token is invalid", async () => {
    mockVerificationFindFirst.mockResolvedValue(null);

    const res = await POST(makeRequest({ token: "bad-token", password: "Secure@Pass1" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Invalid or expired reset token");
  });

  it("returns 400 and deletes token when expired", async () => {
    mockVerificationFindFirst.mockResolvedValue({
      id: "v-1",
      identifier: "reset:user@example.com",
      value: "expired-token",
      expiresAt: new Date(Date.now() - 1000),
    });
    mockVerificationDelete.mockResolvedValue({});

    const res = await POST(makeRequest({ token: "expired-token", password: "Secure@Pass1" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Reset token has expired");
    expect(mockVerificationDelete).toHaveBeenCalledWith({ where: { id: "v-1" } });
  });

  it("returns 404 when user not found for token email", async () => {
    mockVerificationFindFirst.mockResolvedValue({
      id: "v-2",
      identifier: "reset:ghost@example.com",
      value: "valid-token",
      expiresAt: new Date(Date.now() + 3600000),
    });
    mockUserFindUnique.mockResolvedValue(null);

    const res = await POST(makeRequest({ token: "valid-token", password: "Secure@Pass1" }));
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe("User not found");
  });

  it("resets password, updates user, and deletes token on success", async () => {
    mockVerificationFindFirst.mockResolvedValue({
      id: "v-3",
      identifier: "reset:user@example.com",
      value: "good-token",
      expiresAt: new Date(Date.now() + 3600000),
    });
    mockUserFindUnique.mockResolvedValue({
      id: "user-1",
      email: "user@example.com",
    });
    mockUserUpdate.mockResolvedValue({});
    mockVerificationDelete.mockResolvedValue({});

    const res = await POST(makeRequest({ token: "good-token", password: "Secure@Pass1" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.message).toBe("Password has been reset successfully");

    // Should update user's password with hashed value
    expect(mockUserUpdate).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { password: "$2b$10$newhash" },
    });

    // Should delete the used token
    expect(mockVerificationDelete).toHaveBeenCalledWith({ where: { id: "v-3" } });
  });
});
