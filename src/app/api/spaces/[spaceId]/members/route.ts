import { after } from "next/server";
import {
  getSpaceMembers,
  addSpaceMember,
  isUserSpaceMember,
} from "@/lib/dal";
import { auditSpaceMemberOperation } from "@/lib/dal/audit";
import prisma from "@/lib/prisma";
import { spaceRoute, ApiError, ApiSuccess } from "@/lib/api";

// GET /api/spaces/[spaceId]/members - List space members
export const GET = spaceRoute(
  { label: "fetch members" },
  async ({ params }) => {
    const members = await getSpaceMembers(params.spaceId);
    return ApiSuccess.ok(members);
  }
);

// POST /api/spaces/[spaceId]/members - Add member to space by email
export const POST = spaceRoute(
  { requiredAccess: "admin", label: "add member" },
  async ({ session, params, request }) => {
    const body = await request.json();
    const { email, role } = body;

    if (!email || !role) {
      return ApiError.badRequest("email and role are required");
    }

    // Validate role
    const validRoles = ["admin", "auditor", "member"] as const;
    const lowerRole = role.toLowerCase() as (typeof validRoles)[number];
    if (!validRoles.includes(lowerRole)) {
      return ApiError.badRequest("Invalid role. Must be 'admin', 'auditor', or 'member'");
    }

    // Look up user by email
    const targetUser = await prisma.user.findFirst({
      where: { email: email.toLowerCase() },
      select: { id: true, email: true, fullName: true },
    });

    if (!targetUser) {
      return ApiError.notFound("No user found with that email address. The user must have an account first.");
    }

    // Check if user already has access
    const alreadyMember = await isUserSpaceMember(params.spaceId, targetUser.id);
    if (alreadyMember) {
      return ApiError.badRequest("User already has access to this space");
    }

    // Add member using DAL
    const member = await addSpaceMember({
      userId: targetUser.id,
      spaceId: params.spaceId,
      role: lowerRole,
    });

    // Audit log (non-blocking)
    after(async () => {
      if (session.user.email) {
        await auditSpaceMemberOperation("create", member.id, params.spaceId, session.user.email, request, {
          details: {
            action: "member_added",
            added_user_email: targetUser.email,
            added_user_name: targetUser.fullName,
            role: lowerRole,
          },
          newValues: {
            user_id: targetUser.id,
            role: lowerRole,
          },
        });
      }
    });

    return ApiSuccess.ok(member);
  }
);
