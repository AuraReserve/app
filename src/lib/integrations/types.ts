/**
 * Integration Handler Types
 *
 * Stream-aware handler interfaces that replace the old plugin types.
 * Input handlers produce StreamEntry data; output handlers consume it.
 */

import type { ArtifactType } from "@prisma/client";

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface ValidationResult {
  valid: boolean;
  errors?: string[];
}

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

export interface ExecutionResult {
  success: boolean;
  message?: string;
  error?: string;
  requestPayload?: unknown;
  responsePayload?: unknown;
}

/**
 * Data produced by an input handler run.
 * For VALUE streams: `value` is set.
 * For MERKLE streams: `artifactData` contains tree structure.
 */
export interface InputResult extends ExecutionResult {
  value?: number;
  artifactData?: Record<string, unknown>;
}

/**
 * Context provided to output handlers — the latest stream entry data.
 */
export interface StoreEntryContext {
  streamId: string;
  streamName: string;
  streamSlug: string;
  spaceId: string;
  spaceName: string;
  artifactType: ArtifactType;
  unit: string;
  entry: {
    id: string;
    value: number | null;
    artifactData: Record<string, unknown> | null;
    timestamp: Date;
    ripcord: boolean;
    ripcordDetails: unknown[];
    notes: string;
    metadata: Record<string, unknown>;
  };
}

// ---------------------------------------------------------------------------
// Handler Interfaces
// ---------------------------------------------------------------------------

export interface IntegrationHandler {
  key: string;
  direction: "input" | "output";
  displayName: string;
  validateConfig(config: Record<string, unknown>): ValidationResult;
}

export interface InputHandler extends IntegrationHandler {
  direction: "input";
  run(config: Record<string, unknown>): Promise<InputResult>;
}

export interface OutputHandler extends IntegrationHandler {
  direction: "output";
  run(
    config: Record<string, unknown>,
    context: StoreEntryContext
  ): Promise<ExecutionResult>;
}

export function isInputHandler(handler: IntegrationHandler): handler is InputHandler {
  return handler.direction === "input";
}

export function isOutputHandler(handler: IntegrationHandler): handler is OutputHandler {
  return handler.direction === "output";
}
