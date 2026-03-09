/**
 * DataStream Data Access Layer
 *
 * All data store related database operations.
 */

import { prisma } from "@/lib/prisma";
import type { ArtifactType } from "@prisma/client";
import { requireArtifactType } from "@/lib/artifact-types";

export interface CreateStoreInput {
  spaceId: string;
  name: string;
  slug: string;
  artifactType: ArtifactType;
  assetType?: string | null;
  unit?: string | null;
  description?: string;
  createdBy: string;
}

export interface UpdateStoreInput {
  name?: string;
  description?: string;
  isActive?: boolean;
  valueField?: string | null;
}

/**
 * Create a new data store within a space
 */
export async function createStore(spaceId: string, data: Omit<CreateStoreInput, "spaceId">) {
  const artifactType = requireArtifactType(data.artifactType);

  return prisma.dataStream.create({
    data: {
      spaceId,
      name: data.name,
      slug: data.slug,
      artifactType,
      assetType: data.assetType ?? null,
      unit: data.unit ?? null,
      description: data.description ?? "",
      createdBy: data.createdBy,
    },
  });
}

/**
 * Get a store by ID, including the latest entry
 */
export async function getStore(streamId: string) {
  return prisma.dataStream.findUnique({
    where: { id: streamId },
    include: {
      entries: {
        orderBy: { timestamp: "desc" },
        take: 1,
      },
    },
  });
}

/**
 * List all stores for a space
 */
export async function getSpaceStores(spaceId: string) {
  return prisma.dataStream.findMany({
    where: { spaceId },
    include: {
      entries: {
        orderBy: { timestamp: "desc" },
        take: 1,
        select: {
          id: true,
          value: true,
          timestamp: true,
          ripcord: true,
        },
      },
      _count: {
        select: { entries: true },
      },
    },
    orderBy: { createdDate: "desc" },
  });
}

/**
 * Update a store's name, description, or active status
 */
export async function updateStore(streamId: string, data: UpdateStoreInput) {
  return prisma.dataStream.update({
    where: { id: streamId },
    data,
  });
}

/**
 * Delete a store. Only allowed if the store has no entries.
 * Returns true if deleted, throws if the store has entries.
 */
export async function deleteStore(streamId: string): Promise<boolean> {
  const entryCount = await prisma.streamEntry.count({
    where: { streamId },
  });

  if (entryCount > 0) {
    throw new Error(
      `Cannot delete store with ${entryCount} entries. Deactivate it instead.`
    );
  }

  await prisma.dataStream.delete({
    where: { id: streamId },
  });

  return true;
}

/**
 * Get a store by slug within a space
 */
export async function getStoreBySlug(spaceId: string, slug: string) {
  return prisma.dataStream.findUnique({
    where: {
      spaceId_slug: { spaceId, slug },
    },
    include: {
      entries: {
        orderBy: { timestamp: "desc" },
        take: 1,
      },
    },
  });
}
