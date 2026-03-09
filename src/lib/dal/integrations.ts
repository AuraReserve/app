/**
 * Integration Data Access Layer
 *
 * All integration-related database operations, replacing the old plugin DAL.
 * Covers: Integration catalog, SpaceIntegration (configured sources/destinations),
 * IntegrationRunLog (execution history), and IntegrationEntitlement (paid access).
 */

import { prisma } from "@/lib/prisma";
import {
  defaultIntegrations,
  freeIntegrationKeys,
} from "@/lib/integrations/default-integrations";
import { toPrismaArtifactType } from "@/lib/artifact-types";
import type {
  ArtifactType,
  IntegrationDirection,
  EntitlementStatus,
  IntegrationStatus,
  IntegrationTrigger,
} from "@prisma/client";

// Workaround for Prisma 7 @map enum bug (prisma/prisma#28894):
// Runtime enum values are mapped strings ("active") but the query engine
// expects unmapped Prisma names ("ACTIVE"). Use these constants in queries.
const ENTITLEMENT_ACTIVE = "ACTIVE" as unknown as EntitlementStatus;
const STATUS_ACTIVE = "ACTIVE" as unknown as IntegrationStatus;
const _STATUS_INACTIVE = "INACTIVE" as unknown as IntegrationStatus;
const DIRECTION_INPUT = "INPUT" as unknown as IntegrationDirection;
const DIRECTION_OUTPUT = "OUTPUT" as unknown as IntegrationDirection;
const _TRIGGER_MANUAL = "MANUAL" as unknown as IntegrationTrigger;
const TRIGGER_MAP: Record<string, IntegrationTrigger> = {
  manual: "MANUAL" as unknown as IntegrationTrigger,
  cron: "CRON" as unknown as IntegrationTrigger,
  on_change: "ON_CHANGE" as unknown as IntegrationTrigger,
};

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface InstallSpaceIntegrationInput {
  integrationId: string;
  streamId: string;
  direction: IntegrationDirection;
  config?: Record<string, unknown>;
  schedule?: string | null;
  trigger?: IntegrationTrigger;
}

export interface UpdateSpaceIntegrationInput {
  config?: Record<string, unknown>;
  schedule?: string | null;
  trigger?: IntegrationTrigger;
  status?: IntegrationStatus;
}

export interface CreateRunLogInput {
  status: string;
  message?: string;
  requestPayload?: unknown;
  responsePayload?: unknown;
  durationMs?: number;
}

// ---------------------------------------------------------------------------
// Integration Catalog
// ---------------------------------------------------------------------------

/**
 * Upsert all default integrations from the catalog into the database.
 * Returns the number of integrations upserted.
 */
export async function ensureIntegrationsSeeded(): Promise<number> {
  let count = 0;

  for (const def of defaultIntegrations) {
    await prisma.integration.upsert({
      where: { key: def.key },
      update: {
        displayName: def.displayName,
        description: def.description,
        supportsInput: def.supportsInput,
        supportsOutput: def.supportsOutput,
        supportedArtifactTypes: def.supportedArtifactTypes,
        isFree: def.isFree,
        supportedTriggers: def.supportedTriggers,
        configSchema: def.configSchema as never,
        defaultTrigger: def.defaultTrigger,
        defaultSchedule: def.defaultSchedule,
        isAvailableSelfHosted: def.isAvailableSelfHosted,
        bundleKey: def.bundleKey,
      },
      create: {
        key: def.key,
        displayName: def.displayName,
        description: def.description,
        supportsInput: def.supportsInput,
        supportsOutput: def.supportsOutput,
        supportedArtifactTypes: def.supportedArtifactTypes,
        isFree: def.isFree,
        supportedTriggers: def.supportedTriggers,
        configSchema: def.configSchema as never,
        defaultTrigger: def.defaultTrigger,
        defaultSchedule: def.defaultSchedule,
        isAvailableSelfHosted: def.isAvailableSelfHosted,
        bundleKey: def.bundleKey,
      },
    });
    count++;
  }

  return count;
}

/**
 * List all integrations in the catalog with capability flags.
 */
export async function getIntegrationCatalog() {
  return prisma.integration.findMany({
    where: { isActive: true },
    orderBy: [{ isFree: "desc" }, { displayName: "asc" }],
  });
}

// ---------------------------------------------------------------------------
// Available Sources / Destinations (considering entitlements)
// ---------------------------------------------------------------------------

/**
 * Get integrations available as input sources for a space.
 * Includes free integrations and paid ones with active entitlements.
 * Optionally filters by artifact type.
 */
