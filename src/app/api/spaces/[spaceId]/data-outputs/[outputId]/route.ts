import { updateDataOutput, getDataOutput } from "@/lib/dal/data-outputs";
import { auditIntegrationOperation } from "@/lib/dal";
import { spaceRoute, ApiError, ApiSuccess } from "@/lib/api";
import { AppError } from "@/lib/errors";

// GET /api/spaces/[spaceId]/data-outputs/[outputId] — get a single data output
export const GET = spaceRoute<{ outputId: string }>(
  { label: "get data output" },
  async ({ params }) => {
    const output = await getDataOutput(params.outputId);
    if (!output || output.spaceId !== params.spaceId) {
      return ApiError.notFound("Data output not found");
    }
    return ApiSuccess.ok(output);
  }
);

// PATCH /api/spaces/[spaceId]/data-outputs/[outputId] — update a data output
export const PATCH = spaceRoute<{ outputId: string }>(
  { requiredAccess: "admin", label: "update data output" },
  async ({ params, request, session }) => {
    const body = await request.json();

    // Fetch existing for audit old values
    const existing = await getDataOutput(params.outputId);
    if (!existing || existing.spaceId !== params.spaceId) {
      return ApiError.notFound("Data output not found");
    }

    try {
      const result = await updateDataOutput(params.outputId, params.spaceId, {
        config: body.config,
        trigger: body.trigger,
        schedule: body.schedule,
        status: body.status,
      });

      // Audit log
      await auditIntegrationOperation(
        "update",
        params.outputId,
        params.spaceId,
        session.user.email,
        request,
        {
          oldValues: {
            status: existing.status,
            config: existing.config,
            trigger: existing.trigger,
            schedule: existing.schedule,
          },
          newValues: {
            status: body.status,
            config: body.config,
            trigger: body.trigger,
            schedule: body.schedule,
          },
          details: {
            direction: "output",
            integrationKey: existing.integration.key,
          },
        }
      );

      return ApiSuccess.ok(result);
    } catch (e) {
      if (e instanceof AppError) {
        switch (e.code) {
          case "NOT_FOUND":
            return ApiError.notFound(e.message);
          case "VALIDATION":
            return ApiError.badRequest(e.message);
        }
      }
      throw e;
    }
  }
);
