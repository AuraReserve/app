import { getStore, updateStore, deleteStore, auditDataStoreOperation } from "@/lib/dal";
import { spaceRoute, ApiError, ApiSuccess } from "@/lib/api";

// GET /api/spaces/[spaceId]/stores/[streamId] — get store details
export const GET = spaceRoute<{ streamId: string }>(
  { label: "fetch store" },
  async ({ params }) => {
    const stream = await getStore(params.streamId);
    if (!stream || stream.spaceId !== params.spaceId) {
      return ApiError.notFound("Stream");
    }
    return ApiSuccess.ok(stream);
  }
);

// PATCH /api/spaces/[spaceId]/stores/[streamId] — update store
export const PATCH = spaceRoute<{ streamId: string }>(
  { requiredAccess: "admin", label: "update store" },
  async ({ session, params, request }) => {
    const existing = await getStore(params.streamId);
    if (!existing || existing.spaceId !== params.spaceId) {
      return ApiError.notFound("Stream");
    }

    const body = await request.json();
    const updates: Record<string, unknown> = {};

    if (body.name !== undefined) {
      if (typeof body.name !== "string" || !body.name.trim()) {
        return ApiError.badRequest("name must be a non-empty string");
      }
      updates.name = body.name.trim();
    }

    if (body.description !== undefined) {
      updates.description = String(body.description);
    }

    if (body.isActive !== undefined) {
      if (typeof body.isActive !== "boolean") {
        return ApiError.badRequest("isActive must be a boolean");
      }
      updates.isActive = body.isActive;
    }

    if (body.valueField !== undefined) {
      if (body.valueField !== null && (typeof body.valueField !== "string" || !body.valueField.trim())) {
        return ApiError.badRequest("valueField must be a non-empty string or null");
      }
      updates.valueField = body.valueField ? body.valueField.trim() : null;
    }

    if (Object.keys(updates).length === 0) {
      return ApiError.badRequest("No valid fields to update");
    }

    const updated = await updateStore(params.streamId, updates);

    await auditDataStoreOperation("update", params.streamId, params.spaceId, session.user.email, request, {
      oldValues: { name: existing.name, description: existing.description, isActive: existing.isActive },
      newValues: updates,
    });

    return ApiSuccess.ok(updated);
  }
);

// DELETE /api/spaces/[spaceId]/stores/[streamId] — delete store
export const DELETE = spaceRoute<{ streamId: string }>(
  { requiredAccess: "admin", label: "delete store" },
  async ({ session, params, request }) => {
    const existing = await getStore(params.streamId);
    if (!existing || existing.spaceId !== params.spaceId) {
      return ApiError.notFound("Stream");
    }

    try {
      await deleteStore(params.streamId);
    } catch (error) {
      if (error instanceof Error && error.message.includes("Cannot delete")) {
        return ApiError.conflict(error.message);
      }
      throw error;
    }

    await auditDataStoreOperation("delete", params.streamId, params.spaceId, session.user.email, request, {
      oldValues: { name: existing.name, slug: existing.slug, artifactType: existing.artifactType },
    });

    return ApiSuccess.success();
  }
);
