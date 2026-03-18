import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the queue
const mockAdd = vi.fn().mockResolvedValue({ id: "job-123" });
vi.mock("@/lib/queue/queues", () => ({
  getIntegrationQueue: () => ({ add: mockAdd }),
}));

describe("job enqueue helpers", () => {
  beforeEach(() => {
    mockAdd.mockClear();
  });

  it("enqueueIntegrationRun adds integration.run job", async () => {
    const { enqueueIntegrationRun } = await import("@/lib/queue/jobs");
    const result = await enqueueIntegrationRun("si-123", "manual");
    expect(mockAdd).toHaveBeenCalledWith(
      "integration.run",
      { spaceIntegrationId: "si-123", trigger: "manual" },
      expect.any(Object)
    );
    expect(result).toEqual({ id: "job-123" });
  });

  it("enqueueIntegrationRun passes retry options from params", async () => {
    const { enqueueIntegrationRun } = await import("@/lib/queue/jobs");
    await enqueueIntegrationRun("si-123", "cron", undefined, {
      maxAttempts: 5,
      retryBackoff: 60,
    });
    expect(mockAdd).toHaveBeenCalledWith(
      "integration.run",
      expect.any(Object),
      expect.objectContaining({
        attempts: 5,
        backoff: { type: "exponential", delay: 60000 },
      })
    );
  });

  it("enqueueNotify adds integration.notify job", async () => {
    const { enqueueNotify } = await import("@/lib/queue/jobs");
    await enqueueNotify({
      spaceIntegrationId: "si-123",
      error: "RPC timeout",
      failedAt: "2026-03-18T00:00:00Z",
      attemptsMade: 3,
    });
    expect(mockAdd).toHaveBeenCalledWith(
      "integration.notify",
      expect.objectContaining({ spaceIntegrationId: "si-123" }),
      expect.any(Object)
    );
  });

  it("enqueueDeliver adds notification.deliver job", async () => {
    const { enqueueDeliver } = await import("@/lib/queue/jobs");
    await enqueueDeliver({
      notificationId: "n-1",
      channelId: "ch-1",
      channelType: "webhook",
      payload: {
        event: "integration.failed",
        space: { id: "s1", name: "Test" },
        integration: { id: "i1", key: "webhook", name: "Webhook" },
        error: "fail",
        attemptsMade: 3,
        failedAt: "2026-03-18T00:00:00Z",
      },
    });
    expect(mockAdd).toHaveBeenCalledWith(
      "notification.deliver",
      expect.objectContaining({ channelType: "webhook" }),
      expect.any(Object)
    );
  });
});
