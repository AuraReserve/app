/**
 * StreamEntry Data Access Layer
 *
 * All stream entry related database operations.
 */

import { prisma } from "@/lib/prisma";
import type { ArtifactType, Prisma } from "@prisma/client";
import { normalizeArtifactType, toPrismaArtifactType } from "@/lib/artifact-types";

export interface CreateEntryInput {
  artifactType: ArtifactType;
  value?: number | null;
  artifactData?: Prisma.InputJsonValue | null;
  submittedBy: string;
  sourceIntegrationId?: string | null;
  isAutomated?: boolean;
  timestamp?: Date;
  ripcord?: boolean;
  ripcordDetails?: string[];
  notes?: string;
  supportingDocuments?: string[];
  metadata?: Prisma.InputJsonValue;
}

export interface CreateLeafInput {
  leafId: string;
  leafHash: string;
  value?: number | null;
  leafData: Prisma.InputJsonValue;
  leafIndex: number;
}

export interface GetEntriesOptions {
  limit?: number;
  offset?: number;
  from?: Date;
  to?: Date;
}

/**
 * Create a stream entry, validating that the artifactType matches the stream
 */
export async function createEntry(streamId: string, data: CreateEntryInput) {
  const stream = await prisma.dataStream.findUnique({
    where: { id: streamId },
    select: { artifactType: true },
  });

  if (!stream) {
    throw new Error("Stream not found");
  }

  const requestedArtifactType = normalizeArtifactType(data.artifactType);
  const streamArtifactType = normalizeArtifactType(stream.artifactType);
  const requestedPrismaArtifactType = toPrismaArtifactType(data.artifactType);

  if (!requestedArtifactType) {
    throw new Error(`Unknown artifact type: ${data.artifactType}`);
  }

  if (!streamArtifactType) {
    throw new Error(`Unknown stream artifact type: ${stream.artifactType}`);
  }

  if (!requestedPrismaArtifactType) {
    throw new Error(`Unknown artifact type: ${data.artifactType}`);
  }

  if (requestedArtifactType !== streamArtifactType) {
    throw new Error(
      `Artifact type mismatch: stream expects ${stream.artifactType}, got ${data.artifactType}`
    );
  }

  const entry = await prisma.streamEntry.create({
    data: {
      streamId,
      artifactType: requestedPrismaArtifactType,
      value: data.value ?? null,
      artifactData: data.artifactData ?? undefined,
      submittedBy: data.submittedBy,
      sourceIntegrationId: data.sourceIntegrationId ?? null,
      isAutomated: data.isAutomated ?? false,
      timestamp: data.timestamp ?? new Date(),
      ripcord: data.ripcord ?? false,
      ripcordDetails: data.ripcordDetails ?? [],
      notes: data.notes ?? "",
      supportingDocuments: data.supportingDocuments ?? [],
      metadata: data.metadata ?? {},
    },
  });

  // Trigger on-change outputs (fire and forget)
  try {
    const { runOnChangeOutputs } = await import("@/lib/integrations/runner");
    const stream = await prisma.dataStream.findUnique({
      where: { id: streamId },
      select: { spaceId: true },
    });
    if (stream) {
      runOnChangeOutputs(stream.spaceId, streamId).catch((err) =>
        console.warn("[OnChange] Failed to enqueue outputs:", err)
      );
    }
  } catch (err) {
    console.warn("[OnChange] Failed to trigger on-change outputs:", err);
  }

  return entry;
}

/**
 * Get an entry by ID with optional leaves
 */
export async function getEntry(entryId: string, includeLeaves = false) {
  return prisma.streamEntry.findUnique({
    where: { id: entryId },
    include: {
      leaves: includeLeaves,
      stream: {
        select: { id: true, name: true, slug: true, spaceId: true },
      },
    },
  });
}

/**
 * Get the most recent entry for a stream
 */
export async function getLatestEntry(streamId: string) {
  return prisma.streamEntry.findFirst({
    where: { streamId },
    orderBy: { timestamp: "desc" },
    include: {
      leaves: { take: 0 },
    },
  });
}

