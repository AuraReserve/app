import { after } from "next/server";
import { getGroup, updateGroup, deleteGroup } from "@/lib/dal/groups";
import { spaceRoute, ApiError, ApiSuccess } from "@/lib/api";
import { auditGroupOperation } from "@/lib/dal/audit";

// GET /api/spaces/[spaceId]/groups/[groupId] — get a single group with members
export const GET = spaceRoute<{ groupId: string }>(
  { label: "get group" },
  async ({ params }) => {
    const group = await getGroup(params.groupId);
    if (!group || group.spaceId !== params.spaceId) {
      return ApiError.notFound("Group");
    }
    return ApiSuccess.ok(group);
  }
);

// PATCH /api/spaces/[spaceId]/groups/[groupId] — update group name
export const PATCH = spaceRoute<{ groupId: string }>(
  { requiredAccess: "admin", label: "update group" },
  async ({ session, params, request }) => {
    const existing = await getGroup(params.groupId);
    if (!existing || existing.spaceId !== params.spaceId) {
      return ApiError.notFound("Group");
    }

    const body = await request.json();
    const { name } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return ApiError.badRequest("name is required");
    }

    const group = await updateGroup(params.groupId, name.trim());

    after(async () => {
      await auditGroupOperation("update", params.groupId, params.spaceId, session.user.email, request, {
        oldValues: { name: existing.name },
        newValues: { name: group.name },
      });
    });

    return ApiSuccess.ok(group);
  }
);

// DELETE /api/spaces/[spaceId]/groups/[groupId] — delete a group
export const DELETE = spaceRoute<{ groupId: string }>(
  { requiredAccess: "admin", label: "delete group" },
  async ({ session, params, request }) => {
    const existing = await getGroup(params.groupId);
    if (!existing || existing.spaceId !== params.spaceId) {
      return ApiError.notFound("Group");
    }

    await deleteGroup(params.groupId);

    after(async () => {
      await auditGroupOperation("delete", params.groupId, params.spaceId, session.user.email, request, {
        oldValues: { name: existing.name },
      });
    });

    return ApiSuccess.success();
  }
);
