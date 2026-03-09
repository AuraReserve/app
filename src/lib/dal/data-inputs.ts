/**
 * Data Input Data Access Layer
 *
 * Orchestrates creating a DataStream + SpaceIntegration (direction=INPUT)
 * atomically. Handles entitlement checks, artifact type validation, and
 * optional stream auto-creation.
 */

import { prisma } from "@/lib/prisma";
import {
  NotFoundError,
  ValidationError,
  EntitlementError,
} from "@/lib/errors";
import type {
  IntegrationDirection,
  IntegrationStatus,
  IntegrationTrigger,
  EntitlementStatus,
} from "@prisma/client";
import { isMerkleArtifactType, toPrismaArtifactType } from "@/lib/artifact-types";

// Workaround for Prisma 7 @map enum bug (prisma/prisma#28894):
// Runtime enum values are mapped strings ("active") but the query engine
// expects unmapped Prisma names ("ACTIVE"). Use these constants in queries.
const DIRECTION_INPUT = "INPUT" as unknown as IntegrationDirection;
const STATUS_ACTIVE = "ACTIVE" as unknown as IntegrationStatus;
const ENTITLEMENT_ACTIVE = "ACTIVE" as unknown as EntitlementStatus;
const TRIGGER_MAP: Record<string, IntegrationTrigger> = {
  manual: "MANUAL" as unknown as IntegrationTrigger,
  cron: "CRON" as unknown as IntegrationTrigger,
  on_change: "ON_CHANGE" as unknown as IntegrationTrigger,
};

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface CreateDataInputParams {
  spaceId: string;
  userId: string;
  integrationKey: string;
  name: string;
  artifactType: string;
  assetType?: string;
  unit?: string;
  valueField?: string;
  existingStreamId?: string;
  accessGroupId?: string;
  trigger?: string;
  schedule?: string;
  config?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

/**
 * Create a data input by configuring an integration as an INPUT source.
 * Optionally auto-creates a new DataStream if `existingStreamId` is not provided.
 *
 * @throws NotFoundError if the integration key is not found
 * @throws ValidationError if the integration does not support input or the artifact type is invalid
 * @throws EntitlementError if the space lacks an entitlement for a paid integration
 */
export async function createDataInput(params: CreateDataInputParams) {
  const {
    spaceId,
    userId,
    integrationKey,
    name,
    artifactType,
    assetType,
    unit,
    valueField,
    existingStreamId,
    accessGroupId,
    trigger,
    schedule,
    config,
  } = params;

  // 1. Look up integration
  const integration = await prisma.integration.findUnique({
    where: { key: integrationKey },
  });
  if (!integration) {
    throw new NotFoundError(`Integration not found: ${integrationKey}`);
  }
  if (!integration.supportsInput) {
    throw new ValidationError(
      `Integration '${integrationKey}' does not support input`
    );
  }

  // 2. Check entitlement for non-free integrations
  if (!integration.isFree) {
    const entitlement = await prisma.integrationEntitlement.findUnique({
      where: {
        spaceId_integrationKey: { spaceId, integrationKey },
      },
    });
    if (!entitlement || entitlement.status !== ENTITLEMENT_ACTIVE) {
      throw new EntitlementError(
        `Space does not have entitlement for '${integrationKey}'`
      );
    }
  }

  // 3. Validate artifactType
  const prismaArtifactType = toPrismaArtifactType(artifactType);
  if (!prismaArtifactType) {
    throw new ValidationError(`Invalid artifact type: ${artifactType}`);
  }

  // 4. Validate valueField for merkle types
  if (isMerkleArtifactType(artifactType) && !valueField) {
    throw new ValidationError(
      "valueField is required for merkle artifact types"
    );
  }

  // 5. Create atomically
  return prisma.$transaction(async (tx) => {
    let streamId = existingStreamId;

    if (!streamId) {
      const slug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      const stream = await tx.dataStream.create({
        data: {
          spaceId,
          name,
          slug,
          artifactType: prismaArtifactType,
          assetType: assetType || null,
          unit: unit || null,
          valueField: valueField || null,
          createdBy: userId,
        },
      });
      streamId = stream.id;
    }

    const triggerKey = (trigger ?? "manual").toLowerCase();
    const triggerValue = TRIGGER_MAP[triggerKey] ?? TRIGGER_MAP.manual;

    const spaceIntegration = await tx.spaceIntegration.create({
      data: {
        spaceId,
        integrationId: integration.id,
        streamId,
        direction: DIRECTION_INPUT,
        status: STATUS_ACTIVE,
        accessGroupId: accessGroupId || null,
        trigger: triggerValue,
        schedule: schedule || null,
        config: (config ?? {}) as never,
      },
      include: {
        integration: true,
        stream: true,
        accessGroup: true,
      },
    });

    return spaceIntegration;
  });
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

/**
 * List all data inputs (INPUT-direction space integrations) for a space,
 * with the latest stream entry and entry count.
 */
export async function listDataInputs(spaceId: string) {
  return prisma.spaceIntegration.findMany({
    where: { spaceId, direction: DIRECTION_INPUT },
    include: {
      integration: true,
      stream: {
        include: {
          entries: { take: 1, orderBy: { timestamp: "desc" } },
          _count: { select: { entries: true } },
        },
      },
      accessGroup: true,
    },
    orderBy: { createdDate: "desc" },
  });
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

export interface UpdateDataInputParams {
  config?: Record<string, unknown>;
  trigger?: string;
  schedule?: string;
  status?: string;
}

/**
 * Update a data input's config, trigger, schedule, or status.
 */
export async function updateDataInput(
  integrationId: string,
  spaceId: string,
  params: UpdateDataInputParams
) {
  const existing = await prisma.spaceIntegration.findFirst({
    where: { id: integrationId, spaceId, direction: DIRECTION_INPUT },
  });
  if (!existing) {
    throw new NotFoundError("Data input not found in this space");
  }

  const data: Record<string, unknown> = {};

  if (params.config !== undefined) {
    const existingConfig =
      (existing.config as Record<string, unknown>) ?? {};
    data.config = { ...existingConfig, ...params.config } as never;
  }

  if (params.trigger !== undefined) {
    const triggerKey = params.trigger.toLowerCase();
    data.trigger = TRIGGER_MAP[triggerKey] ?? TRIGGER_MAP.manual;
  }

  if (params.schedule !== undefined) {
    data.schedule = params.schedule || null;
  }

  if (params.status !== undefined) {
    data.status =
      params.status.toLowerCase() === "active"
        ? STATUS_ACTIVE
        : ("INACTIVE" as unknown as IntegrationStatus);
  }

  return prisma.spaceIntegration.update({
    where: { id: integrationId },
    data,
    include: {
      integration: true,
      stream: {
        include: {
          entries: { take: 1, orderBy: { timestamp: "desc" } },
          _count: { select: { entries: true } },
        },
      },
      accessGroup: true,
    },
  });
}

// ---------------------------------------------------------------------------
// Get
// ---------------------------------------------------------------------------

/**
 * Get a single data input by its SpaceIntegration ID.
 */
export async function getDataInput(integrationId: string) {
  return prisma.spaceIntegration.findUnique({
    where: { id: integrationId },
    include: {
      integration: true,
      stream: {
        include: {
          entries: { take: 1, orderBy: { timestamp: "desc" } },
          _count: { select: { entries: true } },
        },
      },
      accessGroup: true,
    },
  });
}
