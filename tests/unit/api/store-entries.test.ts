import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockGetSession = vi.fn();
const mockCheckSpaceAccess = vi.fn();
const mockGetStore = vi.fn();
const mockCreateEntry = vi.fn();
const mockGetEntries = vi.fn();
const mockAuditStoreEntryOperation = vi.fn();
const mockCheckCsrfToken = vi.fn();

vi.mock("@/lib/auth-utils", () => ({
  getSession: () => mockGetSession(),
}));

vi.mock("@/lib/csrf", () => ({
  checkCsrfToken: (...args: unknown[]) => mockCheckCsrfToken(...args),
}));

vi.mock("@/lib/dal", () => ({
  checkSpaceAccess: (...args: unknown[]) => mockCheckSpaceAccess(...args),
  getStore: (...args: unknown[]) => mockGetStore(...args),
  createEntry: (...args: unknown[]) => mockCreateEntry(...args),
  getEntries: (...args: unknown[]) => mockGetEntries(...args),
  auditStoreEntryOperation: (...args: unknown[]) => mockAuditStoreEntryOperation(...args),
}));

vi.mock("@/lib/dal/artifact-validation", () => ({
  validateEntryForArtifactType: () => ({ valid: true, errors: [] }),
}));

const session = {
  user: { id: "user-1", email: "auditor@test.com", role: "admin" },
};

function makeRequest(url: string, method = "GET", body?: Record<string, unknown>) {
  const init: RequestInit = { method };
  if (body) {
    init.body = JSON.stringify(body);
    init.headers = { "content-type": "application/json" };
  }
  return new NextRequest(new URL(url, "http://localhost"), init as Record<string, unknown>);
}

describe("Store Entries API routes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockGetSession.mockResolvedValue(session);
    mockCheckSpaceAccess.mockResolvedValue({ hasAccess: true, isAdmin: true, role: "admin" });
    mockGetStore.mockResolvedValue({ id: "st1", spaceId: "sp1", artifactType: "value" });
    mockCheckCsrfToken.mockResolvedValue(true);
  });

  describe("GET /api/spaces/[spaceId]/stores/[streamId]/entries", () => {
    it("returns paginated entries", async () => {
      const result = { entries: [{ id: "e1", value: 100 }], total: 1, limit: 50, offset: 0 };
      mockGetEntries.mockResolvedValue(result);

      const { GET } = await import("@/app/api/spaces/[spaceId]/stores/[streamId]/entries/route");
      const req = makeRequest("http://localhost/api/spaces/sp1/stores/st1/entries");
      const res = await GET(req, { params: Promise.resolve({ spaceId: "sp1", streamId: "st1" }) });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.entries).toHaveLength(1);
      expect(data.total).toBe(1);
    });

    it("returns 404 when store belongs to different space", async () => {
      mockGetStore.mockResolvedValue({ id: "st1", spaceId: "other-space" });

      const { GET } = await import("@/app/api/spaces/[spaceId]/stores/[streamId]/entries/route");
      const req = makeRequest("http://localhost/api/spaces/sp1/stores/st1/entries");
      const res = await GET(req, { params: Promise.resolve({ spaceId: "sp1", streamId: "st1" }) });

      expect(res.status).toBe(404);
    });
  });

  describe("CSRF protection", () => {
    it("returns 403 when CSRF token is missing on POST", async () => {
      mockCheckCsrfToken.mockResolvedValue(false);

      const { POST } = await import("@/app/api/spaces/[spaceId]/stores/[streamId]/entries/route");
      const req = makeRequest("http://localhost/api/spaces/sp1/stores/st1/entries", "POST", {
        value: 100,
      });
      const res = await POST(req, { params: Promise.resolve({ spaceId: "sp1", streamId: "st1" }) });

      expect(res.status).toBe(403);
    });
  });

  describe("POST /api/spaces/[spaceId]/stores/[streamId]/entries", () => {
    it("creates an entry and returns 201", async () => {
      const entry = { id: "e1", value: 500, streamId: "st1" };
      mockCreateEntry.mockResolvedValue(entry);

      const { POST } = await import("@/app/api/spaces/[spaceId]/stores/[streamId]/entries/route");
      const req = makeRequest("http://localhost/api/spaces/sp1/stores/st1/entries", "POST", {
        value: 500,
      });
      const res = await POST(req, { params: Promise.resolve({ spaceId: "sp1", streamId: "st1" }) });
      const data = await res.json();

      expect(res.status).toBe(201);
      expect(data.id).toBe("e1");
      expect(mockAuditStoreEntryOperation).toHaveBeenCalledWith(
        "create", "e1", "sp1", "auditor@test.com", expect.anything(), expect.anything()
      );
    });

    it("returns 403 when user is a member (not admin/auditor)", async () => {
      mockCheckSpaceAccess.mockResolvedValue({ hasAccess: true, isAdmin: false, role: "member" });

      const { POST } = await import("@/app/api/spaces/[spaceId]/stores/[streamId]/entries/route");
      const req = makeRequest("http://localhost/api/spaces/sp1/stores/st1/entries", "POST", {
        value: 100,
      });
      const res = await POST(req, { params: Promise.resolve({ spaceId: "sp1", streamId: "st1" }) });

      expect(res.status).toBe(403);
    });

    it("allows auditor role to create entries", async () => {
      mockCheckSpaceAccess.mockResolvedValue({ hasAccess: true, isAdmin: false, role: "auditor" });
      mockCreateEntry.mockResolvedValue({ id: "e2", value: 200 });

      const { POST } = await import("@/app/api/spaces/[spaceId]/stores/[streamId]/entries/route");
      const req = makeRequest("http://localhost/api/spaces/sp1/stores/st1/entries", "POST", {
        value: 200,
      });
      const res = await POST(req, { params: Promise.resolve({ spaceId: "sp1", streamId: "st1" }) });

      expect(res.status).toBe(201);
    });
  });
});
