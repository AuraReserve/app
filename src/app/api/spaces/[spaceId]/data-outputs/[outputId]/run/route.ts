import { getDataOutput } from "@/lib/dal/data-outputs";
import { runSpaceIntegration } from "@/lib/integrations/runner";
import { spaceRoute, ApiError, ApiSuccess } from "@/lib/api";
import type { IntegrationStatus } from "@prisma/client";

// Workaround for Prisma 7 @map enum bug (prisma/prisma#28894)
const STATUS_ACTIVE = "ACTIVE" as unknown as IntegrationStatus;

// POST /api/spaces/[spaceId]/data-outputs/[outputId]/run
// Triggers the output handler (e.g. webhook delivery) and returns the result.
export const POST = spaceRoute<{ outputId: string }>(
  { requiredAccess: "auditor", label: "run data output" },
  async ({ params }) => {
    const output = await getDataOutput(params.outputId);
    if (!output || output.spaceId !== params.spaceId) {
      return ApiError.notFound("Data output not found");
    }

    if (output.status !== STATUS_ACTIVE) {
      return ApiError.badRequest("Output is not active");
    }

    const startTime = Date.now();

    try {
      const result = await runSpaceIntegration(params.outputId);
      const durationMs = Date.now() - startTime;

      return ApiSuccess.ok({
        ...result,
        durationMs,
      });
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const message =
        error instanceof Error ? error.message : "Unknown error";
      return ApiSuccess.ok({
        success: false,
        message: `Output run failed: ${message}`,
        durationMs,
      });
    }
  }
);
