import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ──────────────────────────────────────────────────────────

const mockUserFindUnique = vi.fn();
const mockGeneratePasswordResetToken = vi.fn();
const mockSendPasswordResetEmail = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
    },
  },
}));

vi.mock("@/lib/auth-helpers", () => ({
  generatePasswordResetToken: (...args: unknown[]) => mockGeneratePasswordResetToken(...args),
}));

vi.mock("@/lib/email", () => ({
  sendPasswordResetEmail: (...args: unknown[]) => mockSendPasswordResetEmail(...args),
}));

vi.mock("@/lib/auth-env", () => ({
  getAuthBaseUrl: () => "http://localhost:3000",
}));

const { POST } = await import("@/app/api/auth/forgot-password/route");

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest(new URL("http://localhost:3000/api/auth/forgot-password"), {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/auth/forgot-password", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when email is missing", async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Email is required");
  });

  it("returns success even when user does not exist (prevents enumeration)", async () => {
    mockUserFindUnique.mockResolvedValue(null);

    const res = await POST(makeRequest({ email: "noone@example.com" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.message).toMatch(/if an account exists/i);

    // Should NOT generate token or send email
    expect(mockGeneratePasswordResetToken).not.toHaveBeenCalled();
    expect(mockSendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it("returns success without sending for OAuth-only user (no password)", async () => {
    mockUserFindUnique.mockResolvedValue({
      id: "user-1",
      email: "oauth@example.com",
      password: null,
    });

    const res = await POST(makeRequest({ email: "oauth@example.com" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);

    expect(mockGeneratePasswordResetToken).not.toHaveBeenCalled();
  });

  it("generates token and sends email for valid user with password", async () => {
    mockUserFindUnique.mockResolvedValue({
      id: "user-2",
      email: "user@example.com",
      password: "$2b$10$hashedpassword",
    });
    mockGeneratePasswordResetToken.mockResolvedValue("reset-token-123");
    mockSendPasswordResetEmail.mockResolvedValue(true);

    const res = await POST(makeRequest({ email: "user@example.com" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);

    expect(mockGeneratePasswordResetToken).toHaveBeenCalledWith("user@example.com");
    expect(mockSendPasswordResetEmail).toHaveBeenCalledWith(
      "user@example.com",
      "reset-token-123",
      "http://localhost:3000"
    );
  });
});
