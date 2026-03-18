/**
 * Data Output Data Access Layer
 *
 * Manages creating and querying SpaceIntegrations with direction=OUTPUT.
 * Unlike data inputs, outputs typically link to an existing stream
 * and do not auto-create streams. Some integrations (e.g. api-serve-all)
 * operate without a specific stream.
 */

import { prisma } from "@/lib/prisma";
import { syncRepeatableJob } from "@/lib/queue/sync";
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

// Workaround for Prisma 7 @map enum bug (prisma/prisma#28894):
// Runtime enum values are mapped strings ("active") but the query engine
// expects unmapped Prisma names ("ACTIVE"). Use these constants in queries.
const DIRECTION_OUTPUT = "OUTPUT" as unknown as IntegrationDirection;
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

export interface CreateDataOutputParams {
  spaceId: string;
  integrationKey: string;
  streamId?: string;
  trigger?: string;
  schedule?: string;
  config?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

/**
 * Create a data output by configuring an integration as an OUTPUT destination
 * on an existing stream.
 *
 * @throws NotFoundError if the integration key or stream is not found
 * @throws ValidationError if the integration does not support output
 * @throws EntitlementError if the space lacks an entitlement for a paid integration
 */
export async function createDataOutput(params: CreateDataOutputParams) {
  const { spaceId, integrationKey, streamId, trigger, schedule, config } =
    params;

  // 1. Look up integration
  const integration = await prisma.integration.findUnique({
    where: { key: integrationKey },
  });
  if (!integration) {
    throw new NotFoundError(`Integration not found: ${integrationKey}`);
  }
  if (!integration.supportsOutput) {
    throw new ValidationError(
      `Integration '${integrationKey}' does not support output`
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

  // 3. Verify stream exists (unless this is a stream-less integration like api-serve-all)
  let resolvedStreamId: string | null = streamId ?? null;
  if (streamId) {
    const stream = await prisma.dataStream.findFirst({
      where: { id: streamId, spaceId },
    });
    if (!stream) {
      throw new NotFoundError("Stream not found in this space");
    }
    resolvedStreamId = stream.id;
  } else if (integrationKey !== "api-serve-all") {
    throw new ValidationError("streamId is required for this integration type");
  }

  // 4. Create the output integration
  const triggerKey = (trigger ?? "manual").toLowerCase();
  const triggerValue = TRIGGER_MAP[triggerKey] ?? TRIGGER_MAP.manual;

  const spaceIntegration = await prisma.spaceIntegration.create({
    data: {
      spaceId,
      integrationId: integration.id,
      streamId: resolvedStreamId,
      direction: DIRECTION_OUTPUT,
      status: STATUS_ACTIVE,
      trigger: triggerValue,
      schedule: schedule || null,
      config: (config ?? {}) as never,
    },
    include: {
      integration: true,
      stream: true,
    },
  });

  try {
    await syncRepeatableJob(spaceIntegration.id);
  } catch (err) {
    console.warn("[Queue] Failed to sync repeatable job:", err);
  }
  return spaceIntegration;
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

/**
 * List all data outputs (OUTPUT-direction space integrations) for a space,
 * with recent run logs.
 */
export async function listDataOutputs(spaceId: string) {
  return prisma.spaceIntegration.findMany({
    where: { spaceId, direction: DIRECTION_OUTPUT },
    include: {
      integration: true,
      stream: true,
      runLogs: { take: 5, orderBy: { createdDate: "desc" } },
    },
    orderBy: { createdDate: "desc" },
  });
}

// ---------------------------------------------------------------------------
// Get
// ---------------------------------------------------------------------------

/**
 * Get a single data output by its SpaceIntegration ID.
 */
export async function getDataOutput(integrationId: string) {
  return prisma.spaceIntegration.findUnique({
    where: { id: integrationId },
    include: {
      integration: true,
      stream: true,
      runLogs: { take: 10, orderBy: { createdDate: "desc" } },
    },
  });
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

export interface UpdateDataOutputParams {
  config?: Record<string, unknown>;
  trigger?: string;
  schedule?: string;
  status?: string;
}

/**
 * Update a data output's config, trigger, schedule, or status.
 *
 * @throws NotFoundError if the integration is not found or doesn't belong to the space
 */
export async function updateDataOutput(
  integrationId: string,
  spaceId: string,
  params: UpdateDataOutputParams
) {
  const existing = await prisma.spaceIntegration.findFirst({
    where: { id: integrationId, spaceId, direction: DIRECTION_OUTPUT },
  });
  if (!existing) {
    throw new NotFoundError("Data output not found in this space");
  }

  const data: Record<string, unknown> = {};

  if (params.config !== undefined) {
    // Merge with existing config so callers can do partial updates
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

  const updated = await prisma.spaceIntegration.update({
    where: { id: integrationId },
    data,
    include: {
      integration: true,
      stream: true,
      runLogs: { take: 5, orderBy: { createdDate: "desc" } },
    },
  });

  if (params.trigger !== undefined || params.schedule !== undefined || params.status !== undefined) {
    try {
      await syncRepeatableJob(integrationId);
    } catch (err) {
      console.warn("[Queue] Failed to sync repeatable job:", err);
    }
  }
  return updated;
}
