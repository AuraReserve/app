import { after } from "next/server";
import { getSpaceGroups, createGroup } from "@/lib/dal/groups";
import { spaceRoute, ApiError, ApiSuccess } from "@/lib/api";
import { auditGroupOperation } from "@/lib/dal/audit";

// GET /api/spaces/[spaceId]/groups — list all groups for a space
export const GET = spaceRoute(
  { label: "list groups" },
  async ({ params }) => {
    const groups = await getSpaceGroups(params.spaceId);
    return ApiSuccess.ok(groups);
  }
);

// POST /api/spaces/[spaceId]/groups — create a new group
export const POST = spaceRoute(
  { requiredAccess: "admin", label: "create group" },
  async ({ session, params, request }) => {
    const body = await request.json();
    const { name } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return ApiError.badRequest("name is required");
    }

    const group = await createGroup(params.spaceId, name.trim());

    after(async () => {
      await auditGroupOperation("create", group.id, params.spaceId, session.user.email, request, {
        newValues: { name: group.name },
      });
    });

    return ApiSuccess.created(group);
  }
);
