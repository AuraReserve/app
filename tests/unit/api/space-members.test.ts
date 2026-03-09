import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockGetSession = vi.fn();
const mockIsSpaceAdmin = vi.fn();
const mockCheckCsrfToken = vi.fn();
const mockCheckSpaceAccess = vi.fn();
const mockGetSpaceMembers = vi.fn();
const mockAddSpaceMember = vi.fn();
const mockIsUserSpaceMember = vi.fn();
const mockAuditSpaceMemberOperation = vi.fn();

const mockFindUnique = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockUserFindUnique = vi.fn();

vi.mock("@/lib/auth-utils", () => ({
  getSession: () => mockGetSession(),
  isSpaceAdmin: (...args: unknown[]) => mockIsSpaceAdmin(...args),
}));

vi.mock("@/lib/csrf", () => ({
  checkCsrfToken: (...args: unknown[]) => mockCheckCsrfToken(...args),
}));

vi.mock("@/lib/dal", () => ({
  checkSpaceAccess: (...args: unknown[]) => mockCheckSpaceAccess(...args),
  getSpaceMembers: (...args: unknown[]) => mockGetSpaceMembers(...args),
  addSpaceMember: (...args: unknown[]) => mockAddSpaceMember(...args),
  isUserSpaceMember: (...args: unknown[]) => mockIsUserSpaceMember(...args),
}));

vi.mock("@/lib/dal/audit", () => ({
  auditSpaceMemberOperation: (...args: unknown[]) => mockAuditSpaceMemberOperation(...args),
}));

vi.mock("@/lib/prisma", () => ({
  default: {
    spaceUser: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
      delete: (...args: unknown[]) => mockDelete(...args),
    },
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
      findFirst: (...args: unknown[]) => mockUserFindUnique(...args),
    },
  },
}));

// Mock next/server after() to execute immediately
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: (fn: () => void) => { fn(); },
  };
});

const session = {
  user: { id: "user-1", email: "admin@test.com", role: "admin" },
};

function makeRequest(url: string, method = "GET", body?: Record<string, unknown>) {
  const init: RequestInit = { method };
  if (body) {
    init.body = JSON.stringify(body);
    init.headers = { "content-type": "application/json" };
  }
  return new NextRequest(new URL(url, "http://localhost"), init as Record<string, unknown>);
}

