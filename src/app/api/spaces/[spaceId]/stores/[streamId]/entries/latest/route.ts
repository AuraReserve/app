import { getStore, getLatestEntry } from "@/lib/dal";
import { spaceRoute, ApiError, ApiSuccess } from "@/lib/api";

// GET /api/spaces/[spaceId]/stores/[streamId]/entries/latest — latest entry
export const GET = spaceRoute<{ streamId: string }>(
  { label: "fetch latest entry" },
  async ({ params }) => {
    const stream = await getStore(params.streamId);
    if (!stream || stream.spaceId !== params.spaceId) {
      return ApiError.notFound("Stream");
    }

    const entry = await getLatestEntry(params.streamId);
    if (!entry) {
      return ApiError.notFound("No entries");
    }

    return ApiSuccess.ok(entry);
  }
);
