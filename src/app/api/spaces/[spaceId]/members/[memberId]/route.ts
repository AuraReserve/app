import { after, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { SpaceRole } from "@prisma/client";
import { auditSpaceMemberOperation } from "@/lib/dal/audit";
import { spaceRoute, ApiError, ApiSuccess } from "@/lib/api";

// PATCH /api/spaces/[spaceId]/members/[memberId] - Update member role
export const PATCH = spaceRoute<{ memberId: string }>(
  { requiredAccess: "admin", label: "update member" },
  async ({ session, params, request }) => {
    const body = await request.json();
    const { role } = body;

    if (!role) {
      return ApiError.badRequest("Role is required");
    }

    // Validate role
    const validRoles = ["admin", "auditor", "member"];
    const lowerRole = role.toLowerCase();
    if (!validRoles.includes(lowerRole)) {
      return ApiError.badRequest("Invalid role. Must be 'admin', 'auditor', or 'member'");
    }

    // Get old member data and verify it belongs to this space
    const oldMember = await prisma.spaceUser.findUnique({
      where: { id: params.memberId },
      include: {
        user: {
          select: { email: true, fullName: true },
        },
      },
    });

    if (!oldMember || oldMember.spaceId !== params.spaceId) {
      return NextResponse.json({ error: "Member not found in this space" }, { status: 404 });
    }

    // Convert to Prisma enum (uppercase key, @map stores lowercase in DB)
    const roleEnum = lowerRole.toUpperCase() as keyof typeof SpaceRole;

    // Update member role
    const member = await prisma.spaceUser.update({
      where: { id: params.memberId },
      data: {
        role: SpaceRole[roleEnum],
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            fullName: true,
            role: true,
          },
        },
      },
    });

    // Audit log (non-blocking)
    after(async () => {
      if (session.user.email) {
        await auditSpaceMemberOperation("update", params.memberId, params.spaceId, session.user.email, request, {
          details: {
            action: "role_updated",
            member_email: member.user.email,
            member_name: member.user.fullName,
          },
          oldValues: {
            role: oldMember?.role,
          },
          newValues: {
            role: lowerRole,
          },
        });
      }
    });

    return ApiSuccess.ok(member);
  }
);

// DELETE /api/spaces/[spaceId]/members/[memberId] - Remove member from space
export const DELETE = spaceRoute<{ memberId: string }>(
  { requiredAccess: "admin", label: "remove member" },
  async ({ session, params, request }) => {
    // Get member data and verify it belongs to this space
    const memberToDelete = await prisma.spaceUser.findUnique({
      where: { id: params.memberId },
      include: {
        user: {
          select: { id: true, email: true, fullName: true },
        },
      },
    });

    if (!memberToDelete || memberToDelete.spaceId !== params.spaceId) {
      return NextResponse.json({ error: "Member not found in this space" }, { status: 404 });
    }

    // Delete the member
    await prisma.spaceUser.delete({
      where: { id: params.memberId },
    });

    // Audit log (non-blocking)
    after(async () => {
      if (session.user.email && memberToDelete) {
        await auditSpaceMemberOperation("delete", params.memberId, params.spaceId, session.user.email, request, {
          details: {
            action: "member_removed",
            removed_user_email: memberToDelete.user.email,
            removed_user_name: memberToDelete.user.fullName,
          },
          oldValues: {
            user_id: memberToDelete.user.id,
            user_email: memberToDelete.user.email,
            role: memberToDelete.role,
          },
        });
      }
    });

    return ApiSuccess.success();
  }
);
