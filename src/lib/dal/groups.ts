/**
 * Group Data Access Layer
 *
 * All group-related database operations for managing access groups
 * within spaces, including group membership management.
 */

import { prisma } from "@/lib/prisma";

/**
 * List all groups for a space, ordered by name.
 */
export async function getSpaceGroups(spaceId: string) {
  return prisma.group.findMany({
    where: { spaceId },
    include: { _count: { select: { members: true } } },
    orderBy: { name: "asc" },
  });
}

/**
 * Get a single group by ID, including members with user details.
 */
export async function getGroup(groupId: string) {
  return prisma.group.findUnique({
    where: { id: groupId },
    include: {
      members: {
        include: {
          user: { select: { id: true, email: true, name: true } },
        },
      },
      _count: { select: { members: true } },
    },
  });
}

/**
 * Create a new group within a space.
 */
export async function createGroup(spaceId: string, name: string) {
  return prisma.group.create({ data: { spaceId, name } });
}

/**
 * Update a group's name.
 */
export async function updateGroup(groupId: string, name: string) {
  return prisma.group.update({ where: { id: groupId }, data: { name } });
}

/**
 * Delete a group. Cascade deletes group members.
 */
export async function deleteGroup(groupId: string) {
  return prisma.group.delete({ where: { id: groupId } });
}

/**
 * Add a user to a group.
 */
export async function addGroupMember(groupId: string, userId: string) {
  return prisma.groupMember.create({ data: { groupId, userId } });
}

/**
 * Remove a user from a group.
 * Returns the deleted member record, or null if the user was not in the group.
 */
export async function removeGroupMember(groupId: string, userId: string) {
  const member = await prisma.groupMember.findFirst({
    where: { groupId, userId },
  });
  if (!member) return null;
  return prisma.groupMember.delete({ where: { id: member.id } });
}

/**
 * Check whether a user is a member of a group.
 */
export async function isUserInGroup(
  groupId: string,
  userId: string
): Promise<boolean> {
  const member = await prisma.groupMember.findFirst({
    where: { groupId, userId },
  });
  return member !== null;
}

/**
 * List all members of a group with user details.
 */
export async function getGroupMembers(groupId: string) {
  return prisma.groupMember.findMany({
    where: { groupId },
    include: {
      user: { select: { id: true, email: true, name: true } },
    },
  });
}
