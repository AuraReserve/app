import { UnrecoverableError } from "bullmq";
import { runSpaceIntegration } from "@/lib/integrations/runner";
import type { IntegrationRunJobData } from "../jobs";

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

export async function processIntegrationRun(
  data: IntegrationRunJobData
): Promise<void> {
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
