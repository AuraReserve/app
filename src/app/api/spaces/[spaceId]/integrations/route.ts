import { getSpaceIntegrations, installSpaceIntegration, auditIntegrationOperation } from "@/lib/dal";
import { spaceRoute, ApiError, ApiSuccess } from "@/lib/api";

// GET /api/spaces/[spaceId]/integrations — list all configured integrations for a space
export const GET = spaceRoute(
  { label: "list integrations" },
  async ({ params }) => {
    const integrations = await getSpaceIntegrations(params.spaceId);
    return ApiSuccess.ok(integrations);
  }
);

// POST /api/spaces/[spaceId]/integrations — install a new source/destination
export const POST = spaceRoute(
  { requiredAccess: "admin", label: "install integration" },
  async ({ session, params, request }) => {
    const body = await request.json();
    const { integrationId, streamId, direction, config, schedule, trigger } = body;

    if (!integrationId || !streamId || !direction) {
      return ApiError.badRequest("integrationId, streamId, and direction are required");
    }

    if (direction !== "input" && direction !== "output") {
      return ApiError.badRequest("direction must be 'input' or 'output'");
    }

    const result = await installSpaceIntegration(params.spaceId, {
      integrationId,
      streamId,
      direction,
      config,
      schedule,
      trigger,
    });

    await auditIntegrationOperation("create", result.id, params.spaceId, session.user.email, request, {
      newValues: { integrationId, streamId, direction },
    });

    return ApiSuccess.created(result);
  }
);
