import { updateDataInput, getDataInput } from "@/lib/dal/data-inputs";
import { auditIntegrationOperation } from "@/lib/dal";
import { spaceRoute, ApiError, ApiSuccess } from "@/lib/api";
import { AppError } from "@/lib/errors";

// GET /api/spaces/[spaceId]/data-inputs/[inputId] — get a single data input
export const GET = spaceRoute<{ inputId: string }>(
  { label: "get data input" },
  async ({ params }) => {
    const input = await getDataInput(params.inputId);
    if (!input || input.spaceId !== params.spaceId) {
      return ApiError.notFound("Data input not found");
    }
    return ApiSuccess.ok(input);
  }
);

// PATCH /api/spaces/[spaceId]/data-inputs/[inputId] — update a data input
export const PATCH = spaceRoute<{ inputId: string }>(
  { requiredAccess: "admin", label: "update data input" },
  async ({ params, request, session }) => {
    const body = await request.json();

    // Fetch existing for audit old values
    const existing = await getDataInput(params.inputId);
    if (!existing || existing.spaceId !== params.spaceId) {
      return ApiError.notFound("Data input not found");
    }

    try {
      const result = await updateDataInput(params.inputId, params.spaceId, {
        config: body.config,
        trigger: body.trigger,
        schedule: body.schedule,
        status: body.status,
      });

      // Audit log
      await auditIntegrationOperation(
        "update",
        params.inputId,
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
            direction: "input",
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