describe("Space members API routes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockGetSession.mockResolvedValue(session);
    mockIsSpaceAdmin.mockResolvedValue(true);
    mockCheckCsrfToken.mockResolvedValue(true);
    mockCheckSpaceAccess.mockResolvedValue({ hasAccess: true, isAdmin: true, role: "admin" });
  });

  describe("PATCH /api/spaces/[spaceId]/members/[memberId]", () => {
    it("updates member role with correct Prisma enum value", async () => {
      mockFindUnique.mockResolvedValue({
        id: "member-1",
        spaceId: "space-1",
        role: "AUDITOR",
        user: { email: "member@test.com", fullName: "Test Member" },
      });

      mockUpdate.mockResolvedValue({
        id: "member-1",
        spaceId: "space-1",
        role: "ADMIN",
        user: { id: "u2", email: "member@test.com", fullName: "Test Member", role: null },
      });

      const { PATCH } = await import("@/app/api/spaces/[spaceId]/members/[memberId]/route");
      const req = makeRequest("http://localhost/api/spaces/space-1/members/member-1", "PATCH", { role: "admin" });
      const res = await PATCH(req, { params: Promise.resolve({ spaceId: "space-1", memberId: "member-1" }) });

      expect(res.status).toBe(200);

      // Verify Prisma update uses SpaceRole enum value (uppercase key maps to DB value)
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "member-1" },
          data: { role: "ADMIN" },
        }),
      );
    });

    it("handles mixed-case role input correctly", async () => {
      mockFindUnique.mockResolvedValue({
        id: "member-1",
        spaceId: "space-1",
        role: "MEMBER",
        user: { email: "member@test.com", fullName: "Test Member" },
      });

      mockUpdate.mockResolvedValue({
        id: "member-1",
        spaceId: "space-1",
        role: "AUDITOR",
        user: { id: "u2", email: "member@test.com", fullName: "Test Member", role: null },
      });

      const { PATCH } = await import("@/app/api/spaces/[spaceId]/members/[memberId]/route");
      const req = makeRequest("http://localhost/api/spaces/space-1/members/member-1", "PATCH", { role: "Auditor" });
      const res = await PATCH(req, { params: Promise.resolve({ spaceId: "space-1", memberId: "member-1" }) });

      expect(res.status).toBe(200);
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { role: "AUDITOR" },
        }),
      );
    });

    it("returns 404 when member does not belong to the space", async () => {
      mockFindUnique.mockResolvedValue({
        id: "member-1",
        spaceId: "space-OTHER",
        role: "MEMBER",
        user: { email: "member@test.com", fullName: "Test Member" },
      });

      const { PATCH } = await import("@/app/api/spaces/[spaceId]/members/[memberId]/route");
      const req = makeRequest("http://localhost/api/spaces/space-1/members/member-1", "PATCH", { role: "admin" });
      const res = await PATCH(req, { params: Promise.resolve({ spaceId: "space-1", memberId: "member-1" }) });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe("Member not found in this space");
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it("returns 404 when member does not exist", async () => {
      mockFindUnique.mockResolvedValue(null);

      const { PATCH } = await import("@/app/api/spaces/[spaceId]/members/[memberId]/route");
      const req = makeRequest("http://localhost/api/spaces/space-1/members/member-1", "PATCH", { role: "admin" });
      const res = await PATCH(req, { params: Promise.resolve({ spaceId: "space-1", memberId: "member-1" }) });

      expect(res.status).toBe(404);
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it("returns 400 for invalid role", async () => {
      const { PATCH } = await import("@/app/api/spaces/[spaceId]/members/[memberId]/route");
      const req = makeRequest("http://localhost/api/spaces/space-1/members/member-1", "PATCH", { role: "superadmin" });
      const res = await PATCH(req, { params: Promise.resolve({ spaceId: "space-1", memberId: "member-1" }) });

      expect(res.status).toBe(400);
      expect(mockFindUnique).not.toHaveBeenCalled();
    });

    it("returns 401 when not authenticated", async () => {
      mockGetSession.mockResolvedValue(null);

      const { PATCH } = await import("@/app/api/spaces/[spaceId]/members/[memberId]/route");
      const req = makeRequest("http://localhost/api/spaces/space-1/members/member-1", "PATCH", { role: "admin" });
      const res = await PATCH(req, { params: Promise.resolve({ spaceId: "space-1", memberId: "member-1" }) });

      expect(res.status).toBe(401);
    });

    it("returns 403 when not a space admin", async () => {
      mockCheckSpaceAccess.mockResolvedValue({ hasAccess: true, isAdmin: false, role: "member" });

      const { PATCH } = await import("@/app/api/spaces/[spaceId]/members/[memberId]/route");
      const req = makeRequest("http://localhost/api/spaces/space-1/members/member-1", "PATCH", { role: "admin" });
      const res = await PATCH(req, { params: Promise.resolve({ spaceId: "space-1", memberId: "member-1" }) });

      expect(res.status).toBe(403);
    });

    it("returns 403 when CSRF token is invalid", async () => {
      mockCheckCsrfToken.mockResolvedValue(false);

      const { PATCH } = await import("@/app/api/spaces/[spaceId]/members/[memberId]/route");
      const req = makeRequest("http://localhost/api/spaces/space-1/members/member-1", "PATCH", { role: "admin" });
      const res = await PATCH(req, { params: Promise.resolve({ spaceId: "space-1", memberId: "member-1" }) });

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.code).toBe("CSRF_INVALID");
    });
  });

  describe("DELETE /api/spaces/[spaceId]/members/[memberId]", () => {
    it("deletes a member that belongs to the space", async () => {
      mockFindUnique.mockResolvedValue({
        id: "member-1",
        spaceId: "space-1",
        role: "MEMBER",
        user: { id: "u2", email: "member@test.com", fullName: "Test Member" },
      });
      mockDelete.mockResolvedValue({ id: "member-1" });

      const { DELETE } = await import("@/app/api/spaces/[spaceId]/members/[memberId]/route");
      const req = makeRequest("http://localhost/api/spaces/space-1/members/member-1", "DELETE");
      const res = await DELETE(req, { params: Promise.resolve({ spaceId: "space-1", memberId: "member-1" }) });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(mockDelete).toHaveBeenCalledWith({ where: { id: "member-1" } });
    });

    it("returns 404 when member does not belong to the space", async () => {
      mockFindUnique.mockResolvedValue({
        id: "member-1",
        spaceId: "space-OTHER",
        role: "MEMBER",
        user: { id: "u2", email: "member@test.com", fullName: "Test Member" },
      });

      const { DELETE } = await import("@/app/api/spaces/[spaceId]/members/[memberId]/route");
      const req = makeRequest("http://localhost/api/spaces/space-1/members/member-1", "DELETE");
      const res = await DELETE(req, { params: Promise.resolve({ spaceId: "space-1", memberId: "member-1" }) });

      expect(res.status).toBe(404);
      expect(mockDelete).not.toHaveBeenCalled();
    });

    it("returns 404 when member does not exist", async () => {
      mockFindUnique.mockResolvedValue(null);

      const { DELETE } = await import("@/app/api/spaces/[spaceId]/members/[memberId]/route");
      const req = makeRequest("http://localhost/api/spaces/space-1/members/member-1", "DELETE");
      const res = await DELETE(req, { params: Promise.resolve({ spaceId: "space-1", memberId: "member-1" }) });

      expect(res.status).toBe(404);
      expect(mockDelete).not.toHaveBeenCalled();
    });

    it("returns 401 when not authenticated", async () => {
      mockGetSession.mockResolvedValue(null);

      const { DELETE } = await import("@/app/api/spaces/[spaceId]/members/[memberId]/route");
      const req = makeRequest("http://localhost/api/spaces/space-1/members/member-1", "DELETE");
      const res = await DELETE(req, { params: Promise.resolve({ spaceId: "space-1", memberId: "member-1" }) });

      expect(res.status).toBe(401);
    });

    it("returns 403 when not a space admin", async () => {
      mockCheckSpaceAccess.mockResolvedValue({ hasAccess: true, isAdmin: false, role: "member" });

      const { DELETE } = await import("@/app/api/spaces/[spaceId]/members/[memberId]/route");
      const req = makeRequest("http://localhost/api/spaces/space-1/members/member-1", "DELETE");
      const res = await DELETE(req, { params: Promise.resolve({ spaceId: "space-1", memberId: "member-1" }) });

      expect(res.status).toBe(403);
    });
  });

  describe("GET /api/spaces/[spaceId]/members", () => {
    it("returns members for an authorized user", async () => {
      const members = [
        { id: "m1", userId: "u1", spaceId: "space-1", role: "admin", user: { email: "a@test.com" } },
      ];
      mockGetSpaceMembers.mockResolvedValue(members);

      const { GET } = await import("@/app/api/spaces/[spaceId]/members/route");
      const req = makeRequest("http://localhost/api/spaces/space-1/members");
      const res = await GET(req, { params: Promise.resolve({ spaceId: "space-1" }) });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual(members);
    });

    it("returns 401 when not authenticated", async () => {
      mockGetSession.mockResolvedValue(null);

      const { GET } = await import("@/app/api/spaces/[spaceId]/members/route");
      const req = makeRequest("http://localhost/api/spaces/space-1/members");
      const res = await GET(req, { params: Promise.resolve({ spaceId: "space-1" }) });

      expect(res.status).toBe(401);
    });

    it("returns 403 when user has no space access", async () => {
      mockCheckSpaceAccess.mockResolvedValue({ hasAccess: false, isAdmin: false, role: null });

      const { GET } = await import("@/app/api/spaces/[spaceId]/members/route");
      const req = makeRequest("http://localhost/api/spaces/space-1/members");
      const res = await GET(req, { params: Promise.resolve({ spaceId: "space-1" }) });

      expect(res.status).toBe(403);
    });
  });

  describe("POST /api/spaces/[spaceId]/members", () => {
    it("adds a member to the space", async () => {
      mockUserFindUnique.mockResolvedValue({ id: "user-2", email: "new@test.com", fullName: "New User" });
      mockIsUserSpaceMember.mockResolvedValue(false);
      mockAddSpaceMember.mockResolvedValue({
        id: "m-new",
        userId: "user-2",
        spaceId: "space-1",
        role: "auditor",
      });

      const { POST } = await import("@/app/api/spaces/[spaceId]/members/route");
      const req = makeRequest("http://localhost/api/spaces/space-1/members", "POST", {
        email: "new@test.com",
        role: "auditor",
      });
      const res = await POST(req, { params: Promise.resolve({ spaceId: "space-1" }) });

      expect(res.status).toBe(200);
      expect(mockAddSpaceMember).toHaveBeenCalledWith({
        userId: "user-2",
        spaceId: "space-1",
        role: "auditor",
      });
    });

    it("returns 400 when user is already a member", async () => {
      mockUserFindUnique.mockResolvedValue({ id: "user-2", email: "existing@test.com", fullName: "Existing User" });
      mockIsUserSpaceMember.mockResolvedValue(true);

      const { POST } = await import("@/app/api/spaces/[spaceId]/members/route");
      const req = makeRequest("http://localhost/api/spaces/space-1/members", "POST", {
        email: "existing@test.com",
        role: "member",
      });
      const res = await POST(req, { params: Promise.resolve({ spaceId: "space-1" }) });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("already has access");
    });

    it("returns 403 when not a space admin", async () => {
      mockCheckSpaceAccess.mockResolvedValue({ hasAccess: true, isAdmin: false, role: "member" });

      const { POST } = await import("@/app/api/spaces/[spaceId]/members/route");
      const req = makeRequest("http://localhost/api/spaces/space-1/members", "POST", {
        email: "user2@test.com",
        role: "member",
      });
      const res = await POST(req, { params: Promise.resolve({ spaceId: "space-1" }) });

      expect(res.status).toBe(403);
    });

    it("returns 400 for invalid role", async () => {
      mockUserFindUnique.mockResolvedValue({ id: "user-2", email: "user2@test.com", fullName: "User 2" });

      const { POST } = await import("@/app/api/spaces/[spaceId]/members/route");
      const req = makeRequest("http://localhost/api/spaces/space-1/members", "POST", {
        email: "user2@test.com",
        role: "super_admin",
      });
      const res = await POST(req, { params: Promise.resolve({ spaceId: "space-1" }) });

      expect(res.status).toBe(400);
    });
  });
});
