import { getMarketplaceCatalog } from "@/lib/dal";
import { spaceRoute, ApiSuccess } from "@/lib/api";

// GET /api/spaces/[spaceId]/integrations/catalog — list all integrations with activation state
export const GET = spaceRoute(
  { label: "load catalog" },
  async ({ params }) => {
    const catalog = await getMarketplaceCatalog(params.spaceId);

    const inputSources = catalog.filter((i) => i.supportsInput);
    const outputDestinations = catalog.filter((i) => i.supportsOutput);

    return ApiSuccess.ok({ inputSources, outputDestinations });
  }
);
