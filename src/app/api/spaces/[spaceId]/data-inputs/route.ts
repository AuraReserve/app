import { after } from "next/server";
import { createDataInput, listDataInputs } from "@/lib/dal/data-inputs";
import { spaceRoute, ApiError, ApiSuccess } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { auditIntegrationOperation } from "@/lib/dal/audit";

// GET /api/spaces/[spaceId]/data-inputs — list all data inputs for a space
export const GET = spaceRoute(
  { label: "list data inputs" },
  async ({ params }) => {
    const inputs = await listDataInputs(params.spaceId);
    return ApiSuccess.ok(inputs);
  }
);

// POST /api/spaces/[spaceId]/data-inputs — create a new data input
export const POST = spaceRoute(
  { requiredAccess: "admin", label: "create data input" },
  async ({ session, params, request }) => {
    const body = await request.json();

    try {
      const result = await createDataInput({
        spaceId: params.spaceId,
        userId: session.user.id,
        integrationKey: body.integrationKey,
        name: body.name,
        artifactType: body.artifactType,
        assetType: body.assetType,
        unit: body.unit,
        valueField: body.valueField,
        existingStreamId: body.existingStreamId,
        accessGroupId: body.accessGroupId,
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
              name: body.name,
              direction: "input",
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
