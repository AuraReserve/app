import { getRecentEntriesForSpace } from "@/lib/dal";
import { spaceRoute, ApiSuccess } from "@/lib/api";

// GET /api/spaces/[spaceId]/activity — recent entries across all stores
export const GET = spaceRoute(
  { label: "fetch activity" },
  async ({ params, request }) => {
    const url = new URL(request.url);
    const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "20", 10) || 20, 1), 100);
    const streamId = url.searchParams.get("streamId") || undefined;

    const entries = await getRecentEntriesForSpace(params.spaceId, { limit, streamId });
    return ApiSuccess.ok(entries);
  }
);
