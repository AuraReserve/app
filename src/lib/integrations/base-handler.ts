/**
 * Base handler classes for integration handlers.
 *
 * Provides common success/failure/validation helpers.
 */

import type {
  ExecutionResult,
  InputHandler,
  InputResult,
  OutputHandler,
  StoreEntryContext,
  ValidationResult,
} from "./types";

export abstract class BaseHandler {
  protected success(
    message?: string,
    requestPayload?: unknown,
    responsePayload?: unknown
  ): ExecutionResult {
    return { success: true, message, requestPayload, responsePayload };
  }

  protected failure(
    error: string,
    requestPayload?: unknown,
    responsePayload?: unknown
  ): ExecutionResult {
    return { success: false, error, message: error, requestPayload, responsePayload };
  }

  protected valid(): ValidationResult {
    return { valid: true };
  }

  protected invalid(errors: string[]): ValidationResult {
    return { valid: false, errors };
  }
}

export abstract class BaseInputHandler extends BaseHandler implements InputHandler {
  abstract key: string;
  direction: "input" = "input";
  abstract displayName: string;
  abstract validateConfig(config: Record<string, unknown>): ValidationResult;
  abstract run(config: Record<string, unknown>): Promise<InputResult>;
}

export abstract class BaseOutputHandler extends BaseHandler implements OutputHandler {
  abstract key: string;
  direction: "output" = "output";
  abstract displayName: string;
  abstract validateConfig(config: Record<string, unknown>): ValidationResult;
  abstract run(
    config: Record<string, unknown>,
    context: StoreEntryContext
  ): Promise<ExecutionResult>;
}
