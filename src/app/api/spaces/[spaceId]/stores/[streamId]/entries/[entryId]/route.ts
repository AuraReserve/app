import { getEntry } from "@/lib/dal";
import { spaceRoute, ApiError, ApiSuccess } from "@/lib/api";

// GET /api/spaces/[spaceId]/stores/[streamId]/entries/[entryId] — entry detail
export const GET = spaceRoute<{ streamId: string; entryId: string }>(
  { label: "fetch entry" },
  async ({ params, request }) => {
    const url = new URL(request.url);
    const includeLeaves = url.searchParams.get("leaves") === "true";

    const entry = await getEntry(params.entryId, includeLeaves);
    if (!entry || entry.stream.spaceId !== params.spaceId || entry.streamId !== params.streamId) {
      return ApiError.notFound("Entry");
    }

    return ApiSuccess.ok(entry);
  }
);
