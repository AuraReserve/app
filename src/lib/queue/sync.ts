import { prisma } from "@/lib/prisma";
import { getIntegrationQueue } from "./queues";
import type { IntegrationRunJobData } from "./jobs";
import type { IntegrationStatus, IntegrationTrigger } from "@prisma/client";

// Prisma 7 enum workaround
const STATUS_ACTIVE = "ACTIVE" as unknown as IntegrationStatus;
const TRIGGER_CRON = "CRON" as unknown as IntegrationTrigger;

/**
 * Sync a single integration's repeatable job in BullMQ.
 * Upserts if trigger=CRON + status=ACTIVE + schedule present.
 * Removes otherwise.
 */
export async function syncRepeatableJob(
  spaceIntegrationId: string
): Promise<void> {
  const si = await prisma.spaceIntegration.findUnique({
    where: { id: spaceIntegrationId },
    select: {
      id: true,
      trigger: true,
      status: true,
      schedule: true,
      maxAttempts: true,
      retryBackoff: true,
    },
  });

  if (!si) {
    await removeRepeatableJob(spaceIntegrationId);
    return;
  }

  const shouldSchedule =
    si.trigger === TRIGGER_CRON &&
    si.status === STATUS_ACTIVE &&
    si.schedule;

  if (!shouldSchedule) {
    await removeRepeatableJob(spaceIntegrationId);
    return;
  }

  const queue = getIntegrationQueue();
  const data: IntegrationRunJobData = {
    spaceIntegrationId: si.id,
    trigger: "cron",
  };

  await queue.upsertJobScheduler(
    si.id,
    { pattern: si.schedule! },
    {
      name: "integration.run",
      data,
      opts: {
        attempts: si.maxAttempts,
        backoff: {
          type: "exponential" as const,
          delay: si.retryBackoff * 1000,
        },
      },
    }
  );
}

/**
 * Remove a repeatable job from BullMQ by spaceIntegrationId.
 */
export async function removeRepeatableJob(
  spaceIntegrationId: string
): Promise<void> {
  const queue = getIntegrationQueue();
  await queue.removeJobScheduler(spaceIntegrationId);
}

/**
 * Full reconciliation: sync all active CRON integrations from DB to BullMQ.
 * Removes orphaned repeatables. Called on worker startup.
 */
export async function syncAllRepeatables(): Promise<void> {
  const queue = getIntegrationQueue();

  // 1. Get all existing BullMQ job schedulers
  const schedulers = await queue.getJobSchedulers();
  const existingKeys = new Set(schedulers.map((s) => s.key));

  // 2. Get all active CRON integrations from DB
  const dbIntegrations = await prisma.spaceIntegration.findMany({
    where: {
      trigger: TRIGGER_CRON,
      status: STATUS_ACTIVE,
      schedule: { not: null },
    },
    select: {
      id: true,
      schedule: true,
      maxAttempts: true,
      retryBackoff: true,
    },
  });
  const dbIds = new Set(dbIntegrations.map((si) => si.id));

  // 3. Remove orphans (in BullMQ but not in DB)
  for (const key of existingKeys) {
    if (!dbIds.has(key)) {
      await queue.removeJobScheduler(key);
    }
  }

  // 4. Upsert all DB integrations
  for (const si of dbIntegrations) {
    const data: IntegrationRunJobData = {
      spaceIntegrationId: si.id,
      trigger: "cron",
    };

    await queue.upsertJobScheduler(
      si.id,
      { pattern: si.schedule! },
      {
        name: "integration.run",
        data,
        opts: {
          attempts: si.maxAttempts,
          backoff: {
            type: "exponential" as const,
            delay: si.retryBackoff * 1000,
          },
        },
      }
    );
  }

  const orphanCount = [...existingKeys].filter((k) => !dbIds.has(k)).length;
  console.log(
    `[Queue] Synced ${dbIntegrations.length} repeatable jobs, removed ${orphanCount} orphans`
  );
}
