/**
 * Manual Input Handler
 *
 * Manual input doesn't auto-run — entries are created via the UI.
 * The handler exists for config validation and registry consistency.
 */

import { BaseInputHandler } from "../../base-handler";
import type { InputResult, ValidationResult } from "../../types";

export class ManualInputHandler extends BaseInputHandler {
  key = "manual";
  displayName = "Manual Input";

  validateConfig(config: Record<string, unknown>): ValidationResult {
    if (typeof config !== "object" || config === null) {
      return this.invalid(["Configuration must be an object"]);
    }
    return this.valid();
  }

  async run(_config: Record<string, unknown>): Promise<InputResult> {
    return {
      ...this.failure("Manual input requires explicit value submission via the UI"),
    };
  }
}

export const manualInputHandler = new ManualInputHandler();
