import { getEntry, archiveEntry, restoreEntry } from "@/lib/dal";
import { extractRequestInfo, createAuditLog } from "@/lib/dal";
import { spaceRoute, ApiSuccess, ApiError } from "@/lib/api";

// PATCH /api/spaces/[spaceId]/entries/[entryId]/archive
export const PATCH = spaceRoute<{ entryId: string }>(
  { label: "archive/restore entry", requiredAccess: "auditor" },
  async ({ params, session, request }) => {
    const entry = await getEntry(params.entryId);

    if (!entry) {
      return ApiError.notFound("Entry not found");
    }

    // Verify entry belongs to this space
    if (entry.stream.spaceId !== params.spaceId) {
      return ApiError.notFound("Entry not found");
    }

    const body = await request.json();
    const action = body.action as "archive" | "restore";

    if (action === "archive") {
      const reason = (body.reason as string)?.trim();
      if (!reason) {
        return ApiError.badRequest("Reason is required for archiving");
      }

      const oldValues = {
        archived: entry.archived,
        archivedAt: entry.archivedAt,
        archivedReason: entry.archivedReason,
      };

      const updated = await archiveEntry(params.entryId, reason);

      const { ipAddress, userAgent } = extractRequestInfo(request);
      await createAuditLog({
        action: "archive",
        resourceType: "stream_entry",
        resourceId: params.entryId,
        userEmail: session.user.email,
        spaceId: params.spaceId,
        ipAddress,
        userAgent,
        details: {
          reason,
          streamId: entry.streamId,
          streamName: entry.stream.name,
          value: entry.value,
        },
        oldValues,
        newValues: {
          archived: true,
          archivedAt: updated.archivedAt,
          archivedReason: reason,
        },
      });

      return ApiSuccess.ok({ success: true, archived: true });
    } else if (action === "restore") {
      const oldValues = {
        archived: entry.archived,
        archivedAt: entry.archivedAt,
        archivedReason: entry.archivedReason,
      };

      await restoreEntry(params.entryId);

      const { ipAddress, userAgent } = extractRequestInfo(request);
      await createAuditLog({
        action: "restore",
        resourceType: "stream_entry",
        resourceId: params.entryId,
        userEmail: session.user.email,
        spaceId: params.spaceId,
        ipAddress,
        userAgent,
        details: {
          streamId: entry.streamId,
          streamName: entry.stream.name,
          value: entry.value,
        },
        oldValues,
        newValues: {
          archived: false,
          archivedAt: null,
          archivedReason: null,
        },
      });

      return ApiSuccess.ok({ success: true, archived: false });
    }

    return ApiError.badRequest("Invalid action. Use 'archive' or 'restore'.");
  }
);
