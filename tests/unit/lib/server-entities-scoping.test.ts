/**
 * Tests verifying that ServerEntities.list() and .filter() automatically
 * scope Prisma queries based on the requesting user's session.
 *
 * - Admin/owner: no additional where clause (sees everything)
 * - Non-admin member: queries scoped to accessible spaces
 * - No session (seed/background): falls back to no scoping
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock setup (before imports) ───────────────────────────────────────

const mockGetSession = vi.fn();

vi.mock("@/lib/auth-utils", () => ({
  getSession: () => mockGetSession(),
}));

const mockFindMany = vi.fn().mockResolvedValue([]);
const mockFindUnique = vi.fn().mockResolvedValue(null);
const mockCreate = vi.fn().mockResolvedValue({ id: "new-1" });
const mockUpdate = vi.fn().mockResolvedValue({ id: "upd-1" });
const mockDelete = vi.fn().mockResolvedValue({});

vi.mock("@/lib/prisma", () => {
  const handler = {
    findMany: (...args: unknown[]) => mockFindMany(...args),
    findUnique: (...args: unknown[]) => mockFindUnique(...args),
    create: (...args: unknown[]) => mockCreate(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  };
  const client = {
    space: handler,
    user: handler,
    apiKey: handler,
    apiCall: handler,
    auditLog: handler,
    assetType: handler,
    spaceUser: { findMany: (...args: unknown[]) => mockFindMany(...args) },
  };
  return { default: client, prisma: client };
});

// ── Import after mocks ────────────────────────────────────────────────

import { ServerEntities } from "@/lib/entities/server";

// ── Helpers ───────────────────────────────────────────────────────────

const ownerSession = { user: { id: "u-owner", email: "owner@test.com", role: "owner" } };
const adminSession = { user: { id: "u-admin", email: "admin@test.com", role: "admin" } };
const memberSession = { user: { id: "u-member", email: "member@test.com", role: null } };

/**
 * When a non-admin calls list/filter, the first findMany call goes to
 * spaceUser to get accessible space IDs. Subsequent findMany calls go
 * to the actual entity table. This helper sets up both responses.
 */
function setupMemberScoping(spaceIds: string[], entityResults: unknown[] = []) {
  mockFindMany
    .mockResolvedValueOnce(spaceIds.map((id) => ({ spaceId: id }))) // spaceUser.findMany
    .mockResolvedValueOnce(entityResults); // entity.findMany
}

// ── Tests ─────────────────────────────────────────────────────────────

