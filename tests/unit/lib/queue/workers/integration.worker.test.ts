import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRunSpaceIntegration = vi.fn();
vi.mock("@/lib/integrations/runner", () => ({
  runSpaceIntegration: (...args: unknown[]) => mockRunSpaceIntegration(...args),
}));

const mockEnqueueNotify = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/queue/jobs", () => ({
  enqueueNotify: (...args: unknown[]) => mockEnqueueNotify(...args),
}));

describe("processIntegrationRun", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls runSpaceIntegration and returns on success", async () => {
    mockRunSpaceIntegration.mockResolvedValue({ success: true, message: "ok" });
    const { processIntegrationRun } = await import(
      "@/lib/queue/workers/integration.worker"
    );

    await expect(
      processIntegrationRun({
        spaceIntegrationId: "si-1",
        trigger: "cron",
      })
    ).resolves.toBeUndefined();
  });

  it("throws Error on retryable failure", async () => {
    mockRunSpaceIntegration.mockResolvedValue({
      success: false,
      message: "RPC timeout",
    });
    const { processIntegrationRun } = await import(
      "@/lib/queue/workers/integration.worker"
    );

    await expect(
      processIntegrationRun({
        spaceIntegrationId: "si-1",
        trigger: "cron",
      })
    ).rejects.toThrow("RPC timeout");
  });

  it("throws UnrecoverableError for non-retryable failures", async () => {
    mockRunSpaceIntegration.mockResolvedValue({
      success: false,
      message: "Integration is INACTIVE, not active",
    });
    const { processIntegrationRun } = await import(
      "@/lib/queue/workers/integration.worker"
    );

    await expect(
      processIntegrationRun({
        spaceIntegrationId: "si-1",
        trigger: "cron",
      })
    ).rejects.toThrow("Integration is INACTIVE");
    // Verify it's an UnrecoverableError
    try {
      await processIntegrationRun({
        spaceIntegrationId: "si-1",
        trigger: "cron",
      });
    } catch (e) {
      expect((e as Error).constructor.name).toBe("UnrecoverableError");
    }
  });

  it("skips stale cron jobs older than 5 minutes", async () => {
    mockRunSpaceIntegration.mockResolvedValue({ success: true });
    const { processIntegrationRun } = await import(
      "@/lib/queue/workers/integration.worker"
    );

    const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
    await processIntegrationRun(
      { spaceIntegrationId: "si-1", trigger: "cron" },
      tenMinutesAgo
    );

    // Should NOT have called runSpaceIntegration
    expect(mockRunSpaceIntegration).not.toHaveBeenCalled();
  });

  it("processes recent cron jobs normally", async () => {
    mockRunSpaceIntegration.mockResolvedValue({ success: true });
    const { processIntegrationRun } = await import(
      "@/lib/queue/workers/integration.worker"
    );

    const oneMinuteAgo = Date.now() - 60 * 1000;
    await processIntegrationRun(
      { spaceIntegrationId: "si-1", trigger: "cron" },
      oneMinuteAgo
    );

    expect(mockRunSpaceIntegration).toHaveBeenCalled();
  });

  it("never skips manual or on_change jobs regardless of age", async () => {
    mockRunSpaceIntegration.mockResolvedValue({ success: true });
    const { processIntegrationRun } = await import(
      "@/lib/queue/workers/integration.worker"
    );

    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    await processIntegrationRun(
      { spaceIntegrationId: "si-1", trigger: "manual" },
      oneHourAgo
    );
    expect(mockRunSpaceIntegration).toHaveBeenCalled();

    mockRunSpaceIntegration.mockClear();
    await processIntegrationRun(
      { spaceIntegrationId: "si-1", trigger: "on_change" },
      oneHourAgo
    );
    expect(mockRunSpaceIntegration).toHaveBeenCalled();
  });
});
