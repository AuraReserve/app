import { describe, it, expect, vi, beforeEach } from "vitest";

const mockUpsertJobScheduler = vi.fn().mockResolvedValue(undefined);
const mockRemoveJobScheduler = vi.fn().mockResolvedValue(true);
const mockGetJobSchedulers = vi.fn().mockResolvedValue([]);
const mockQueue = {
  upsertJobScheduler: mockUpsertJobScheduler,
  removeJobScheduler: mockRemoveJobScheduler,
  getJobSchedulers: mockGetJobSchedulers,
};

vi.mock("@/lib/queue/queues", () => ({
  getIntegrationQueue: () => mockQueue,
}));

const mockFindUnique = vi.fn();
const mockFindMany = vi.fn().mockResolvedValue([]);
vi.mock("@/lib/prisma", () => ({
  prisma: {
    spaceIntegration: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
  },
}));

describe("sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("syncRepeatableJob upserts when integration has CRON trigger and ACTIVE status", async () => {
    mockFindUnique.mockResolvedValue({
      id: "si-1",
      trigger: "CRON",
      status: "ACTIVE",
      schedule: "*/5 * * * *",
      maxAttempts: 3,
      retryBackoff: 30,
    });

    const { syncRepeatableJob } = await import("@/lib/queue/sync");
    await syncRepeatableJob("si-1");

    expect(mockUpsertJobScheduler).toHaveBeenCalledWith(
      "si-1",
      { pattern: "*/5 * * * *" },
      expect.objectContaining({
        name: "integration.run",
        data: expect.objectContaining({ spaceIntegrationId: "si-1", trigger: "cron" }),
        opts: expect.any(Object),
      })
    );
  });

  it("syncRepeatableJob removes when integration is not CRON", async () => {
    mockFindUnique.mockResolvedValue({
      id: "si-1",
      trigger: "MANUAL",
      status: "ACTIVE",
      schedule: null,
    });

    const { syncRepeatableJob } = await import("@/lib/queue/sync");
    await syncRepeatableJob("si-1");

    expect(mockRemoveJobScheduler).toHaveBeenCalledWith("si-1");
    expect(mockUpsertJobScheduler).not.toHaveBeenCalled();
  });

  it("removeRepeatableJob calls removeJobScheduler", async () => {
    const { removeRepeatableJob } = await import("@/lib/queue/sync");
    await removeRepeatableJob("si-1");

    expect(mockRemoveJobScheduler).toHaveBeenCalledWith("si-1");
  });

  it("syncAllRepeatables removes orphans and upserts from DB", async () => {
    mockGetJobSchedulers.mockResolvedValue([
      { key: "si-orphan" },
      { key: "si-existing" },
    ]);
    mockFindMany.mockResolvedValue([
      { id: "si-existing", schedule: "0 * * * *", maxAttempts: 3, retryBackoff: 30 },
      { id: "si-new", schedule: "0 9 * * 1-5", maxAttempts: 5, retryBackoff: 60 },
    ]);

    const { syncAllRepeatables } = await import("@/lib/queue/sync");
    await syncAllRepeatables();

    // Orphan removed
    expect(mockRemoveJobScheduler).toHaveBeenCalledWith("si-orphan");
    // Existing + new upserted
    expect(mockUpsertJobScheduler).toHaveBeenCalledTimes(2);
  });
});
