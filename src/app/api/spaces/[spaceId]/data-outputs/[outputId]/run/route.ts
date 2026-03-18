import { NextResponse } from "next/server";
import { getDataOutput } from "@/lib/dal/data-outputs";
import { enqueueIntegrationRun } from "@/lib/queue/jobs";
import { spaceRoute, ApiError } from "@/lib/api";
import type { IntegrationStatus } from "@prisma/client";

const STATUS_ACTIVE = "ACTIVE" as unknown as IntegrationStatus;

// POST /api/spaces/[spaceId]/data-outputs/[outputId]/run
// Enqueues the output handler for async processing.
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

    const job = await enqueueIntegrationRun(
      params.outputId,
      "manual",
      undefined,
      {
        maxAttempts: output.maxAttempts,
        retryBackoff: output.retryBackoff,
      }
    );

    return NextResponse.json({
      jobId: job.id,
      message: "Output run enqueued",
    }, { status: 202 });
  }
);
