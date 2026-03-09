import { after } from "next/server";
import { createDataOutput, listDataOutputs } from "@/lib/dal/data-outputs";
import { spaceRoute, ApiError, ApiSuccess } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { auditIntegrationOperation } from "@/lib/dal/audit";

// GET /api/spaces/[spaceId]/data-outputs — list all data outputs for a space
export const GET = spaceRoute(
  { label: "list data outputs" },
  async ({ params }) => {
    const outputs = await listDataOutputs(params.spaceId);
    return ApiSuccess.ok(outputs);
  }
);

// POST /api/spaces/[spaceId]/data-outputs — create a new data output
export const POST = spaceRoute(
  { requiredAccess: "admin", label: "create data output" },
  async ({ session, params, request }) => {
    const body = await request.json();

    try {
      const result = await createDataOutput({
        spaceId: params.spaceId,
        integrationKey: body.integrationKey,
        streamId: body.streamId,
        trigger: body.trigger,
        schedule: body.schedule,
        config: body.config,
      });

      after(async () => {
        await auditIntegrationOperation(
          "create",
          result.id,
          params.spaceId,
          session.user.email,
          request,
          {
            newValues: {
              integrationKey: body.integrationKey,
              streamId: body.streamId,
              direction: "output",
              trigger: body.trigger,
              schedule: body.schedule,
            },
          }
        );
      });

      return ApiSuccess.created(result);
    } catch (e) {
      if (e instanceof AppError) {
        switch (e.code) {
          case "NOT_FOUND":
            return ApiError.notFound(e.message);
          case "VALIDATION":
            return ApiError.badRequest(e.message);
          case "CONFLICT":
            return ApiError.conflict(e.message);
          case "ENTITLEMENT":
            return ApiError.forbidden(e.message);
        }
      }
      throw e;
    }
  }
);
