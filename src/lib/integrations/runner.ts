/**
 * Integration Runner
 *
 * Orchestrates execution of configured space integrations (input sources
 * and output destinations). Handles context building, handler dispatch,
 * run logging, cron scheduling, and on-change triggers.
 */

import { prisma } from "@/lib/prisma";
import type { IntegrationStatus, IntegrationDirection } from "@prisma/client";
import {
  getSpaceIntegrationById,
  createRunLog,
} from "@/lib/dal/integrations";
import { createEntry } from "@/lib/dal/stream-entries";
import { getIntegrationRegistry } from "./registry";
import type { InputResult, StoreEntryContext } from "./types";

// Workaround for Prisma 7 @map enum bug (prisma/prisma#28894)
const STATUS_ACTIVE = "ACTIVE" as unknown as IntegrationStatus;
const DIRECTION_INPUT = "INPUT" as unknown as IntegrationDirection;
const DIRECTION_OUTPUT = "OUTPUT" as unknown as IntegrationDirection;

// ---------------------------------------------------------------------------
// System User
// ---------------------------------------------------------------------------

export function getSystemUserEmail(): string {
  return process.env.SYSTEM_USER_EMAIL || "system@aurareserve.io";
}

async function getSystemUserId(): Promise<string> {
  const email = getSystemUserEmail();
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (!user) {
    throw new Error(
      `System user not found: ${email}. Run seed or create manually.`
    );
  }
  return user.id;
}

// ---------------------------------------------------------------------------
// Context Building
// ---------------------------------------------------------------------------

/**
 * Build a StoreEntryContext for output handlers by reading the latest entry
 * from the space integration's assigned stream.
 */
export async function buildContext(
  spaceIntegrationId: string
): Promise<StoreEntryContext | null> {
  const si = await prisma.spaceIntegration.findUnique({
    where: { id: spaceIntegrationId },
    include: {
      stream: {
        include: {
          space: { select: { id: true, name: true } },
          entries: {
            orderBy: { timestamp: "desc" },
            take: 1,
          },
        },
      },
    },
  });

  if (!si) return null;

  const stream = si.stream;
  if (!stream) return null;
  const latestEntry = stream.entries[0];
  if (!latestEntry) return null;

  return {
    streamId: stream.id,
    streamName: stream.name,
    streamSlug: stream.slug,
    spaceId: stream.space.id,
    spaceName: stream.space.name,
    artifactType: stream.artifactType,
    unit: stream.unit ?? "",
    entry: {
      id: latestEntry.id,
      value: latestEntry.value,
      artifactData: (latestEntry.artifactData as Record<string, unknown>) ?? null,
      timestamp: latestEntry.timestamp,
      ripcord: latestEntry.ripcord,
      ripcordDetails: (latestEntry.ripcordDetails as unknown[]) ?? [],
      notes: latestEntry.notes,
      metadata: (latestEntry.metadata as Record<string, unknown>) ?? {},
    },
  };
}

// ---------------------------------------------------------------------------
// Run Space Integration
// ---------------------------------------------------------------------------

export interface RunOptions {
  /** For manual input: the value to record */
  manualValue?: number;
  /** Override the submitter (defaults to system user) */
  submittedBy?: string;
  /** Override timestamp */
  timestamp?: Date;
  /** Notes to attach to the entry */
  notes?: string;
  /** Ripcord flag */
  ripcord?: boolean;
  /** Ripcord details */
  ripcordDetails?: string[];
  /** Artifact data for merkle types */
  artifactData?: Record<string, unknown>;
}

/**
 * Execute a configured space integration (input source or output destination).
 *
 * For input integrations: runs the handler, creates a StreamEntry from the result.
 * For output integrations: builds context from latest entry, runs the handler.
 * Always logs the run result.
 */
