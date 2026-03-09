import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockGetSession = vi.fn();
const mockCheckSpaceAccess = vi.fn();
const mockGetSpaceStores = vi.fn();
const mockCreateStore = vi.fn();
const mockGetStore = vi.fn();
const mockUpdateStore = vi.fn();
const mockDeleteStore = vi.fn();
const mockAuditDataStoreOperation = vi.fn();
const mockCheckCsrfToken = vi.fn();

vi.mock("@/lib/auth-utils", () => ({
  getSession: () => mockGetSession(),
}));

vi.mock("@/lib/csrf", () => ({
  checkCsrfToken: (...args: unknown[]) => mockCheckCsrfToken(...args),
}));

vi.mock("@/lib/dal", () => ({
  checkSpaceAccess: (...args: unknown[]) => mockCheckSpaceAccess(...args),
  getSpaceStores: (...args: unknown[]) => mockGetSpaceStores(...args),
  createStore: (...args: unknown[]) => mockCreateStore(...args),
  getStore: (...args: unknown[]) => mockGetStore(...args),
  updateStore: (...args: unknown[]) => mockUpdateStore(...args),
  deleteStore: (...args: unknown[]) => mockDeleteStore(...args),
  auditDataStoreOperation: (...args: unknown[]) => mockAuditDataStoreOperation(...args),
}));

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