/**
 * Get paginated entries for a stream, optionally filtered by date range
 */
export async function getEntries(streamId: string, options: GetEntriesOptions = {}) {
  const { limit = 50, offset = 0, from, to } = options;

  const where: Prisma.StreamEntryWhereInput = { streamId };

  if (from || to) {
    where.timestamp = {};
    if (from) where.timestamp.gte = from;
    if (to) where.timestamp.lte = to;
  }

  const [entries, total] = await Promise.all([
    prisma.streamEntry.findMany({
      where,
      orderBy: { timestamp: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.streamEntry.count({ where }),
  ]);

  return { entries, total, limit, offset };
}

/**
 * Get the latest entry for each stream in a space (for dashboard overview)
 */
export async function getLatestEntriesForSpace(spaceId: string) {
  const streams = await prisma.dataStream.findMany({
    where: { spaceId, isActive: true },
    select: {
      id: true,
      name: true,
      slug: true,
      artifactType: true,
      assetType: true,
      unit: true,
      entries: {
        orderBy: { timestamp: "desc" },
        take: 1,
        select: {
          id: true,
          value: true,
          artifactData: true,
          timestamp: true,
          ripcord: true,
          ripcordDetails: true,
        },
      },
    },
  });

  return streams.map((stream) => ({
    streamId: stream.id,
    streamName: stream.name,
    streamSlug: stream.slug,
    artifactType: stream.artifactType,
    assetType: stream.assetType,
    unit: stream.unit,
    latestEntry: stream.entries[0] ?? null,
  }));
}

/**
 * Get recent entries across all streams in a space (for activity feed).
 * Includes stream info and submitter name.
 */
export async function getRecentEntriesForSpace(
  spaceId: string,
  options: { limit?: number; streamId?: string } = {}
) {
  const { limit = 20, streamId } = options;

  return prisma.streamEntry.findMany({
    where: {
      stream: { spaceId },
      ...(streamId ? { streamId } : {}),
    },
    orderBy: { timestamp: "desc" },
    take: limit,
    select: {
      id: true,
      artifactType: true,
      value: true,
      artifactData: true,
      timestamp: true,
      createdDate: true,
      ripcord: true,
      isAutomated: true,
      notes: true,
      submittedBy: true,
      archived: true,
      archivedAt: true,
      archivedReason: true,
      submitter: {
        select: { name: true, email: true },
      },
      stream: {
        select: { id: true, name: true, slug: true, artifactType: true, unit: true },
      },
      sourceIntegration: {
        select: {
          integration: { select: { displayName: true, key: true } },
        },
      },
    },
  });
}

/**
 * Atomically create a stream entry with its merkle leaves
 */
export async function createEntryWithLeaves(
  streamId: string,
  data: CreateEntryInput,
  leaves: CreateLeafInput[]
) {
  const stream = await prisma.dataStream.findUnique({
    where: { id: streamId },
    select: { artifactType: true },
  });

  if (!stream) {
    throw new Error("Stream not found");
  }

  const requestedArtifactType = normalizeArtifactType(data.artifactType);
  const streamArtifactType = normalizeArtifactType(stream.artifactType);
  const requestedPrismaArtifactType = toPrismaArtifactType(data.artifactType);

  if (!requestedArtifactType) {
    throw new Error(`Unknown artifact type: ${data.artifactType}`);
  }

  if (!streamArtifactType) {
    throw new Error(`Unknown stream artifact type: ${stream.artifactType}`);
  }

  if (!requestedPrismaArtifactType) {
    throw new Error(`Unknown artifact type: ${data.artifactType}`);
  }

  if (requestedArtifactType !== streamArtifactType) {
    throw new Error(
      `Artifact type mismatch: stream expects ${stream.artifactType}, got ${data.artifactType}`
    );
  }

  return prisma.$transaction(async (tx) => {
    const entry = await tx.streamEntry.create({
      data: {
        streamId,
        artifactType: requestedPrismaArtifactType,
        value: data.value ?? null,
        artifactData: data.artifactData ?? undefined,
        submittedBy: data.submittedBy,
        sourceIntegrationId: data.sourceIntegrationId ?? null,
        isAutomated: data.isAutomated ?? false,
        timestamp: data.timestamp ?? new Date(),
        ripcord: data.ripcord ?? false,
        ripcordDetails: data.ripcordDetails ?? [],
        notes: data.notes ?? "",
        supportingDocuments: data.supportingDocuments ?? [],
        metadata: data.metadata ?? {},
      },
    });

    if (leaves.length > 0) {
      await tx.streamEntryLeaf.createMany({
        data: leaves.map((leaf) => ({
          entryId: entry.id,
          leafId: leaf.leafId,
          leafHash: leaf.leafHash,
          value: leaf.value ?? null,
          leafData: leaf.leafData,
          leafIndex: leaf.leafIndex,
        })),
      });
    }

    return tx.streamEntry.findUniqueOrThrow({
      where: { id: entry.id },
      include: { leaves: true },
    });
  });
}

/**
 * Get entries for a specific stream with submitter and integration details.
 * Used by reserves page and dashboard stream tabs.
 */
export async function getStreamEntriesWithDetails(
  streamId: string,
  options: { limit?: number; offset?: number } = {}
) {
  const { limit = 50, offset = 0 } = options;

  return prisma.streamEntry.findMany({
    where: { streamId },
    orderBy: { timestamp: "desc" },
    take: limit,
    skip: offset,
    select: {
      id: true,
      artifactType: true,
      value: true,
      artifactData: true,
      timestamp: true,
      createdDate: true,
      ripcord: true,
      ripcordDetails: true,
      isAutomated: true,
      notes: true,
      submittedBy: true,
      archived: true,
      archivedAt: true,
      archivedReason: true,
      submitter: {
        select: { name: true, email: true },
      },
      stream: {
        select: { id: true, name: true, slug: true, artifactType: true, unit: true },
      },
      sourceIntegration: {
        select: {
          integration: { select: { displayName: true, key: true } },
        },
      },
    },
  });
}

/**
 * Archive a stream entry. Sets archived flag, timestamp, and reason.
 */
export async function archiveEntry(entryId: string, reason: string) {
  return prisma.streamEntry.update({
    where: { id: entryId },
    data: {
      archived: true,
      archivedAt: new Date(),
      archivedReason: reason,
    },
  });
}

/**
 * Restore (unarchive) a stream entry.
 */
export async function restoreEntry(entryId: string) {
  return prisma.streamEntry.update({
    where: { id: entryId },
    data: {
      archived: false,
      archivedAt: null,
      archivedReason: null,
    },
  });
}

/**
 * Get all entry snapshots for a stream (for verification page dropdown).
 * Returns lightweight records: id, timestamp, merkle root.
 */
export async function getSnapshots(
  streamId: string,
  limit = 50,
): Promise<Array<{ id: string; timestamp: Date; merkleRoot: string | null; leafCount: number }>> {
  const entries = await prisma.streamEntry.findMany({
    where: { streamId },
    orderBy: { timestamp: "desc" },
    take: limit,
    select: {
      id: true,
      timestamp: true,
      artifactData: true,
      _count: { select: { leaves: true } },
    },
  });

  return entries.map((e) => {
    const ad = e.artifactData as Record<string, unknown> | null;
    return {
      id: e.id,
      timestamp: e.timestamp,
      merkleRoot: (ad?.merkleRoot as string) ?? null,
      leafCount: e._count.leaves,
    };
  });
}

/**
 * Find an entry by its merkle root hash within a stream.
 */
export async function getEntryByMerkleRoot(
  streamId: string,
  merkleRoot: string,
): Promise<{ id: string; timestamp: Date } | null> {
  const entry = await prisma.streamEntry.findFirst({
    where: {
      streamId,
      artifactData: { path: ["merkleRoot"], equals: merkleRoot },
    },
    orderBy: { timestamp: "desc" },
    select: { id: true, timestamp: true },
  });

  return entry;
}