export async function getAvailableInputSources(
  spaceId: string,
  artifactType?: ArtifactType
) {
  const normalizedArtifactType = toPrismaArtifactType(artifactType);
  const entitlements = await prisma.integrationEntitlement.findMany({
    where: { spaceId, status: ENTITLEMENT_ACTIVE },
    select: { integrationKey: true },
  });
  const entitledKeys = entitlements.map((e) => e.integrationKey);
  const allowedKeys = [...freeIntegrationKeys, ...entitledKeys];

  return prisma.integration.findMany({
    where: {
      isActive: true,
      supportsInput: true,
      key: { in: allowedKeys },
      ...(normalizedArtifactType
        ? { supportedArtifactTypes: { has: normalizedArtifactType } }
        : {}),
    },
    orderBy: [{ isFree: "desc" }, { displayName: "asc" }],
  });
}

/**
 * Get integrations available as output destinations for a space.
 * Includes free integrations and paid ones with active entitlements.
 * Optionally filters by artifact type.
 */
export async function getAvailableOutputDestinations(
  spaceId: string,
  artifactType?: ArtifactType
) {
  const normalizedArtifactType = toPrismaArtifactType(artifactType);
  const entitlements = await prisma.integrationEntitlement.findMany({
    where: { spaceId, status: ENTITLEMENT_ACTIVE },
    select: { integrationKey: true },
  });
  const entitledKeys = entitlements.map((e) => e.integrationKey);
  const allowedKeys = [...freeIntegrationKeys, ...entitledKeys];

  return prisma.integration.findMany({
    where: {
      isActive: true,
      supportsOutput: true,
      key: { in: allowedKeys },
      ...(normalizedArtifactType
        ? { supportedArtifactTypes: { has: normalizedArtifactType } }
        : {}),
    },
    orderBy: [{ isFree: "desc" }, { displayName: "asc" }],
  });
}

// ---------------------------------------------------------------------------
// Marketplace (full catalog with activation state)
// ---------------------------------------------------------------------------

/**
 * Get the full integration catalog with activation state for a space.
 * Free integrations are always "activated". Paid integrations check entitlements.
 */
export async function getMarketplaceCatalog(spaceId: string) {
  const [catalog, entitlements] = await Promise.all([
    prisma.integration.findMany({
      where: { isActive: true },
      orderBy: [{ isFree: "desc" }, { displayName: "asc" }],
    }),
    prisma.integrationEntitlement.findMany({
      where: { spaceId, status: ENTITLEMENT_ACTIVE },
      select: { integrationKey: true },
    }),
  ]);

  const entitledKeys = new Set(entitlements.map((e) => e.integrationKey));

  return catalog.map((integration) => ({
    ...integration,
    activated: integration.isFree || entitledKeys.has(integration.key),
  }));
}

// ---------------------------------------------------------------------------
// Entitlements (paid integration activation)
// ---------------------------------------------------------------------------

/**
 * Activate a paid integration for a space.
 * For free integrations, returns immediately without creating an entitlement.
 * For paid integrations, creates/updates an entitlement record.
 */
export async function activateIntegration(
  spaceId: string,
  integrationKey: string,
  source = "manual"
) {
  // Free integrations don't need entitlements
  if (freeIntegrationKeys.includes(integrationKey)) {
    return { key: integrationKey, status: "free" as const };
  }

  // Verify the integration exists and is paid
  const integration = await prisma.integration.findUnique({
    where: { key: integrationKey },
  });
  if (!integration) {
    throw new Error(`Integration not found: ${integrationKey}`);
  }
  if (integration.isFree) {
    return { key: integrationKey, status: "free" as const };
  }

  const entitlement = await prisma.integrationEntitlement.upsert({
    where: {
      spaceId_integrationKey: { spaceId, integrationKey },
    },
    update: {
      status: ENTITLEMENT_ACTIVE,
      source,
      activatedAt: new Date(),
    },
    create: {
      spaceId,
      integrationKey,
      status: ENTITLEMENT_ACTIVE,
      source,
    },
  });

  return { key: integrationKey, status: "activated" as const, entitlement };
}

// ---------------------------------------------------------------------------
// Space Integrations (configured sources / destinations)
// ---------------------------------------------------------------------------

/**
 * Install (configure) an integration as a source or destination on a stream.
 */
