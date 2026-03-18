/**
 * BullMQ Worker Entrypoint
 *
 * Standalone process that processes integration jobs from the queue.
 * Run via: pnpm exec tsx src/worker.ts
 */

import "dotenv/config";
import { Worker } from "bullmq";
import { getRedisConnection, closeRedisConnection } from "@/lib/queue/connection";
import { processIntegrationRun } from "@/lib/queue/workers/integration.worker";
import { processNotify, processDeliver } from "@/lib/queue/workers/notification.worker";
import { syncAllRepeatables } from "@/lib/queue/sync";
import { registerChannel } from "@/lib/notifications/registry";
import { webhookChannel } from "@/lib/notifications/channels/webhook";
import { enqueueNotify } from "@/lib/queue/jobs";
import type { IntegrationRunJobData, NotifyJobData, DeliverJobData } from "@/lib/queue/jobs";

// Register external notification channels
// (in-app notifications are always created directly by processNotify)
registerChannel(webhookChannel);

const connection = getRedisConnection();

const worker = new Worker(
  "integrations",
  async (job) => {
    switch (job.name) {
      case "integration.run":
        return processIntegrationRun(job.data as IntegrationRunJobData, job.timestamp);
      case "integration.notify":
        return processNotify(job.data as NotifyJobData);
      case "notification.deliver":
        return processDeliver(job.data as DeliverJobData);
      default:
        console.warn(`[Worker] Unknown job type: ${job.name}`);
    }
  },
  {
    connection: connection as never,
    concurrency: 5,
  }
);

// Handle final failure — enqueue notification
worker.on("failed", async (job, err) => {
  if (!job) return;
  // Only notify for integration.run jobs that exhausted all attempts
  if (job.name !== "integration.run") return;
  if (job.attemptsMade < (job.opts.attempts ?? 1)) return;

  const data = job.data as IntegrationRunJobData;
  await enqueueNotify({
    spaceIntegrationId: data.spaceIntegrationId,
    error: err.message,
    failedAt: new Date().toISOString(),
    attemptsMade: job.attemptsMade,
  });
});

worker.on("ready", () => {
  console.log("[Worker] Ready and processing jobs");
});

worker.on("error", (err) => {
  console.error("[Worker] Error:", err.message);
});

// Graceful shutdown
async function shutdown() {
  console.log("[Worker] Shutting down gracefully...");
  await worker.close();
  await closeRedisConnection();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

// Startup: reconcile repeatable jobs from DB
(async () => {
  try {
    await syncAllRepeatables();
    console.log("[Worker] Startup sync complete");
  } catch (err) {
    console.error("[Worker] Startup sync failed:", err);
  }
})();
