import { after } from "next/server";
import {
  getGroup,
  getGroupMembers,
  addGroupMember,
  removeGroupMember,
} from "@/lib/dal/groups";
import { spaceRoute, ApiError, ApiSuccess } from "@/lib/api";
import { auditGroupOperation } from "@/lib/dal/audit";

// GET /api/spaces/[spaceId]/groups/[groupId]/members — list group members
export const GET = spaceRoute<{ groupId: string }>(
  { label: "list group members" },
  async ({ params }) => {
    const group = await getGroup(params.groupId);
    if (!group || group.spaceId !== params.spaceId) {
      return ApiError.notFound("Group");
    }

    const members = await getGroupMembers(params.groupId);
    return ApiSuccess.ok(members);
  }
);

// POST /api/spaces/[spaceId]/groups/[groupId]/members — add a member to a group
export const POST = spaceRoute<{ groupId: string }>(
  { requiredAccess: "admin", label: "add group member" },
  async ({ session, params, request }) => {
    const group = await getGroup(params.groupId);
    if (!group || group.spaceId !== params.spaceId) {
      return ApiError.notFound("Group");
    }

    const body = await request.json();
    const { userId } = body;

    if (!userId || typeof userId !== "string") {
      return ApiError.badRequest("userId is required");
    }

    try {
      const member = await addGroupMember(params.groupId, userId);

      after(async () => {
        await auditGroupOperation("update", params.groupId, params.spaceId, session.user.email, request, {
          details: { action: "add_member", userId },
          newValues: { memberId: userId },
        });
      });

      return ApiSuccess.created(member);
    } catch (e) {
      if (e instanceof Error && e.message.includes("Unique constraint")) {
        return ApiError.conflict("User is already a member of this group");
      }
      throw e;
    }
  }
);

// DELETE /api/spaces/[spaceId]/groups/[groupId]/members — remove a member from a group
export const DELETE = spaceRoute<{ groupId: string }>(
  { requiredAccess: "admin", label: "remove group member" },
  async ({ session, params, request }) => {
    const group = await getGroup(params.groupId);
    if (!group || group.spaceId !== params.spaceId) {
      return ApiError.notFound("Group");
    }

    const body = await request.json();
    const { userId } = body;

    if (!userId || typeof userId !== "string") {
      return ApiError.badRequest("userId is required");
    }

    const removed = await removeGroupMember(params.groupId, userId);
    if (!removed) {
      return ApiError.notFound("Member");
    }

    after(async () => {
      await auditGroupOperation("delete", params.groupId, params.spaceId, session.user.email, request, {
        details: { action: "remove_member", userId },
        oldValues: { memberId: userId },
      });
    });

    return ApiSuccess.success();
  }
);