export async function installSpaceIntegration(
  spaceId: string,
  data: InstallSpaceIntegrationInput
) {
  const direction = data.direction.toLowerCase() === "input" ? DIRECTION_INPUT : DIRECTION_OUTPUT;
  const triggerKey = (data.trigger ?? "manual").toLowerCase();
  const trigger = TRIGGER_MAP[triggerKey] ?? TRIGGER_MAP.manual;

  const existing = await prisma.spaceIntegration.findFirst({
    where: {
      spaceId,
      integrationId: data.integrationId,
      streamId: data.streamId,
      direction,
    },
  });

  if (existing) {
    return prisma.spaceIntegration.update({
      where: { id: existing.id },
      data: {
        config: (data.config ?? {}) as never,
        schedule: data.schedule ?? null,
        trigger,
        status: STATUS_ACTIVE,
      },
      include: {
        integration: true,
        stream: { select: { id: true, name: true, slug: true } },
      },
    });
  }

  return prisma.spaceIntegration.create({
    data: {
      spaceId,
      integrationId: data.integrationId,
      streamId: data.streamId,
      direction,
      config: (data.config ?? {}) as never,
      schedule: data.schedule ?? null,
      trigger,
    },
    include: {
      integration: true,
      stream: { select: { id: true, name: true, slug: true } },
    },
  });
}

/**
 * List all configured integrations for a space, with integration and stream info.
 */
export async function getSpaceIntegrations(
  spaceId: string,
  direction?: IntegrationDirection
) {
  return prisma.spaceIntegration.findMany({
    where: {
      spaceId,
      ...(direction ? { direction } : {}),
    },
    include: {
      integration: true,
      stream: {
        select: {
          id: true,
          name: true,
          slug: true,
          artifactType: true,
          isActive: true,
        },
      },
    },
    orderBy: { createdDate: "desc" },
  });
}

/**
 * Get a single space integration by ID.
 */
export async function getSpaceIntegrationById(id: string) {
  return prisma.spaceIntegration.findUnique({
    where: { id },
    include: {
      integration: true,
      stream: {
        select: {
          id: true,
          name: true,
          slug: true,
          artifactType: true,
          isActive: true,
        },
      },
    },
  });
}

/**
 * Update a configured space integration (config, schedule, trigger, status).
 */
export async function updateSpaceIntegration(
  id: string,
  data: UpdateSpaceIntegrationInput
) {
  return prisma.spaceIntegration.update({
    where: { id },
    data: {
      ...(data.config !== undefined
        ? { config: data.config as never }
        : {}),
      ...(data.schedule !== undefined ? { schedule: data.schedule } : {}),
      ...(data.trigger !== undefined ? { trigger: data.trigger } : {}),
      ...(data.status !== undefined ? { status: data.status } : {}),
    },
    include: {
      integration: true,
      stream: { select: { id: true, name: true, slug: true } },
    },
  });
}

/**
 * Remove a configured space integration.
 */
export async function removeSpaceIntegration(id: string): Promise<boolean> {
  await prisma.spaceIntegration.delete({
    where: { id },
  });
  return true;
}

// ---------------------------------------------------------------------------
// Run Logs
// ---------------------------------------------------------------------------

/**
 * Log an integration execution run.
 */
export async function createRunLog(
  spaceIntegrationId: string,
  data: CreateRunLogInput
) {
  const log = await prisma.integrationRunLog.create({
    data: {
      spaceIntegrationId,
      status: data.status,
      message: data.message ?? null,
      requestPayload: data.requestPayload as never ?? undefined,
      responsePayload: data.responsePayload as never ?? undefined,
      durationMs: data.durationMs ?? null,
    },
  });

  // Update the parent SpaceIntegration's last run state
  await prisma.spaceIntegration.update({
    where: { id: spaceIntegrationId },
    data: {
      lastRunAt: log.createdDate,
      lastRunStatus: data.status,
    },
  });

  return log;
}

/**
 * Get aggregate run stats for a space integration.
 * Returns total runs, success/error counts, and average duration.
 */
export async function getRunStats(spaceIntegrationId: string) {
  const [totals, durations] = await Promise.all([
    prisma.integrationRunLog.groupBy({
      by: ["status"],
      where: { spaceIntegrationId },
      _count: true,
    }),
    prisma.integrationRunLog.aggregate({
      where: { spaceIntegrationId, durationMs: { not: null } },
      _avg: { durationMs: true },
      _max: { durationMs: true },
      _min: { durationMs: true },
      _count: true,
    }),
  ]);

  const statusCounts: Record<string, number> = {};
  let totalRuns = 0;
  for (const row of totals) {
    statusCounts[row.status] = row._count;
    totalRuns += row._count;
  }

  return {
    totalRuns,
    statusCounts,
    avgDurationMs: durations._avg.durationMs,
    maxDurationMs: durations._max.durationMs,
    minDurationMs: durations._min.durationMs,
  };
}
