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
 * Trigger all on_change output destinations linked to a specific stream.
 * Called after a new entry is created in the stream.
 */
export async function runOnChangeOutputs(
  spaceId: string,
  streamId: string
): Promise<Array<{ id: string; success: boolean; message?: string }>> {
  const outputs = await prisma.spaceIntegration.findMany({
    where: {
      spaceId,
      streamId,
      direction: DIRECTION_OUTPUT,
      trigger: "ON_CHANGE" as unknown as import("@prisma/client").IntegrationTrigger,
      status: STATUS_ACTIVE,
    },
    select: { id: true },
  });

  const results: Array<{ id: string; success: boolean; message?: string }> = [];

  for (const output of outputs) {
    try {
      const result = await runSpaceIntegration(output.id);
      results.push({ id: output.id, ...result });
    } catch (error) {
      results.push({
        id: output.id,
        success: false,
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Cron Scheduling
// ---------------------------------------------------------------------------

function parseCronField(field: string, min: number, max: number): Set<number> {
  const out = new Set<number>();

  const addRange = (start: number, end: number, step = 1) => {
    for (let i = start; i <= end; i += step) {
      if (i >= min && i <= max) out.add(i);
    }
  };

  for (const part of field.split(",")) {
    if (part === "*") {
      addRange(min, max);
      continue;
    }

    const [base, stepRaw] = part.split("/");
    const step = stepRaw ? Number(stepRaw) : 1;
    if (!Number.isFinite(step) || step <= 0) continue;

    if (base === "*") {
      addRange(min, max, step);
      continue;
    }

    if (base.includes("-")) {
      const [startRaw, endRaw] = base.split("-");
      const start = Number(startRaw);
      const end = Number(endRaw);
      if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
      addRange(start, end, step);
      continue;
    }

    const value = Number(base);
    if (Number.isFinite(value) && value >= min && value <= max) {
      out.add(value);
    }
  }

  return out;
}

function cronMatches(date: Date, expression: string): boolean {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) return false;

  const [minuteExpr, hourExpr, dayExpr, monthExpr, weekdayExpr] = parts;

  const minutes = parseCronField(minuteExpr, 0, 59);
  const hours = parseCronField(hourExpr, 0, 23);
  const days = parseCronField(dayExpr, 1, 31);
  const months = parseCronField(monthExpr, 1, 12);
  const weekdays = parseCronField(weekdayExpr, 0, 7);

  const dayOfWeek = date.getDay();
  const normalizedWeekdays = new Set(
    Array.from(weekdays).map((v) => (v === 7 ? 0 : v))
  );

  return (
    minutes.has(date.getMinutes()) &&
    hours.has(date.getHours()) &&
    days.has(date.getDate()) &&
    months.has(date.getMonth() + 1) &&
    normalizedWeekdays.has(dayOfWeek)
  );
}

/**
 * Check if a cron schedule is due to run.
 * Walks minute-by-minute from lastRun (or 7 days ago) to now.
 */
export function isCronDue(
  schedule: string | null,
  lastRun: Date | null,
  now = new Date()
): boolean {
  if (!schedule) return false;
  const lookback = lastRun ?? new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const cursor = new Date(lookback);

  cursor.setSeconds(0, 0);
  if (cursor <= lookback) {
    cursor.setMinutes(cursor.getMinutes() + 1);
  }

  const maxIterations = 14 * 24 * 60;
  for (let i = 0; i < maxIterations; i += 1) {
    if (cursor > now) return false;
    if (cronMatches(cursor, schedule)) return true;
    cursor.setMinutes(cursor.getMinutes() + 1);
  }

  return false;
}

/**
 * Run all cron-scheduled integrations that are due.
 * Optionally filter by direction (input/output).
 */
export async function runScheduledIntegrations(
  direction?: "input" | "output"
): Promise<Array<{ id: string; success: boolean; message?: string }>> {
  const TRIGGER_CRON = "CRON" as unknown as import("@prisma/client").IntegrationTrigger;
  const directionMap: Record<string, import("@prisma/client").IntegrationDirection> = {
    input: DIRECTION_INPUT,
    output: DIRECTION_OUTPUT,
  };
  const where: Record<string, unknown> = {
    trigger: TRIGGER_CRON,
    status: STATUS_ACTIVE,
    schedule: { not: null },
  };
  if (direction) {
    where.direction = directionMap[direction];
  }

  const integrations = await prisma.spaceIntegration.findMany({
    where,
    select: {
      id: true,
      schedule: true,
      lastRunAt: true,
    },
  });

  const now = new Date();
  const due = integrations.filter((si) =>
    isCronDue(si.schedule, si.lastRunAt, now)
  );

  const results: Array<{ id: string; success: boolean; message?: string }> = [];

  for (const si of due) {
    try {
      const result = await runSpaceIntegration(si.id);
      results.push({ id: si.id, ...result });
    } catch (error) {
      results.push({
        id: si.id,
        success: false,
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return results;
}
