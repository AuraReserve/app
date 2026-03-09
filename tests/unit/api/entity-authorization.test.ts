/**
 * Regression tests verifying role-aware authorization gates on all entity routes.
 *
 * Each entity route under /api/entities/* checks authentication and role
 * permissions before allowing access.  These tests confirm that:
 *   - Unauthenticated requests are rejected (401)
 *   - Insufficient roles are rejected (403)
 *   - Proper roles are allowed through
 *   - Owner hierarchy protection is enforced (users route)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Shared mocks ──────────────────────────────────────────────────────

const mockGetSession = vi.fn();
const mockHasRole = vi.fn();
const mockIsSpaceAdmin = vi.fn();
const mockRequireRole = vi.fn();

vi.mock("@/lib/auth-utils", () => ({
  getSession: () => mockGetSession(),
  hasRole: (...args: unknown[]) => mockHasRole(...args),
  isSpaceAdmin: (...args: unknown[]) => mockIsSpaceAdmin(...args),
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

// ServerEntities — return minimal data so routes don't crash past auth checks
const mockList = vi.fn().mockResolvedValue([]);
const mockFilter = vi.fn().mockResolvedValue([]);
const mockCreate = vi.fn().mockResolvedValue({ id: "new-1" });
const mockUpdate = vi.fn().mockResolvedValue({ id: "upd-1" });
const mockDelete = vi.fn().mockResolvedValue(true);
const mockMe = vi.fn().mockResolvedValue({ id: "u1", email: "me@test.com" });

vi.mock("@/lib/entities/server", () => ({
  ServerEntities: {
    Space: { list: (...a: unknown[]) => mockList(...a), filter: (...a: unknown[]) => mockFilter(...a), create: (...a: unknown[]) => mockCreate(...a), update: (...a: unknown[]) => mockUpdate(...a), delete: (...a: unknown[]) => mockDelete(...a) },
    User: { list: (...a: unknown[]) => mockList(...a), filter: (...a: unknown[]) => mockFilter(...a), create: (...a: unknown[]) => mockCreate(...a), update: (...a: unknown[]) => mockUpdate(...a), delete: (...a: unknown[]) => mockDelete(...a), me: () => mockMe() },
    ApiKey: { list: (...a: unknown[]) => mockList(...a), filter: (...a: unknown[]) => mockFilter(...a), create: (...a: unknown[]) => mockCreate(...a), update: (...a: unknown[]) => mockUpdate(...a), delete: (...a: unknown[]) => mockDelete(...a) },
    ApiCall: { list: (...a: unknown[]) => mockList(...a), filter: (...a: unknown[]) => mockFilter(...a), create: (...a: unknown[]) => mockCreate(...a), update: (...a: unknown[]) => mockUpdate(...a), delete: (...a: unknown[]) => mockDelete(...a) },
    AuditLog: { list: (...a: unknown[]) => mockList(...a), filter: (...a: unknown[]) => mockFilter(...a), create: (...a: unknown[]) => mockCreate(...a), update: (...a: unknown[]) => mockUpdate(...a), delete: (...a: unknown[]) => mockDelete(...a) },
    AssetType: { list: (...a: unknown[]) => mockList(...a), filter: (...a: unknown[]) => mockFilter(...a), create: (...a: unknown[]) => mockCreate(...a), update: (...a: unknown[]) => mockUpdate(...a), delete: (...a: unknown[]) => mockDelete(...a) },
  },
}));

// Prisma — minimal stubs
const mockFindMany = vi.fn().mockResolvedValue([]);
const mockFindUnique = vi.fn().mockResolvedValue(null);
const mockFindFirst = vi.fn().mockResolvedValue(null);
const mockPrismaCreate = vi.fn().mockResolvedValue({ id: "new-1" });
const mockTransaction = vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
  return fn({
    space: { create: mockPrismaCreate },
    spaceUser: { create: mockPrismaCreate },
    dataStream: { create: mockPrismaCreate },
    integration: { findUnique: mockFindUnique },
    spaceIntegration: { create: mockPrismaCreate },
    auditLog: { create: mockPrismaCreate },
  });
});

vi.mock("@/lib/prisma", () => ({
  default: {
    spaceUser: { findMany: (...a: unknown[]) => mockFindMany(...a), findFirst: (...a: unknown[]) => mockFindFirst(...a) },
    space: { findUnique: (...a: unknown[]) => mockFindUnique(...a), findMany: (...a: unknown[]) => mockFindMany(...a) },
    dataStream: { findMany: (...a: unknown[]) => mockFindMany(...a) },
    apiKey: { findUnique: (...a: unknown[]) => mockFindUnique(...a), findMany: (...a: unknown[]) => mockFindMany(...a) },
    apiCall: { findMany: (...a: unknown[]) => mockFindMany(...a) },
    auditLog: { findMany: (...a: unknown[]) => mockFindMany(...a) },
    user: { findUnique: (...a: unknown[]) => mockFindUnique(...a) },
    $transaction: (...a: unknown[]) => mockTransaction(...a),
  },
  prisma: {
    spaceUser: { findMany: (...a: unknown[]) => mockFindMany(...a), findFirst: (...a: unknown[]) => mockFindFirst(...a) },
    space: { findUnique: (...a: unknown[]) => mockFindUnique(...a), findMany: (...a: unknown[]) => mockFindMany(...a) },
    dataStream: { findMany: (...a: unknown[]) => mockFindMany(...a) },
    apiKey: { findUnique: (...a: unknown[]) => mockFindUnique(...a), findMany: (...a: unknown[]) => mockFindMany(...a) },
    apiCall: { findMany: (...a: unknown[]) => mockFindMany(...a) },
    auditLog: { findMany: (...a: unknown[]) => mockFindMany(...a) },
    user: { findUnique: (...a: unknown[]) => mockFindUnique(...a) },
    $transaction: (...a: unknown[]) => mockTransaction(...a),
  },
}));

vi.mock("@/lib/password", () => ({
  validatePassword: () => ({ isValid: true, errors: [] }),
  hashPassword: async (p: string) => `hashed_${p}`,
}));

vi.mock("@/lib/dal/audit", () => ({
  auditUserOperation: vi.fn(),
}));

vi.mock("@/lib/artifact-types", () => ({
  requireArtifactType: (t: string) => t.toUpperCase(),
}));

vi.mock("next/server", async (importOriginal) => {
  const orig = await importOriginal<typeof import("next/server")>();
  return {
    ...orig,
    after: (fn: () => Promise<void>) => { fn().catch(() => {}); },
  };
});

// ── Helpers ───────────────────────────────────────────────────────────

function makeRequest(url: string, method = "GET", body?: Record<string, unknown>) {
  const init: RequestInit = { method };
  if (body) {
    init.body = JSON.stringify(body);
    init.headers = { "content-type": "application/json" };
  }
  return new NextRequest(new URL(url, "http://localhost"), init as Record<string, unknown>);
}

const ownerSession = { user: { id: "u-owner", email: "owner@test.com", role: "owner" } };
const adminSession = { user: { id: "u-admin", email: "admin@test.com", role: "admin" } };
const memberSession = { user: { id: "u-member", email: "member@test.com", role: null } };

// ── Tests ─────────────────────────────────────────────────────────────

describe("Entity route authorization gates", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Defaults: authenticated as owner, all access granted
    mockGetSession.mockResolvedValue(ownerSession);
    mockHasRole.mockImplementation((userRole: string | null, required: string) => {
      const hierarchy: Record<string, number> = { owner: 2, admin: 1 };
      return (hierarchy[userRole as string] ?? 0) >= (hierarchy[required] ?? 0);
    });
    mockIsSpaceAdmin.mockResolvedValue(true);
    mockRequireRole.mockImplementation(async (role: string) => {
      const session = await mockGetSession();
      if (!session?.user) throw new Error("Unauthorized");
      if (!mockHasRole(session.user.role, role)) throw new Error("Forbidden");
      return session.user;
    });
    mockList.mockResolvedValue([]);
    mockFilter.mockResolvedValue([]);
    mockCreate.mockResolvedValue({ id: "new-1" });
    mockUpdate.mockResolvedValue({ id: "upd-1" });
    mockDelete.mockResolvedValue(true);
    mockFindMany.mockResolvedValue([]);
    mockFindUnique.mockResolvedValue(null);
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // SPACES
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  describe("/api/entities/spaces", () => {
    it("GET returns 401 when unauthenticated", async () => {
      mockGetSession.mockResolvedValue(null);
      const { GET } = await import("@/app/api/entities/spaces/route");
      const res = await GET(makeRequest("http://localhost/api/entities/spaces"));
      expect(res.status).toBe(401);
    });

    it("GET returns all spaces for admin/owner", async () => {
      mockGetSession.mockResolvedValue(adminSession);
      mockList.mockResolvedValue([{ id: "s1", name: "Space 1" }]);

      const { GET } = await import("@/app/api/entities/spaces/route");
      const res = await GET(makeRequest("http://localhost/api/entities/spaces"));

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toHaveLength(1);
    });

    it("GET returns only accessible spaces for members", async () => {
      mockGetSession.mockResolvedValue(memberSession);
      mockFindMany.mockResolvedValue([{ spaceId: "s1" }]); // member has access to s1
      mockList.mockResolvedValue([
        { id: "s1", name: "Space 1" },
        { id: "s2", name: "Space 2" },
      ]);

      const { GET } = await import("@/app/api/entities/spaces/route");
      const res = await GET(makeRequest("http://localhost/api/entities/spaces"));

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toHaveLength(1);
      expect(data[0].id).toBe("s1");
    });

    it("POST returns 401 when unauthenticated", async () => {
      mockGetSession.mockResolvedValue(null);
      const { POST } = await import("@/app/api/entities/spaces/route");
      const res = await POST(makeRequest("http://localhost/api/entities/spaces", "POST", {
        name: "Test", slug: "test",
      }));
      expect(res.status).toBe(401);
    });

    it("POST returns 403 for non-admin users", async () => {
      mockGetSession.mockResolvedValue(memberSession);
      const { POST } = await import("@/app/api/entities/spaces/route");
      const res = await POST(makeRequest("http://localhost/api/entities/spaces", "POST", {
        name: "Test", slug: "test",
      }));
      expect(res.status).toBe(403);
    });

    it("PATCH returns 401 when unauthenticated", async () => {
      mockGetSession.mockResolvedValue(null);
      const { PATCH } = await import("@/app/api/entities/spaces/route");
      const res = await PATCH(makeRequest("http://localhost/api/entities/spaces", "PATCH", {
        id: "s1", name: "New Name",
      }));
      expect(res.status).toBe(401);
    });

    it("PATCH returns 403 when user is not space admin", async () => {
      mockGetSession.mockResolvedValue(memberSession);
      mockIsSpaceAdmin.mockResolvedValue(false);
      const { PATCH } = await import("@/app/api/entities/spaces/route");
      const res = await PATCH(makeRequest("http://localhost/api/entities/spaces", "PATCH", {
        id: "s1", name: "New Name",
      }));
      expect(res.status).toBe(403);
    });

    it("DELETE returns 401 when unauthenticated", async () => {
      mockGetSession.mockResolvedValue(null);
      const { DELETE } = await import("@/app/api/entities/spaces/route");
      const res = await DELETE(makeRequest("http://localhost/api/entities/spaces", "DELETE", {
        id: "s1",
      }));
      expect(res.status).toBe(401);
    });

    it("DELETE returns 403 for non-admin users", async () => {
      mockGetSession.mockResolvedValue(memberSession);
      const { DELETE } = await import("@/app/api/entities/spaces/route");
      const res = await DELETE(makeRequest("http://localhost/api/entities/spaces", "DELETE", {
        id: "s1",
      }));
      expect(res.status).toBe(403);
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // USERS
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  describe("/api/entities/users", () => {
    it("GET ?action=me returns 401 when unauthenticated", async () => {
      mockGetSession.mockResolvedValue(null);
      const { GET } = await import("@/app/api/entities/users/route");
      const res = await GET(makeRequest("http://localhost/api/entities/users?action=me"));
      expect(res.status).toBe(401);
    });

    it("GET (list) returns 403 for non-admin users", async () => {
      mockGetSession.mockResolvedValue(memberSession);
      // requireRole('admin') throws for non-admin
      const { GET } = await import("@/app/api/entities/users/route");
      const res = await GET(makeRequest("http://localhost/api/entities/users"));
      expect(res.status).toBe(403);
    });

    it("GET (list) succeeds for admin users", async () => {
      mockGetSession.mockResolvedValue(adminSession);
      mockList.mockResolvedValue([{ id: "u1", email: "a@test.com" }]);
      mockFindMany.mockResolvedValue([]); // space memberships

      const { GET } = await import("@/app/api/entities/users/route");
      const res = await GET(makeRequest("http://localhost/api/entities/users"));
      expect(res.status).toBe(200);
    });

    it("POST returns 403 for non-admin users", async () => {
      mockGetSession.mockResolvedValue(memberSession);
      const { POST } = await import("@/app/api/entities/users/route");
      const res = await POST(makeRequest("http://localhost/api/entities/users", "POST", {
        email: "new@test.com", full_name: "New User",
      }));
      expect(res.status).toBe(403);
    });

    it("PATCH returns 401 when unauthenticated", async () => {
      mockGetSession.mockResolvedValue(null);
      const { PATCH } = await import("@/app/api/entities/users/route");
      const res = await PATCH(makeRequest("http://localhost/api/entities/users", "PATCH", {
        id: "u1", full_name: "Updated",
      }));
      expect(res.status).toBe(401);
    });

    it("PATCH returns 403 for non-admin users", async () => {
      mockGetSession.mockResolvedValue(memberSession);
      const { PATCH } = await import("@/app/api/entities/users/route");
      const res = await PATCH(makeRequest("http://localhost/api/entities/users", "PATCH", {
        id: "u1", full_name: "Updated",
      }));
      expect(res.status).toBe(403);
    });

    it("PATCH prevents admin from modifying owner account", async () => {
      mockGetSession.mockResolvedValue(adminSession);
      mockFindUnique.mockResolvedValue({ role: "owner", email: "owner@test.com", fullName: "Owner", isActive: true });

      const { PATCH } = await import("@/app/api/entities/users/route");
      const res = await PATCH(makeRequest("http://localhost/api/entities/users", "PATCH", {
        id: "u-owner", full_name: "Hacked",
      }));
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toContain("Only owners can modify owner accounts");
    });

    it("PATCH prevents admin from assigning owner role", async () => {
      mockGetSession.mockResolvedValue(adminSession);
      mockFindUnique.mockResolvedValue({ role: "admin", email: "user@test.com", fullName: "User", isActive: true });

      const { PATCH } = await import("@/app/api/entities/users/route");
      const res = await PATCH(makeRequest("http://localhost/api/entities/users", "PATCH", {
        id: "u1", role: "owner",
      }));
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toContain("Only owners can assign admin or owner roles");
    });

    it("DELETE returns 401 when unauthenticated", async () => {
      mockGetSession.mockResolvedValue(null);
      const { DELETE } = await import("@/app/api/entities/users/route");
      const res = await DELETE(makeRequest("http://localhost/api/entities/users", "DELETE", {
        id: "u1",
      }));
      expect(res.status).toBe(401);
    });

    it("DELETE returns 403 for non-admin users", async () => {
      mockGetSession.mockResolvedValue(memberSession);
      const { DELETE } = await import("@/app/api/entities/users/route");
      const res = await DELETE(makeRequest("http://localhost/api/entities/users", "DELETE", {
        id: "u1",
      }));
      expect(res.status).toBe(403);
    });

    it("DELETE prevents admin from deleting owner account", async () => {
      mockGetSession.mockResolvedValue(adminSession);
      mockFindUnique.mockResolvedValue({ role: "owner", email: "owner@test.com", fullName: "Owner" });

      const { DELETE } = await import("@/app/api/entities/users/route");
      const res = await DELETE(makeRequest("http://localhost/api/entities/users", "DELETE", {
        id: "u-owner",
      }));
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toContain("Only owners can delete owner accounts");
    });

    it("DELETE prevents self-deletion", async () => {
      mockGetSession.mockResolvedValue(ownerSession);
      mockFindUnique.mockResolvedValue({ role: "owner", email: "owner@test.com", fullName: "Owner" });

      const { DELETE } = await import("@/app/api/entities/users/route");
      const res = await DELETE(makeRequest("http://localhost/api/entities/users", "DELETE", {
        id: "u-owner",
      }));
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("Cannot delete your own account");
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // AUDIT LOGS
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  describe("/api/entities/audit-logs", () => {
    it("GET returns 401 when unauthenticated", async () => {
      mockGetSession.mockResolvedValue(null);
      const { GET } = await import("@/app/api/entities/audit-logs/route");
      const res = await GET(makeRequest("http://localhost/api/entities/audit-logs"));
      expect(res.status).toBe(401);
    });

    it("GET for members only returns space-scoped audit logs", async () => {
      mockGetSession.mockResolvedValue(memberSession);
      mockFindMany
        .mockResolvedValueOnce([{ spaceId: "s1" }]) // spaceUser.findMany
        .mockResolvedValueOnce([]); // auditLog.findMany

      const { GET } = await import("@/app/api/entities/audit-logs/route");
      const res = await GET(makeRequest("http://localhost/api/entities/audit-logs"));
      expect(res.status).toBe(200);

      // Verify the spaceUser query was called to scope access
      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: "u-member" } })
      );
    });

    it("POST returns 403 for admin (owner-only)", async () => {
      mockGetSession.mockResolvedValue(adminSession);
      const { POST } = await import("@/app/api/entities/audit-logs/route");
      const res = await POST(makeRequest("http://localhost/api/entities/audit-logs", "POST", {
        action: "create", resource_type: "space", resource_id: "s1",
      }));
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toContain("Owner access required");
    });

    it("POST succeeds for owner", async () => {
      mockGetSession.mockResolvedValue(ownerSession);
      const { POST } = await import("@/app/api/entities/audit-logs/route");
      const res = await POST(makeRequest("http://localhost/api/entities/audit-logs", "POST", {
        action: "create", resource_type: "space", resource_id: "s1",
      }));
      expect(res.status).toBe(200);
    });

    it("PATCH returns 403 for admin (owner-only)", async () => {
      mockGetSession.mockResolvedValue(adminSession);
      const { PATCH } = await import("@/app/api/entities/audit-logs/route");
      const res = await PATCH(makeRequest("http://localhost/api/entities/audit-logs", "PATCH", {
        id: "log-1", action: "update",
      }));
      expect(res.status).toBe(403);
    });

    it("DELETE returns 403 for admin (owner-only)", async () => {
      mockGetSession.mockResolvedValue(adminSession);
      const { DELETE } = await import("@/app/api/entities/audit-logs/route");
      const res = await DELETE(makeRequest("http://localhost/api/entities/audit-logs", "DELETE", {
        id: "log-1",
      }));
      expect(res.status).toBe(403);
    });

    it("DELETE returns 403 for non-admin member", async () => {
      mockGetSession.mockResolvedValue(memberSession);
      const { DELETE } = await import("@/app/api/entities/audit-logs/route");
      const res = await DELETE(makeRequest("http://localhost/api/entities/audit-logs", "DELETE", {
        id: "log-1",
      }));
      expect(res.status).toBe(403);
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // API CALLS
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  describe("/api/entities/api-calls", () => {
    it("GET returns 401 when unauthenticated", async () => {
      mockGetSession.mockResolvedValue(null);
      const { GET } = await import("@/app/api/entities/api-calls/route");
      const res = await GET(makeRequest("http://localhost/api/entities/api-calls"));
      expect(res.status).toBe(401);
    });

    it("GET for members only returns space-scoped api calls", async () => {
      mockGetSession.mockResolvedValue(memberSession);
      mockFindMany
        .mockResolvedValueOnce([{ spaceId: "s1" }]) // spaceUser.findMany
        .mockResolvedValueOnce([]); // apiCall.findMany

      const { GET } = await import("@/app/api/entities/api-calls/route");
      const res = await GET(makeRequest("http://localhost/api/entities/api-calls"));
      expect(res.status).toBe(200);
    });

    it("POST returns 403 for non-admin users", async () => {
      mockGetSession.mockResolvedValue(memberSession);
      const { POST } = await import("@/app/api/entities/api-calls/route");
      const res = await POST(makeRequest("http://localhost/api/entities/api-calls", "POST", {
        method: "GET", endpoint: "/api/v1/reserves/abc",
      }));
      expect(res.status).toBe(403);
    });

    it("POST succeeds for admin users", async () => {
      mockGetSession.mockResolvedValue(adminSession);
      const { POST } = await import("@/app/api/entities/api-calls/route");
      const res = await POST(makeRequest("http://localhost/api/entities/api-calls", "POST", {
        method: "GET", endpoint: "/api/v1/reserves/abc",
      }));
      expect(res.status).toBe(200);
    });

    it("PATCH returns 403 for non-admin users", async () => {
      mockGetSession.mockResolvedValue(memberSession);
      const { PATCH } = await import("@/app/api/entities/api-calls/route");
      const res = await PATCH(makeRequest("http://localhost/api/entities/api-calls", "PATCH", {
        id: "call-1", response_status: 200,
      }));
      expect(res.status).toBe(403);
    });

    it("DELETE returns 403 for non-admin users", async () => {
      mockGetSession.mockResolvedValue(memberSession);
      const { DELETE } = await import("@/app/api/entities/api-calls/route");
      const res = await DELETE(makeRequest("http://localhost/api/entities/api-calls", "DELETE", {
        id: "call-1",
      }));
      expect(res.status).toBe(403);
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // ASSET TYPES
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  describe("/api/entities/asset-types", () => {
    it("GET returns 401 when unauthenticated", async () => {
      mockGetSession.mockResolvedValue(null);
      const { GET } = await import("@/app/api/entities/asset-types/route");
      const res = await GET(makeRequest("http://localhost/api/entities/asset-types"));
      expect(res.status).toBe(401);
    });

    it("GET succeeds for any authenticated user (even non-admin)", async () => {
      mockGetSession.mockResolvedValue(memberSession);
      mockList.mockResolvedValue([{ id: "at1", name: "Gold" }]);

      const { GET } = await import("@/app/api/entities/asset-types/route");
      const res = await GET(makeRequest("http://localhost/api/entities/asset-types"));
      expect(res.status).toBe(200);
    });

    it("POST returns 403 for non-admin users", async () => {
      mockGetSession.mockResolvedValue(memberSession);
      const { POST } = await import("@/app/api/entities/asset-types/route");
      const res = await POST(makeRequest("http://localhost/api/entities/asset-types", "POST", {
        name: "Platinum",
      }));
      // requireRole('admin') throws "Forbidden" → caught as 403
      expect(res.status).toBe(403);
    });

    it("POST succeeds for admin users", async () => {
      mockGetSession.mockResolvedValue(adminSession);
      mockCreate.mockResolvedValue({ id: "at-new", name: "Platinum" });

      const { POST } = await import("@/app/api/entities/asset-types/route");
      const res = await POST(makeRequest("http://localhost/api/entities/asset-types", "POST", {
        name: "Platinum",
      }));
      expect(res.status).toBe(200);
    });

    it("PATCH returns 403 for non-admin users", async () => {
      mockGetSession.mockResolvedValue(memberSession);
      const { PATCH } = await import("@/app/api/entities/asset-types/route");
      const res = await PATCH(makeRequest("http://localhost/api/entities/asset-types", "PATCH", {
        id: "at1", name: "Updated",
      }));
      expect(res.status).toBe(403);
    });

    it("DELETE returns 403 for non-admin users", async () => {
      mockGetSession.mockResolvedValue(memberSession);
      const { DELETE } = await import("@/app/api/entities/asset-types/route");
      const res = await DELETE(makeRequest("http://localhost/api/entities/asset-types", "DELETE", {
        id: "at1",
      }));
      expect(res.status).toBe(403);
    });

    it("DELETE succeeds for admin users", async () => {
      mockGetSession.mockResolvedValue(adminSession);
      mockDelete.mockResolvedValue(true);

      const { DELETE } = await import("@/app/api/entities/asset-types/route");
      const res = await DELETE(makeRequest("http://localhost/api/entities/asset-types", "DELETE", {
        id: "at1",
      }));
      expect(res.status).toBe(200);
    });
  });
});
