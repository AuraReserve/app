/**
 * Space Members Data Access Layer
 *
 * All space member (SpaceUser) related database operations.
 */

import { prisma } from "@/lib/prisma";
import { SpaceRole } from "@prisma/client";

export interface SpaceMember {
  id: string;
  userId: string;
  spaceId: string;
  role: string;
  createdDate: Date;
  user: {
    id: string;
    email: string;
    fullName: string | null;
    name: string;
    role: string | null;
  };
}

export interface CreateSpaceMemberInput {
  userId: string;
  spaceId: string;
  role: "admin" | "auditor" | "member";
}

/**
 * Get all members of a space
 */
export async function getSpaceMembers(spaceId: string): Promise<SpaceMember[]> {
  const members = await prisma.spaceUser.findMany({
    where: { spaceId },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          fullName: true,
          name: true,
          role: true,
        },
      },
    },
    orderBy: { createdDate: "desc" },
  });

  return members.map((m) => ({
    id: m.id,
    userId: m.userId,
    spaceId: m.spaceId,
    role: m.role.toLowerCase(),
    createdDate: m.createdDate,
    user: {
      id: m.user.id,
      email: m.user.email,
      fullName: m.user.fullName,
      name: m.user.name,
      role: m.user.role?.toLowerCase() ?? null,
    },
  }));
}

/**
 * Get a specific space member
 */
export async function getSpaceMember(
  spaceId: string,
  userId: string
): Promise<SpaceMember | null> {
  const member = await prisma.spaceUser.findFirst({
    where: { spaceId, userId },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          fullName: true,
          name: true,
          role: true,
        },
      },
    },
  });

  if (!member) return null;

  return {
    id: member.id,
    userId: member.userId,
    spaceId: member.spaceId,
    role: member.role.toLowerCase(),
    createdDate: member.createdDate,
    user: {
      id: member.user.id,
      email: member.user.email,
      fullName: member.user.fullName,
      name: member.user.name,
      role: member.user.role?.toLowerCase() ?? null,
    },
  };
}

/**
 * Get a space member by ID
 */
export async function getSpaceMemberById(memberId: string): Promise<SpaceMember | null> {
  const member = await prisma.spaceUser.findUnique({
    where: { id: memberId },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          fullName: true,
          name: true,
          role: true,
        },
      },
    },
  });

  if (!member) return null;

  return {
    id: member.id,
    userId: member.userId,
    spaceId: member.spaceId,
    role: member.role.toLowerCase(),
    createdDate: member.createdDate,
    user: {
      id: member.user.id,
      email: member.user.email,
      fullName: member.user.fullName,
      name: member.user.name,
      role: member.user.role?.toLowerCase() ?? null,
    },
  };
}

/**
 * Add a member to a space
 */
export async function addSpaceMember(input: CreateSpaceMemberInput): Promise<SpaceMember> {
  const roleEnum = input.role.toUpperCase() as keyof typeof SpaceRole;

  const member = await prisma.spaceUser.create({
    data: {
      userId: input.userId,
      spaceId: input.spaceId,
      role: SpaceRole[roleEnum],
    },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          fullName: true,
          name: true,
          role: true,
        },
      },
    },
  });

  return {
    id: member.id,
    userId: member.userId,
    spaceId: member.spaceId,
    role: member.role.toLowerCase(),
    createdDate: member.createdDate,
    user: {
      id: member.user.id,
      email: member.user.email,
      fullName: member.user.fullName,
      name: member.user.name,
      role: member.user.role?.toLowerCase() ?? null,
    },
  };
}

/**
 * Update a space member's role
 */
export async function updateSpaceMemberRole(
  memberId: string,
  role: "admin" | "auditor" | "member"
): Promise<SpaceMember | null> {
  const roleEnum = role.toUpperCase() as keyof typeof SpaceRole;

  try {
    const member = await prisma.spaceUser.update({
      where: { id: memberId },
      data: { role: SpaceRole[roleEnum] },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            fullName: true,
            name: true,
            role: true,
          },
        },
      },
    });

    return {
      id: member.id,
      userId: member.userId,
      spaceId: member.spaceId,
      role: member.role.toLowerCase(),
      createdDate: member.createdDate,
      user: {
        id: member.user.id,
        email: member.user.email,
        fullName: member.user.fullName,
        name: member.user.name,
        role: member.user.role?.toLowerCase() ?? null,
      },
    };
  } catch {
    return null;
  }
}

/**
 * Remove a member from a space
 */
export async function removeSpaceMember(memberId: string): Promise<boolean> {
  try {
    await prisma.spaceUser.delete({
      where: { id: memberId },
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a user is already a member of a space
 */
export async function isUserSpaceMember(spaceId: string, userId: string): Promise<boolean> {
  const member = await prisma.spaceUser.findFirst({
    where: { spaceId, userId },
    select: { id: true },
  });
  return !!member;
}

/**
 * Get user's spaces with their roles
 */
export async function getUserSpaceMemberships(userId: string): Promise<
  Array<{
    spaceId: string;
    role: string;
    space: {
      id: string;
      name: string;
      slug: string;
    };
  }>
> {
  const memberships = await prisma.spaceUser.findMany({
    where: { userId },
    include: {
      space: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
    },
  });

  return memberships.map((m) => ({
    spaceId: m.spaceId,
    role: m.role.toLowerCase(),
    space: m.space,
  }));
}
