import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFindMany = vi.fn().mockResolvedValue([]);
const mockFindUnique = vi.fn();
const mockCreate = vi.fn().mockResolvedValue({ id: "n-1" });

vi.mock("@/lib/prisma", () => ({
  prisma: {
    notification: { create: (...args: unknown[]) => mockCreate(...args) },
    notificationChannel: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      findUnique: vi.fn(),
    },
    spaceIntegration: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
    },
  },
}));

const mockEnqueueDeliver = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/queue/jobs", () => ({
  enqueueDeliver: (...args: unknown[]) => mockEnqueueDeliver(...args),
}));

describe("processNotify", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates in-app notification and enqueues delivery for each channel", async () => {
    mockFindUnique.mockResolvedValue({
      id: "si-1",
      spaceId: "s-1",
      space: { id: "s-1", name: "Test" },
      integration: { id: "int-1", key: "webhook", name: "Webhook" },
    });
    mockFindMany.mockResolvedValue([
      { id: "ch-1", type: "webhook", config: { url: "https://example.com" }, enabled: true },
    ]);

    const { processNotify } = await import(
      "@/lib/queue/workers/notification.worker"
    );
    await processNotify({
      spaceIntegrationId: "si-1",
      error: "timeout",
      failedAt: "2026-03-18T00:00:00Z",
      attemptsMade: 3,
    });

    expect(mockCreate).toHaveBeenCalled();
    expect(mockEnqueueDeliver).toHaveBeenCalledTimes(1);
  });
});
