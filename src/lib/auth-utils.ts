/**
 * Authentication and Authorization Utilities
 * Helper functions for role-based access control
 */

import { headers } from "next/headers";
import { getExtendedSession, type ExtendedSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Space as SpaceModel } from "@prisma/client";
import { SpaceRole as PrismaSpaceRole } from "@prisma/client";

export type UserRole = "owner" | "admin" | "creator";
export type SpaceRole = "admin" | "auditor" | "member";

/**
 * Get the current authenticated session
 */
export async function getSession(): Promise<ExtendedSession | null> {
  const headersList = await headers();
  return await getExtendedSession(headersList);
}

/**
 * Get the current authenticated user
 * Throws if not authenticated
 */
export async function getCurrentUser() {
  const session = await getSession();

  if (!session?.user) {
    throw new Error("Unauthorized");
  }

  return session.user;
}

/**
 * Check if user has a specific global role
 */
export function hasRole(userRole: string | null | undefined, requiredRole: UserRole): boolean {
  if (!userRole) return false;

  const roleHierarchy: Record<UserRole, number> = {
    owner: 2,
    admin: 1,
    creator: 0,
  };

  return roleHierarchy[userRole as UserRole] >= roleHierarchy[requiredRole];
}

/**
 * Check if user is owner (super admin)
 */
export async function isOwner(): Promise<boolean> {
  const session = await getSession();
  return session?.user?.role === "owner";
}

/**
 * Check if user is admin or owner (async - fetches session)
 */
export async function isAdmin(): Promise<boolean> {
  const session = await getSession();
  return hasRole(session?.user?.role, "admin");
}

/**
 * Check if user is admin or owner (sync - for use with existing role value)
 */
export function isAdminRole(role: string | null | undefined): boolean {
  return hasRole(role, "admin");
}

/**
 * Check if user has access to a specific space
 */
export async function hasSpaceAccess(spaceId: string): Promise<boolean> {
  const session = await getSession();

  if (!session?.user) {
    return false;
  }

  // Owners and Admins have access to all spaces
  if (hasRole(session.user.role, "admin")) {
    return true;
  }

  // Check space membership
  const spaceMember = await prisma.spaceUser.findFirst({
    where: {
      userId: session.user.id,
      spaceId: spaceId,
    },
  });

  return !!spaceMember;
}

/**
 * Check if user is admin of a specific space
 */
export async function isSpaceAdmin(spaceId: string): Promise<boolean> {
  const session = await getSession();

  if (!session?.user) {
    return false;
  }

  // Owners and global Admins are admins of all spaces
  if (hasRole(session.user.role, "admin")) {
    return true;
  }

  // Check if user is space admin
  const spaceMember = await prisma.spaceUser.findFirst({
    where: {
      userId: session.user.id,
      spaceId: spaceId,
      role: PrismaSpaceRole.ADMIN,
    },
  });

  return !!spaceMember;
}

/**
 * Get all spaces the user has access to
 */
export async function getUserSpaces(): Promise<
  Array<{
    spaceId: string;
    role: SpaceRole;
    space: SpaceModel;
  }>
> {
  const session = await getSession();

  if (!session?.user) {
    return [];
  }

  // Owners and Admins see all spaces
  if (hasRole(session.user.role, "admin")) {
    const allSpaces = await prisma.space.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    });

    return allSpaces.map((space) => ({
      spaceId: space.id,
      role: "admin" as SpaceRole,
      space,
    }));
  }

  // Get user's space memberships
  const spaceMembers = await prisma.spaceUser.findMany({
    where: {
      userId: session.user.id,
    },
    include: {
      space: true,
    },
    orderBy: {
      space: {
        name: "asc",
      },
    },
  });

  return spaceMembers.map((sm) => ({
    spaceId: sm.spaceId,
    role: sm.role.toLowerCase() as SpaceRole,
    space: sm.space,
  }));
}

/**
 * Require authentication - throws if not authenticated.
 * When the require_email_verification setting is enabled, also checks
 * that the user's email is verified (throws 403 if not).
 */
export async function requireAuth() {
  const session = await getSession();

  if (!session?.user) {
    throw new Error("Unauthorized");
  }

  // Enforce email verification when the setting is enabled
  if (!session.user.emailVerified) {
    const { getRegistrationSettings } = await import("@/lib/settings");
    const settings = await getRegistrationSettings();
    if (settings.requireEmailVerification) {
      throw new Error("Forbidden: Email verification required");
    }
  }

  return session.user;
}

/**
 * Require specific role - throws if user doesn't have required role
 */
export async function requireRole(role: UserRole) {
  const user = await requireAuth();

  if (!hasRole(user.role, role)) {
    throw new Error("Forbidden: Insufficient permissions");
  }

  return user;
}

/**
 * Require space access - throws if user doesn't have access
 */
export async function requireSpaceAccess(spaceId: string) {
  const user = await requireAuth();
  const hasAccess = await hasSpaceAccess(spaceId);

  if (!hasAccess) {
    throw new Error("Forbidden: No access to this space");
  }

  return user;
}

/**
 * Require space admin - throws if user is not space admin
 */
export async function requireSpaceAdmin(spaceId: string) {
  const user = await requireAuth();
  const isAdmin = await isSpaceAdmin(spaceId);

  if (!isAdmin) {
    throw new Error("Forbidden: Space admin access required");
  }

  return user;
}

/**
 * Get user's space role
 */
export async function getSpaceRole(spaceId: string): Promise<SpaceRole | null> {
  const session = await getSession();

  if (!session?.user) {
    return null;
  }

  // Owners and global Admins are admins of all spaces
  if (hasRole(session.user.role, "admin")) {
    return "admin";
  }

  // Check space membership
  const spaceMember = await prisma.spaceUser.findFirst({
    where: {
      userId: session.user.id,
      spaceId: spaceId,
    },
  });

  return spaceMember ? (spaceMember.role.toLowerCase() as SpaceRole) : null;
}

/**
 * Check if user can submit/edit reserve data in a space
 */
export async function canManageReserves(spaceId: string): Promise<boolean> {
  const role = await getSpaceRole(spaceId);
  return role === "admin" || role === "auditor";
}

/**
 * Check if user can manage API keys in a space
 */
export async function canManageApiKeys(spaceId: string): Promise<boolean> {
  const role = await getSpaceRole(spaceId);
  return role === "admin";
}

/**
 * Check if user can manage space settings
 */
export async function canManageSpaceSettings(spaceId: string): Promise<boolean> {
  const role = await getSpaceRole(spaceId);
  return role === "admin";
}

/**
 * Check if user can manage space members
 */
export async function canManageMembers(spaceId: string): Promise<boolean> {
  const role = await getSpaceRole(spaceId);
  return role === "admin";
}

/**
 * Check if user can manage streams (create/update/delete)
 */
export async function canManageStreams(spaceId: string): Promise<boolean> {
  const role = await getSpaceRole(spaceId);
  return role === "admin";
}

/**
 * Check if user can write entries to a stream
 */
export async function canWriteToStream(spaceId: string): Promise<boolean> {
  const role = await getSpaceRole(spaceId);
  return role === "admin" || role === "auditor";
}

/**
 * Check if user can read stream data
 */
export async function canReadStream(spaceId: string): Promise<boolean> {
  const role = await getSpaceRole(spaceId);
  return role === "admin" || role === "auditor" || role === "member";
}

/**
 * Check if user can manage integrations (install/configure/remove)
 */
export async function canManageIntegrations(spaceId: string): Promise<boolean> {
  const role = await getSpaceRole(spaceId);
  return role === "admin";
}
