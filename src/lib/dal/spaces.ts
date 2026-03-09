/**
 * Space Data Access Layer
 *
 * All space-related database operations go through this module.
 */

import { prisma } from "@/lib/prisma";
import type { Space } from "@prisma/client";

export interface SpaceAccessCheck {
  hasAccess: boolean;
  isAdmin: boolean;
  isCreator: boolean;
  role: string | null;
}

/**
 * Check if a user has access to a space and their permission level
 */
export async function checkSpaceAccess(
  spaceId: string,
  userId: string,
  userRole: string | null
): Promise<SpaceAccessCheck> {
  // Platform admins have full access to all spaces
  if (userRole === "owner" || userRole === "admin") {
    return {
      hasAccess: true,
      isAdmin: true,
      isCreator: false,
      role: "admin",
    };
  }

  // Check space membership and creator status
  const space = await prisma.space.findFirst({
    where: {
      id: spaceId,
      OR: [
        { createdBy: userId },
        { spaceUsers: { some: { userId } } },
      ],
    },
    include: {
      spaceUsers: {
        where: { userId },
        select: { role: true },
      },
    },
  });

  if (!space) {
    return {
      hasAccess: false,
      isAdmin: false,
      isCreator: false,
      role: null,
    };
  }

  const isCreator = space.createdBy === userId;
  const spaceRole = space.spaceUsers[0]?.role?.toLowerCase() || null;
  const isAdmin = isCreator || spaceRole === "admin";

  return {
    hasAccess: true,
    isAdmin,
    isCreator,
    role: isCreator ? "admin" : spaceRole,
  };
}

/**
 * Get a space by ID with access check
 */
export async function getSpaceById(spaceId: string): Promise<Space | null> {
  return prisma.space.findUnique({
    where: { id: spaceId },
  });
}

/**
 * Get a space by slug
 */
export async function getSpaceBySlug(slug: string): Promise<Space | null> {
  return prisma.space.findUnique({
    where: { slug },
  });
}

/**
 * Get a space by API identifier (slug or custom)
 */
export async function getSpaceByApiIdentifier(identifier: string): Promise<Space | null> {
  return prisma.space.findFirst({
    where: {
      OR: [
        { slug: identifier },
        { apiIdentifier: identifier },
      ],
    },
  });
}

/**
 * Get an active space by API identifier for public API access
 */
export async function getActiveSpaceByApiIdentifier(
  identifier: string
): Promise<{
  id: string;
  name: string;
} | null> {
  return prisma.space.findFirst({
    where: {
      apiIdentifier: identifier,
      isActive: true,
    },
    select: {
      id: true,
      name: true,
    },
  });
}

/**
 * Get all spaces a user has access to
 */
export async function getUserAccessibleSpaces(
  userId: string,
  userRole: string | null
): Promise<Space[]> {
  // Platform admins see all active spaces
  if (userRole === "owner" || userRole === "admin") {
    return prisma.space.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    });
  }

  // Regular users see spaces they created or are members of
  return prisma.space.findMany({
    where: {
      isActive: true,
      OR: [
        { createdBy: userId },
        { spaceUsers: { some: { userId } } },
      ],
    },
    orderBy: { name: "asc" },
  });
}

/**
 * Get space IDs a user has access to (for filtering queries)
 */
export async function getUserAccessibleSpaceIds(
  userId: string,
  userRole: string | null
): Promise<string[]> {
  const spaces = await getUserAccessibleSpaces(userId, userRole);
  return spaces.map((s) => s.id);
}
