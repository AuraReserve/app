import { UnrecoverableError } from "bullmq";
import { runSpaceIntegration } from "@/lib/integrations/runner";
import type { IntegrationRunJobData } from "../jobs";

/**
 * Maximum age (ms) for a cron job to still be processed.
 * Jobs older than this are skipped as stale — they accumulated while
 * no worker was running. Manual and on_change jobs are never skipped.
 */
const CRON_STALENESS_MS = 5 * 60 * 1000; // 5 minutes

const NON_RETRYABLE_PATTERNS = [
  "is INACTIVE",
  "No input handler for",
  "No output handler for",
  "Manual input requires",
  "Integration has no assigned stream",
];

function isNonRetryable(message: string): boolean {
  return NON_RETRYABLE_PATTERNS.some((p) => message.includes(p));
}

/**
 * Process an integration.run job.
 * @param data - Job payload
 * @param jobTimestamp - When the job was created (ms since epoch)
 */
export async function processIntegrationRun(
  data: IntegrationRunJobData,
  jobTimestamp?: number
): Promise<void> {
  // Skip stale cron jobs that accumulated while the worker was down
  if (data.trigger === "cron" && jobTimestamp) {
    const age = Date.now() - jobTimestamp;
    if (age > CRON_STALENESS_MS) {
      console.log(
        `[Worker] Skipping stale cron job for ${data.spaceIntegrationId} (age: ${Math.round(age / 1000)}s)`
      );
      return;
    }
  }

  const result = await runSpaceIntegration(
    data.spaceIntegrationId,
    data.options
  );

  if (!result.success) {
    const msg = result.message || "Integration run failed";
    if (isNonRetryable(msg)) {
      throw new UnrecoverableError(msg);
    }
    throw new Error(msg);
  }
}