describe("Stores API routes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockGetSession.mockResolvedValue(session);
    mockCheckSpaceAccess.mockResolvedValue({ hasAccess: true, isAdmin: true, role: "admin" });
    mockCheckCsrfToken.mockResolvedValue(true);
  });

  describe("GET /api/spaces/[spaceId]/stores", () => {
    it("returns stores for an authorized user", async () => {
      const stores = [
        { id: "s1", name: "Gold Reserve", slug: "gold-reserve", entries: [] },
      ];
      mockGetSpaceStores.mockResolvedValue(stores);

      const { GET } = await import("@/app/api/spaces/[spaceId]/stores/route");
      const req = makeRequest("http://localhost/api/spaces/sp1/stores");
      const res = await GET(req, { params: Promise.resolve({ spaceId: "sp1" }) });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data).toEqual(stores);
      expect(mockGetSpaceStores).toHaveBeenCalledWith("sp1");
    });

    it("returns 401 when not authenticated", async () => {
      mockGetSession.mockResolvedValue(null);

      const { GET } = await import("@/app/api/spaces/[spaceId]/stores/route");
      const req = makeRequest("http://localhost/api/spaces/sp1/stores");
      const res = await GET(req, { params: Promise.resolve({ spaceId: "sp1" }) });

      expect(res.status).toBe(401);
    });

    it("returns 403 when user has no space access", async () => {
      mockCheckSpaceAccess.mockResolvedValue({ hasAccess: false, isAdmin: false });

      const { GET } = await import("@/app/api/spaces/[spaceId]/stores/route");
      const req = makeRequest("http://localhost/api/spaces/sp1/stores");
      const res = await GET(req, { params: Promise.resolve({ spaceId: "sp1" }) });

      expect(res.status).toBe(403);
    });
  });

  describe("CSRF protection", () => {
    it("returns 403 when CSRF token is missing on POST", async () => {
      mockCheckCsrfToken.mockResolvedValue(false);

      const { POST } = await import("@/app/api/spaces/[spaceId]/stores/route");
      const req = makeRequest("http://localhost/api/spaces/sp1/stores", "POST", {
        name: "Gold", slug: "gold", artifactType: "value",
      });
      const res = await POST(req, { params: Promise.resolve({ spaceId: "sp1" }) });
      const data = await res.json();

      expect(res.status).toBe(403);
      expect(data.code).toBe("CSRF_INVALID");
    });

    it("returns 403 when CSRF token is missing on PATCH", async () => {
      mockCheckCsrfToken.mockResolvedValue(false);

      const { PATCH } = await import("@/app/api/spaces/[spaceId]/stores/[streamId]/route");
      const req = makeRequest("http://localhost/api/spaces/sp1/stores/s1", "PATCH", { name: "New" });
      const res = await PATCH(req, { params: Promise.resolve({ spaceId: "sp1", streamId: "s1" }) });

      expect(res.status).toBe(403);
    });

    it("returns 403 when CSRF token is missing on DELETE", async () => {
      mockCheckCsrfToken.mockResolvedValue(false);

      const { DELETE } = await import("@/app/api/spaces/[spaceId]/stores/[streamId]/route");
      const req = makeRequest("http://localhost/api/spaces/sp1/stores/s1", "DELETE");
      const res = await DELETE(req, { params: Promise.resolve({ spaceId: "sp1", streamId: "s1" }) });

      expect(res.status).toBe(403);
    });
  });

  describe("POST /api/spaces/[spaceId]/stores", () => {
    it("creates a store and returns 201", async () => {
      const created = { id: "s1", name: "Gold", slug: "gold", artifactType: "value" };
      mockCreateStore.mockResolvedValue(created);

      const { POST } = await import("@/app/api/spaces/[spaceId]/stores/route");
      const req = makeRequest("http://localhost/api/spaces/sp1/stores", "POST", {
        name: "Gold",
        slug: "gold",
        artifactType: "value",
      });
      const res = await POST(req, { params: Promise.resolve({ spaceId: "sp1" }) });
      const data = await res.json();

      expect(res.status).toBe(201);
      expect(data.name).toBe("Gold");
      expect(mockAuditDataStoreOperation).toHaveBeenCalledWith(
        "create", "s1", "sp1", "admin@test.com", expect.anything(), expect.anything()
      );
    });

    it("returns 400 when name is missing", async () => {
      const { POST } = await import("@/app/api/spaces/[spaceId]/stores/route");
      const req = makeRequest("http://localhost/api/spaces/sp1/stores", "POST", {
        slug: "gold",
        artifactType: "value",
      });
      const res = await POST(req, { params: Promise.resolve({ spaceId: "sp1" }) });

      expect(res.status).toBe(400);
    });

    it("returns 403 when user is not admin", async () => {
      mockCheckSpaceAccess.mockResolvedValue({ hasAccess: true, isAdmin: false });

      const { POST } = await import("@/app/api/spaces/[spaceId]/stores/route");
      const req = makeRequest("http://localhost/api/spaces/sp1/stores", "POST", {
        name: "Gold", slug: "gold", artifactType: "value",
      });
      const res = await POST(req, { params: Promise.resolve({ spaceId: "sp1" }) });

      expect(res.status).toBe(403);
    });
  });

  describe("PATCH /api/spaces/[spaceId]/stores/[streamId]", () => {
    it("updates store and returns the result", async () => {
      const existing = { id: "s1", spaceId: "sp1", name: "Old", description: "", isActive: true };
      mockGetStore.mockResolvedValue(existing);
      const updated = { ...existing, name: "New" };
      mockUpdateStore.mockResolvedValue(updated);

      const { PATCH } = await import("@/app/api/spaces/[spaceId]/stores/[streamId]/route");
      const req = makeRequest("http://localhost/api/spaces/sp1/stores/s1", "PATCH", { name: "New" });
      const res = await PATCH(req, { params: Promise.resolve({ spaceId: "sp1", streamId: "s1" }) });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.name).toBe("New");
      expect(mockAuditDataStoreOperation).toHaveBeenCalledWith(
        "update", "s1", "sp1", "admin@test.com", expect.anything(), expect.anything()
      );
    });

    it("returns 404 when store not found", async () => {
      mockGetStore.mockResolvedValue(null);

      const { PATCH } = await import("@/app/api/spaces/[spaceId]/stores/[streamId]/route");
      const req = makeRequest("http://localhost/api/spaces/sp1/stores/s1", "PATCH", { name: "New" });
      const res = await PATCH(req, { params: Promise.resolve({ spaceId: "sp1", streamId: "s1" }) });

      expect(res.status).toBe(404);
    });

    it("returns 400 when no valid fields provided", async () => {
      mockGetStore.mockResolvedValue({ id: "s1", spaceId: "sp1" });

      const { PATCH } = await import("@/app/api/spaces/[spaceId]/stores/[streamId]/route");
      const req = makeRequest("http://localhost/api/spaces/sp1/stores/s1", "PATCH", { foo: "bar" });
      const res = await PATCH(req, { params: Promise.resolve({ spaceId: "sp1", streamId: "s1" }) });

      expect(res.status).toBe(400);
    });
  });

  describe("DELETE /api/spaces/[spaceId]/stores/[streamId]", () => {
    it("deletes store and returns success", async () => {
      mockGetStore.mockResolvedValue({ id: "s1", spaceId: "sp1", name: "Gold", slug: "gold", artifactType: "value" });
      mockDeleteStore.mockResolvedValue(true);

      const { DELETE } = await import("@/app/api/spaces/[spaceId]/stores/[streamId]/route");
      const req = makeRequest("http://localhost/api/spaces/sp1/stores/s1", "DELETE");
      const res = await DELETE(req, { params: Promise.resolve({ spaceId: "sp1", streamId: "s1" }) });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(mockAuditDataStoreOperation).toHaveBeenCalledWith(
        "delete", "s1", "sp1", "admin@test.com", expect.anything(), expect.anything()
      );
    });

    it("returns 409 when store has entries", async () => {
      mockGetStore.mockResolvedValue({ id: "s1", spaceId: "sp1", name: "Gold", slug: "gold", artifactType: "value" });
      mockDeleteStore.mockRejectedValue(new Error("Cannot delete store with 5 entries."));

      const { DELETE } = await import("@/app/api/spaces/[spaceId]/stores/[streamId]/route");
      const req = makeRequest("http://localhost/api/spaces/sp1/stores/s1", "DELETE");
      const res = await DELETE(req, { params: Promise.resolve({ spaceId: "sp1", streamId: "s1" }) });

      expect(res.status).toBe(409);
    });
  });
});
