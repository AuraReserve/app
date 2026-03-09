/**
 * API Output Handler
 *
 * Marks stream data available via the native AuraReserve API.
 * No outbound sync is needed — the public API reads directly from streams.
 */

import { BaseOutputHandler } from "../../base-handler";
import type { ExecutionResult, StoreEntryContext, ValidationResult } from "../../types";

export class ApiOutputHandler extends BaseOutputHandler {
  key = "api";
  displayName = "API Output";

  validateConfig(config: Record<string, unknown>): ValidationResult {
    if (typeof config !== "object" || config === null) {
      return this.invalid(["Configuration must be an object"]);
    }
    return this.valid();
  }

  async run(
    _config: Record<string, unknown>,
    context: StoreEntryContext
  ): Promise<ExecutionResult> {
    return this.success(
      `API output is available for stream "${context.streamName}". No outbound sync required.`
    );
  }
}

export const apiOutputHandler = new ApiOutputHandler();
