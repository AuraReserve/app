import { getMarketplaceCatalog, activateIntegration, auditIntegrationOperation } from "@/lib/dal";
import { spaceRoute, ApiError, ApiSuccess } from "@/lib/api";

// GET /api/spaces/[spaceId]/integrations/marketplace — full catalog with activation state
export const GET = spaceRoute(
  { label: "load marketplace" },
  async ({ params }) => {
    const catalog = await getMarketplaceCatalog(params.spaceId);
    return ApiSuccess.ok(catalog);
  }
);

// POST /api/spaces/[spaceId]/integrations/marketplace — activate a paid integration
export const POST = spaceRoute(
  { requiredAccess: "admin", label: "activate integration" },
  async ({ session, params, request }) => {
    const body = await request.json();
    const { integrationKey } = body;

    if (!integrationKey) {
      return ApiError.badRequest("integrationKey is required");
    }

    const result = await activateIntegration(params.spaceId, integrationKey);

    await auditIntegrationOperation("create", integrationKey, params.spaceId, session.user.email, request, {
      newValues: { integrationKey, action: "marketplace_activate" },
    });

    return ApiSuccess.ok(result);
  }
);