describe("ServerEntities user-scoping", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockFindMany.mockResolvedValue([]);
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // SPACE
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  describe("Space.list()", () => {
    it("returns all spaces for admin (no where clause)", async () => {
      mockGetSession.mockResolvedValue(adminSession);
      mockFindMany.mockResolvedValue([{ id: "s1" }, { id: "s2" }]);

      const result = await ServerEntities.Space.list();

      expect(result).toHaveLength(2);
      // Only one findMany call (space), no spaceUser lookup
      expect(mockFindMany).toHaveBeenCalledTimes(1);
      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: undefined })
      );
    });

    it("returns all spaces for owner (no where clause)", async () => {
      mockGetSession.mockResolvedValue(ownerSession);
      mockFindMany.mockResolvedValue([{ id: "s1" }]);

      await ServerEntities.Space.list();

      expect(mockFindMany).toHaveBeenCalledTimes(1);
      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: undefined })
      );
    });

    it("scopes to user's spaces for non-admin", async () => {
      mockGetSession.mockResolvedValue(memberSession);
      setupMemberScoping(["s1", "s3"], [{ id: "s1" }, { id: "s3" }]);

      const result = await ServerEntities.Space.list();

      expect(result).toHaveLength(2);
      // Two findMany calls: spaceUser + space
      expect(mockFindMany).toHaveBeenCalledTimes(2);
      // Second call should include where clause with space IDs
      expect(mockFindMany).toHaveBeenNthCalledWith(2,
        expect.objectContaining({
          where: { id: { in: ["s1", "s3"] } },
        })
      );
    });

    it("returns empty for non-admin with no space memberships", async () => {
      mockGetSession.mockResolvedValue(memberSession);
      setupMemberScoping([], []);

      const result = await ServerEntities.Space.list();

      expect(result).toHaveLength(0);
    });

    it("returns all when no session (fallback for seed scripts)", async () => {
      mockGetSession.mockRejectedValue(new Error("No request context"));
      mockFindMany.mockResolvedValue([{ id: "s1" }, { id: "s2" }]);

      const result = await ServerEntities.Space.list();

      expect(result).toHaveLength(2);
      expect(mockFindMany).toHaveBeenCalledTimes(1);
      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: undefined })
      );
    });
  });

  describe("Space.filter()", () => {
    it("applies only criteria for admin", async () => {
      mockGetSession.mockResolvedValue(adminSession);
      mockFindMany.mockResolvedValue([{ id: "s1", name: "Gold" }]);

      await ServerEntities.Space.filter({ name: "Gold" });

      expect(mockFindMany).toHaveBeenCalledTimes(1);
      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { name: "Gold" },
        })
      );
    });

    it("combines criteria with access scoping for non-admin", async () => {
      mockGetSession.mockResolvedValue(memberSession);
      setupMemberScoping(["s1"], [{ id: "s1", name: "Gold" }]);

      await ServerEntities.Space.filter({ name: "Gold" });

      expect(mockFindMany).toHaveBeenCalledTimes(2);
      expect(mockFindMany).toHaveBeenNthCalledWith(2,
        expect.objectContaining({
          where: {
            AND: [
              { name: "Gold" },
              { id: { in: ["s1"] } },
            ],
          },
        })
      );
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // API CALL
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  describe("ApiCall.list()", () => {
    it("returns all API calls for admin", async () => {
      mockGetSession.mockResolvedValue(adminSession);
      mockFindMany.mockResolvedValue([]);

      await ServerEntities.ApiCall.list();

      expect(mockFindMany).toHaveBeenCalledTimes(1);
      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: undefined })
      );
    });

    it("scopes to user's spaces for non-admin", async () => {
      mockGetSession.mockResolvedValue(memberSession);
      setupMemberScoping(["s1", "s2"], []);

      await ServerEntities.ApiCall.list();

      expect(mockFindMany).toHaveBeenNthCalledWith(2,
        expect.objectContaining({
          where: { spaceId: { in: ["s1", "s2"] } },
        })
      );
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // AUDIT LOG
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  describe("AuditLog.list()", () => {
    it("returns all audit logs for admin", async () => {
      mockGetSession.mockResolvedValue(adminSession);
      mockFindMany.mockResolvedValue([]);

      await ServerEntities.AuditLog.list();

      expect(mockFindMany).toHaveBeenCalledTimes(1);
      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: undefined })
      );
    });

    it("scopes to space-scoped logs for non-admin (excludes platform logs)", async () => {
      mockGetSession.mockResolvedValue(memberSession);
      setupMemberScoping(["s1"], []);

      await ServerEntities.AuditLog.list();

      expect(mockFindMany).toHaveBeenNthCalledWith(2,
        expect.objectContaining({
          where: { spaceId: { not: null, in: ["s1"] } },
        })
      );
    });
  });

  describe("AuditLog.filter()", () => {
    it("combines criteria with access scoping for non-admin", async () => {
      mockGetSession.mockResolvedValue(memberSession);
      setupMemberScoping(["s1"], []);

      await ServerEntities.AuditLog.filter({ action: "create" });

      expect(mockFindMany).toHaveBeenNthCalledWith(2,
        expect.objectContaining({
          where: {
            AND: [
              { action: "CREATE" }, // buildWhere uppercases 'action'
              { spaceId: { not: null, in: ["s1"] } },
            ],
          },
        })
      );
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // ASSET TYPE (no scoping)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  describe("AssetType.list()", () => {
    it("returns all asset types regardless of role (global data)", async () => {
      mockGetSession.mockResolvedValue(memberSession);
      mockFindMany.mockResolvedValue([{ value: "gold", label: "Gold", createdDate: new Date() }]);

      const result = await ServerEntities.AssetType.list();

      expect(result).toHaveLength(1);
      // Only one findMany call — no spaceUser lookup
      expect(mockFindMany).toHaveBeenCalledTimes(1);
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // USER (no scoping)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  describe("User.list()", () => {
    it("returns all users (admin-gated at route level, no entity scoping)", async () => {
      mockGetSession.mockResolvedValue(adminSession);
      mockFindMany.mockResolvedValue([{ id: "u1" }]);

      const result = await ServerEntities.User.list();

      expect(result).toHaveLength(1);
      expect(mockFindMany).toHaveBeenCalledTimes(1);
    });
  });
});
