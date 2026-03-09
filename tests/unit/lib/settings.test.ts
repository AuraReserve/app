import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    setting: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

const { getRegistrationSettings, clearSettingsCache } = await import("@/lib/settings");

describe("getRegistrationSettings", () => {
  beforeEach(() => {
    mockFindMany.mockReset();
    clearSettingsCache();
  });

  it("returns settings from the database", async () => {
    mockFindMany.mockResolvedValue([
      { key: "signup_enabled", value: "true" },
      { key: "allow_self_registration", value: "true" },
      { key: "require_email_verification", value: "false" },
    ]);

    const settings = await getRegistrationSettings();

    expect(settings).toEqual({
      signupEnabled: true,
      allowSelfRegistration: true,
      requireEmailVerification: false,
    });
  });

  it("returns false for missing settings", async () => {
    mockFindMany.mockResolvedValue([]);

    const settings = await getRegistrationSettings();

    expect(settings).toEqual({
      signupEnabled: false,
      allowSelfRegistration: false,
      requireEmailVerification: false,
    });
  });

  it("caches results for subsequent calls", async () => {
    mockFindMany.mockResolvedValue([
      { key: "signup_enabled", value: "true" },
      { key: "allow_self_registration", value: "true" },
      { key: "require_email_verification", value: "true" },
    ]);

    await getRegistrationSettings();
    await getRegistrationSettings();
    await getRegistrationSettings();

    // Should only hit the DB once due to caching
    expect(mockFindMany).toHaveBeenCalledTimes(1);
  });

  it("clears cache and refetches after clearSettingsCache", async () => {
    mockFindMany.mockResolvedValueOnce([
      { key: "signup_enabled", value: "true" },
      { key: "allow_self_registration", value: "true" },
      { key: "require_email_verification", value: "false" },
    ]);

    const first = await getRegistrationSettings();
    expect(first.requireEmailVerification).toBe(false);

    clearSettingsCache();

    mockFindMany.mockResolvedValueOnce([
      { key: "signup_enabled", value: "true" },
      { key: "allow_self_registration", value: "true" },
      { key: "require_email_verification", value: "true" },
    ]);

    const second = await getRegistrationSettings();
    expect(second.requireEmailVerification).toBe(true);
    expect(mockFindMany).toHaveBeenCalledTimes(2);
  });
});
