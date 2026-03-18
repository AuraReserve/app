import type { RunOptions } from "@/lib/integrations/runner";
import { getIntegrationQueue } from "./queues";

// ---------------------------------------------------------------------------
// Job data interfaces
// ---------------------------------------------------------------------------

export interface IntegrationRunJobData {
  spaceIntegrationId: string;
  trigger: "cron" | "manual" | "on_change";
  options?: RunOptions;
}

export interface NotifyJobData {
  spaceIntegrationId: string;
  error: string;
  failedAt: string;
  attemptsMade: number;
}

export interface DeliverJobData {
  notificationId: string;
  channelId: string;
  channelType: string;
  payload: {
    event: string;
    space: { id: string; name: string };
    integration: { id: string; key: string; name: string };
    error: string;
    attemptsMade: number;
    failedAt: string;
  };
}

// ---------------------------------------------------------------------------
// Retry config passed from SpaceIntegration fields
// ---------------------------------------------------------------------------

export interface RetryConfig {
  maxAttempts: number;
  retryBackoff: number; // seconds
}

const DEFAULT_RETRY: RetryConfig = { maxAttempts: 3, retryBackoff: 30 };

// ---------------------------------------------------------------------------
// Enqueue helpers
// ---------------------------------------------------------------------------

export async function enqueueIntegrationRun(
  spaceIntegrationId: string,
  trigger: IntegrationRunJobData["trigger"],
  options?: RunOptions,
  retry?: Partial<RetryConfig>
) {
  const queue = getIntegrationQueue();
  const { maxAttempts, retryBackoff } = { ...DEFAULT_RETRY, ...retry };

  return queue.add(
    "integration.run",
    { spaceIntegrationId, trigger, options } satisfies IntegrationRunJobData,
    {
      attempts: maxAttempts,
      backoff: { type: "exponential" as const, delay: retryBackoff * 1000 },
    }
  );
}

export async function enqueueNotify(data: NotifyJobData) {
  const queue = getIntegrationQueue();
  return queue.add("integration.notify", data, {
    attempts: 3,
    backoff: { type: "fixed" as const, delay: 30_000 },
  });
}

export async function enqueueDeliver(data: DeliverJobData) {
  const queue = getIntegrationQueue();
  return queue.add("notification.deliver", data, {
    attempts: 3,
    backoff: { type: "fixed" as const, delay: 30_000 },
  });
}
