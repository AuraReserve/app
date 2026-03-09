/**
 * Tests for requireAuth() enforcement of email verification and
 * registration settings enforcement via databaseHooks.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock session ──────────────────────────────────────────────────

const mockGetExtendedSession = vi.fn();

vi.mock("@/lib/auth", () => ({
  getExtendedSession: (...args: unknown[]) => mockGetExtendedSession(...args),
}));

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(new Headers()),
}));

// ── Mock settings ─────────────────────────────────────────────────

const mockGetRegistrationSettings = vi.fn();

vi.mock("@/lib/settings", () => ({
  getRegistrationSettings: () => mockGetRegistrationSettings(),
}));

// ── Mock prisma (for functions that use it directly) ──────────────

vi.mock("@/lib/prisma", () => ({
  prisma: {
    spaceUser: { findFirst: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
    space: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));

vi.mock("@prisma/client", () => ({
  SpaceRole: { ADMIN: "admin", AUDITOR: "auditor", MEMBER: "member" },
}));

const { requireAuth } = await import("@/lib/auth-utils");

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    user: {
      id: "user-1",
      email: "test@example.com",
      name: "Test User",
      role: "admin",
      permissions: {},
      twoFactorEnabled: false,
      emailVerified: true,
      spaces: [],
      ...overrides,
    },
    session: {
      id: "session-1",
      userId: "user-1",
      expiresAt: new Date(Date.now() + 86400000),
    },
  };
}

describe("requireAuth email verification enforcement", () => {
  beforeEach(() => {
    mockGetExtendedSession.mockReset();
    mockGetRegistrationSettings.mockReset();
  });

  it("passes when user is authenticated and email is verified", async () => {
    mockGetExtendedSession.mockResolvedValue(makeSession({ emailVerified: true }));
    mockGetRegistrationSettings.mockResolvedValue({
      signupEnabled: true,
      allowSelfRegistration: true,
      requireEmailVerification: true,
    });

    const user = await requireAuth();
    expect(user.id).toBe("user-1");
  });

  it("passes when email is unverified but verification is not required", async () => {
    mockGetExtendedSession.mockResolvedValue(makeSession({ emailVerified: false }));
    mockGetRegistrationSettings.mockResolvedValue({
      signupEnabled: true,
      allowSelfRegistration: true,
      requireEmailVerification: false,
    });

    const user = await requireAuth();
    expect(user.id).toBe("user-1");
  });

  it("throws when email is unverified and verification is required", async () => {
    mockGetExtendedSession.mockResolvedValue(makeSession({ emailVerified: false }));
    mockGetRegistrationSettings.mockResolvedValue({
      signupEnabled: true,
      allowSelfRegistration: true,
      requireEmailVerification: true,
    });

    await expect(requireAuth()).rejects.toThrow("Forbidden: Email verification required");
  });

  it("throws Unauthorized when not authenticated", async () => {
    mockGetExtendedSession.mockResolvedValue(null);

    await expect(requireAuth()).rejects.toThrow("Unauthorized");
  });

  it("skips settings check when email is already verified (no DB call)", async () => {
    mockGetExtendedSession.mockResolvedValue(makeSession({ emailVerified: true }));

    await requireAuth();

    // When email is verified, no need to check settings
    expect(mockGetRegistrationSettings).not.toHaveBeenCalled();
  });
});
