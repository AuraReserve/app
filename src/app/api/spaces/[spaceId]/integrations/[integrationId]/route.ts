import {
  getSpaceIntegrationById,
  updateSpaceIntegration,
  removeSpaceIntegration,
  auditIntegrationOperation,
} from "@/lib/dal";
import { spaceRoute, ApiError, ApiSuccess } from "@/lib/api";

// GET /api/spaces/[spaceId]/integrations/[integrationId]
export const GET = spaceRoute<{ integrationId: string }>(
  { label: "get integration" },
  async ({ params }) => {
    const integration = await getSpaceIntegrationById(params.integrationId);
    if (!integration || integration.spaceId !== params.spaceId) {
      return ApiError.notFound("Integration");
    }
    return ApiSuccess.ok(integration);
  }
);

// PATCH /api/spaces/[spaceId]/integrations/[integrationId]
export const PATCH = spaceRoute<{ integrationId: string }>(
  { requiredAccess: "admin", label: "update integration" },
  async ({ session, params, request }) => {
    const existing = await getSpaceIntegrationById(params.integrationId);
    if (!existing || existing.spaceId !== params.spaceId) {
      return ApiError.notFound("Integration");
    }

    const body = await request.json();
    const { config, schedule, trigger, status } = body;

    const result = await updateSpaceIntegration(params.integrationId, {
      config,
      schedule,
      trigger,
      status,
    });

    await auditIntegrationOperation("update", params.integrationId, params.spaceId, session.user.email, request, {
      oldValues: { status: existing.status },
      newValues: { config, schedule, trigger, status },
    });

    return ApiSuccess.ok(result);
  }
);

// DELETE /api/spaces/[spaceId]/integrations/[integrationId]
export const DELETE = spaceRoute<{ integrationId: string }>(
  { requiredAccess: "admin", label: "remove integration" },
  async ({ session, params, request }) => {
    const existing = await getSpaceIntegrationById(params.integrationId);
    if (!existing || existing.spaceId !== params.spaceId) {
      return ApiError.notFound("Integration");
    }

    await removeSpaceIntegration(params.integrationId);

    await auditIntegrationOperation("delete", params.integrationId, params.spaceId, session.user.email, request, {
      oldValues: { integrationId: existing.integrationId, direction: existing.direction, streamId: existing.streamId },
    });

    return ApiSuccess.success();
  }
);
