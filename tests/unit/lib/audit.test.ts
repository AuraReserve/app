/**
 * Tests for audit logging DAL functions
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ──────────────────────────────────────────────────────────

const mockAuditLogCreate = vi.fn();
const mockAuditLogFindMany = vi.fn();
const mockAuditLogFindFirst = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    auditLog: {
      create: (...args: unknown[]) => mockAuditLogCreate(...args),
      findMany: (...args: unknown[]) => mockAuditLogFindMany(...args),
      findFirst: (...args: unknown[]) => mockAuditLogFindFirst(...args),
    },
  },
}));

vi.mock("@prisma/client", () => ({
  AuditAction: {
    CREATE: "CREATE",
    UPDATE: "UPDATE",
    DELETE: "DELETE",
    API_ACCESS: "API_ACCESS",
    LOGIN: "LOGIN",
    LOGOUT: "LOGOUT",
  },
  ResourceType: {
    SPACE: "SPACE",
    PROOF_OF_RESERVE: "PROOF_OF_RESERVE",
    API_KEY: "API_KEY",
    USER: "USER",
    SPACE_MEMBER: "SPACE_MEMBER",
    MERKLE_TREE: "MERKLE_TREE",
    SETTINGS: "SETTINGS",
    DATA_STREAM: "DATA_STREAM",
    STREAM_ENTRY: "STREAM_ENTRY",
    INTEGRATION: "INTEGRATION",
  },
}));

const {
  createAuditLog,
  extractRequestInfo,
  auditSpaceOperation,
  auditSettingsOperation,
  auditAuthEvent,
  auditApiKeyOperation,
} = await import("@/lib/dal/audit");

function makeRequest(headers: Record<string, string> = {}) {
  return new Request("http://localhost:3000/api/test", {
    headers: new Headers(headers),
  });
}

// ── createAuditLog ─────────────────────────────────────────────────

describe("createAuditLog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuditLogCreate.mockResolvedValue({
      id: "audit-1",
      action: "CREATE",
      resourceType: "SPACE",
      resourceId: "space-1",
      userEmail: "user@test.com",
      spaceId: "space-1",
      ipAddress: "127.0.0.1",
      userAgent: "test-agent",
      details: {},
      oldValues: null,
      newValues: { name: "Test" },
      createdDate: new Date(),
    });
  });

  it("creates an audit log entry with correct enum mapping", async () => {
    await createAuditLog({
      action: "create",
      resourceType: "space",
      resourceId: "space-1",
      userEmail: "user@test.com",
      spaceId: "space-1",
      ipAddress: "127.0.0.1",
      userAgent: "test-agent",
      newValues: { name: "Test" },
    });

    expect(mockAuditLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "CREATE",
        resourceType: "SPACE",
        resourceId: "space-1",
        userEmail: "user@test.com",
      }),
    });
  });

  it("returns mapped audit log record with lowercase types", async () => {
    const result = await createAuditLog({
      action: "create",
      resourceType: "space",
      resourceId: "space-1",
      userEmail: "user@test.com",
      ipAddress: "127.0.0.1",
      userAgent: "test-agent",
    });

    expect(result.action).toBe("create");
    expect(result.resourceType).toBe("space");
    expect(result.id).toBe("audit-1");
  });
});

// ── extractRequestInfo ─────────────────────────────────────────────

describe("extractRequestInfo", () => {
  it("extracts IP from x-forwarded-for header", () => {
    const req = makeRequest({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" });
    const info = extractRequestInfo(req);
    expect(info.ipAddress).toBe("1.2.3.4");
  });

  it("returns unknown when no IP header", () => {
    const req = makeRequest({});
    const info = extractRequestInfo(req);
    expect(info.ipAddress).toBe("unknown");
  });

  it("extracts user-agent header", () => {
    const req = makeRequest({ "user-agent": "Mozilla/5.0" });
    const info = extractRequestInfo(req);
    expect(info.userAgent).toBe("Mozilla/5.0");
  });

  it("truncates long values", () => {
    const longString = "x".repeat(600);
    const req = makeRequest({ "user-agent": longString });
    const info = extractRequestInfo(req);
    expect(info.userAgent.length).toBe(500);
  });
});

// ── auditSpaceOperation ────────────────────────────────────────────

describe("auditSpaceOperation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuditLogCreate.mockResolvedValue({
      id: "audit-2",
      action: "UPDATE",
      resourceType: "SPACE",
      resourceId: "space-1",
      userEmail: "admin@test.com",
      spaceId: "space-1",
      ipAddress: "10.0.0.1",
      userAgent: "test",
      details: {},
      oldValues: { name: "Old" },
      newValues: { name: "New" },
      createdDate: new Date(),
    });
  });

  it("creates audit log for space update with old/new values", async () => {
    const req = makeRequest({ "x-forwarded-for": "10.0.0.1", "user-agent": "test" });

    await auditSpaceOperation("update", "space-1", "admin@test.com", req, {
      oldValues: { name: "Old" },
      newValues: { name: "New" },
    });

    expect(mockAuditLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "UPDATE",
        resourceType: "SPACE",
        resourceId: "space-1",
        userEmail: "admin@test.com",
        spaceId: "space-1",
        ipAddress: "10.0.0.1",
      }),
    });
  });
});

// ── auditSettingsOperation ─────────────────────────────────────────

describe("auditSettingsOperation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuditLogCreate.mockResolvedValue({
      id: "audit-3",
      action: "UPDATE",
      resourceType: "SETTINGS",
      resourceId: "signup_enabled",
      userEmail: "owner@test.com",
      spaceId: null,
      ipAddress: "unknown",
      userAgent: "test",
      details: { setting_key: "signup_enabled" },
      oldValues: null,
      newValues: { key: "signup_enabled", value: "true" },
      createdDate: new Date(),
    });
  });

  it("creates audit log for settings update with platform-level scope", async () => {
    const req = makeRequest({ "user-agent": "test" });

    await auditSettingsOperation("update", "signup_enabled", "owner@test.com", req, {
      newValues: { key: "signup_enabled", value: "true" },
      details: { setting_key: "signup_enabled" },
    });

    expect(mockAuditLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "UPDATE",
        resourceType: "SETTINGS",
        resourceId: "signup_enabled",
        userEmail: "owner@test.com",
        spaceId: null,
      }),
    });
  });
});

// ── auditApiKeyOperation ───────────────────────────────────────────

describe("auditApiKeyOperation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuditLogCreate.mockResolvedValue({
      id: "audit-4",
      action: "DELETE",
      resourceType: "API_KEY",
      resourceId: "key-1",
      userEmail: "admin@test.com",
      spaceId: "space-1",
      ipAddress: "unknown",
      userAgent: "test",
      details: {},
      oldValues: null,
      newValues: null,
      createdDate: new Date(),
    });
  });

  it("creates audit log for API key deletion scoped to space", async () => {
    const req = makeRequest({ "user-agent": "test" });

    await auditApiKeyOperation("delete", "key-1", "space-1", "admin@test.com", req);

    expect(mockAuditLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "DELETE",
        resourceType: "API_KEY",
        resourceId: "key-1",
        spaceId: "space-1",
      }),
    });
  });
});

// ── auditAuthEvent ─────────────────────────────────────────────────

describe("auditAuthEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuditLogCreate.mockResolvedValue({
      id: "audit-5",
      action: "LOGIN",
      resourceType: "USER",
      resourceId: "user-1",
      userEmail: "user@test.com",
      spaceId: null,
      ipAddress: "192.168.1.1",
      userAgent: "Mozilla/5.0",
      details: { sessionId: "sess-1" },
      oldValues: null,
      newValues: null,
      createdDate: new Date(),
    });
  });

  it("creates login audit log without requiring Request object", async () => {
    await auditAuthEvent("login", "user-1", "user@test.com", {
      ipAddress: "192.168.1.1",
      userAgent: "Mozilla/5.0",
      details: { sessionId: "sess-1" },
    });

    expect(mockAuditLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "LOGIN",
        resourceType: "USER",
        resourceId: "user-1",
        userEmail: "user@test.com",
        spaceId: null,
        ipAddress: "192.168.1.1",
        userAgent: "Mozilla/5.0",
      }),
    });
  });

  it("defaults IP and user-agent to unknown when not provided", async () => {
    mockAuditLogCreate.mockResolvedValue({
      id: "audit-6",
      action: "LOGOUT",
      resourceType: "USER",
      resourceId: "user-1",
      userEmail: "user@test.com",
      spaceId: null,
      ipAddress: "unknown",
      userAgent: "unknown",
      details: {},
      oldValues: null,
      newValues: null,
      createdDate: new Date(),
    });

    await auditAuthEvent("logout", "user-1", "user@test.com");

    expect(mockAuditLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "LOGOUT",
        ipAddress: "unknown",
        userAgent: "unknown",
      }),
    });
  });
});