export async function runSpaceIntegration(
  spaceIntegrationId: string,
  options: RunOptions = {}
) {
  const si = await getSpaceIntegrationById(spaceIntegrationId);
  if (!si) {
    throw new Error(`SpaceIntegration not found: ${spaceIntegrationId}`);
  }

  if (si.status !== STATUS_ACTIVE) {
    return { success: false, message: `Integration is ${si.status}, not active` };
  }

  const registry = getIntegrationRegistry();
  const config = (si.config as Record<string, unknown>) ?? {};
  const startTime = Date.now();

  // --- Input handler ---
  if (si.direction === DIRECTION_INPUT) {
    const handler = registry.getInputHandler(si.integration.key);
    if (!handler) {
      return { success: false, message: `No input handler for: ${si.integration.key}` };
    }

    let result: InputResult;

    // Manual input: the value comes from options, not from the handler
    if (si.integration.key === "manual") {
      if (options.manualValue === undefined && !options.artifactData) {
        return { success: false, message: "Manual input requires a value or artifact data" };
      }
      result = {
        success: true,
        message: "Manual input accepted",
        value: options.manualValue,
        artifactData: options.artifactData,
      };
    } else {
      result = await handler.run(config);
    }

    const durationMs = Date.now() - startTime;

    await createRunLog(spaceIntegrationId, {
      status: result.success ? "success" : "error",
      message: result.message ?? result.error,
      requestPayload: result.requestPayload,
      responsePayload: result.responsePayload,
      durationMs,
    });

    if (!result.success) {
      return { success: false, message: result.error || result.message };
    }

    // Create StreamEntry from the handler result
    if (!si.streamId || !si.stream) {
      return { success: false, message: "Integration has no assigned stream" };
    }
    const submittedBy = options.submittedBy ?? await getSystemUserId();
    const entry = await createEntry(si.streamId, {
      artifactType: si.stream.artifactType,
      value: result.value ?? options.manualValue ?? null,
      artifactData: (result.artifactData ?? options.artifactData ?? null) as import("@prisma/client").Prisma.InputJsonValue | null,
      submittedBy,
      sourceIntegrationId: spaceIntegrationId,
      isAutomated: si.integration.key !== "manual",
      timestamp: options.timestamp ?? new Date(),
      ripcord: options.ripcord ?? false,
      ripcordDetails: options.ripcordDetails ?? [],
      notes: options.notes ?? "",
    });

    return { success: true, message: result.message, entryId: entry.id };
  }

  // --- Output handler ---
  const handler = registry.getOutputHandler(si.integration.key);
  if (!handler) {
    return { success: false, message: `No output handler for: ${si.integration.key}` };
  }

  const context = await buildContext(spaceIntegrationId);
  if (!context) {
    const msg = "No stream entry available for output";
    await createRunLog(spaceIntegrationId, {
      status: "error",
      message: msg,
      durationMs: Date.now() - startTime,
    });
    return { success: false, message: msg };
  }

  const result = await handler.run(config, context);
  const durationMs = Date.now() - startTime;

  await createRunLog(spaceIntegrationId, {
    status: result.success ? "success" : "error",
    message: result.message ?? result.error,
    requestPayload: result.requestPayload,
    responsePayload: result.responsePayload,
    durationMs,
  });

  return { success: result.success, message: result.message ?? result.error };
}

// ---------------------------------------------------------------------------
// On-Change Outputs
// ---------------------------------------------------------------------------

/**
 * Enqueue jobs for all on_change output destinations linked to a stream.
 * Called after a new entry is created in the stream.
 */
export async function runOnChangeOutputs(
  spaceId: string,
  streamId: string
): Promise<void> {
  // Lazy import to avoid circular dependency at module level
  const { enqueueIntegrationRun } = await import("@/lib/queue/jobs");

  const outputs = await prisma.spaceIntegration.findMany({
    where: {
      spaceId,
      streamId,
      direction: DIRECTION_OUTPUT,
      trigger: "ON_CHANGE" as unknown as import("@prisma/client").IntegrationTrigger,
      status: STATUS_ACTIVE,
    },
    select: { id: true, maxAttempts: true, retryBackoff: true },
  });

  for (const output of outputs) {
    await enqueueIntegrationRun(output.id, "on_change", undefined, {
      maxAttempts: output.maxAttempts,
      retryBackoff: output.retryBackoff,
    });
  }
}
