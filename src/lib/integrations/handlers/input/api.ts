/**
 * API Input Handler
 *
 * Fetches a numeric value from an HTTP API endpoint and returns it
 * for creation as a StreamEntry in the assigned stream.
 */

import { BaseInputHandler } from "../../base-handler";
import type { InputResult, ValidationResult } from "../../types";

type ApiAuthType = "none" | "bearer" | "basic" | "api_key";

interface ApiInputConfig {
  url: string;
  method: "GET" | "POST";
  headers?: Record<string, string>;
  authType?: ApiAuthType;
  authValue?: string;
  authHeaderName?: string;
  bodyTemplate?: string;
  responsePath: string;
  timeoutMs: number;
  retryCount: number;
  retryDelayMs: number;
  valueTransform: number;
}

function getByPath(input: unknown, path: string): unknown {
  if (!path) return input;
  return path.split(".").reduce((acc: unknown, key) => {
    if (acc && typeof acc === "object" && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, input);
}

function normalizeConfig(config: Record<string, unknown>): ApiInputConfig {
  return {
    url: String(config.url || ""),
    method: String(config.method || "GET").toUpperCase() as "GET" | "POST",
    headers: (config.headers as Record<string, string> | undefined) || {},
    authType: (config.authType as ApiAuthType | undefined) || "none",
    authValue: (config.authValue as string | undefined) || "",
    authHeaderName: (config.authHeaderName as string | undefined) || "x-api-key",
    bodyTemplate: (config.bodyTemplate as string | undefined) || "",
    responsePath: String(config.responsePath || ""),
    timeoutMs: typeof config.timeoutMs === "number" ? config.timeoutMs : 10000,
    retryCount: typeof config.retryCount === "number" ? config.retryCount : 1,
    retryDelayMs: typeof config.retryDelayMs === "number" ? config.retryDelayMs : 500,
    valueTransform: typeof config.valueTransform === "number" ? config.valueTransform : 1,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class ApiInputHandler extends BaseInputHandler {
  key = "api";
  displayName = "API Input";

  validateConfig(rawConfig: Record<string, unknown>): ValidationResult {
    const config = normalizeConfig(rawConfig);
    const errors: string[] = [];

    if (!config.url) {
      errors.push("URL is required");
    } else {
      try {
        const parsed = new URL(config.url);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
          errors.push("URL must use HTTP or HTTPS");
        }
      } catch {
        errors.push("URL must be valid");
      }
    }

    if (!["GET", "POST"].includes(config.method)) {
      errors.push("Method must be GET or POST");
    }

    if (!config.responsePath) {
      errors.push("responsePath is required");
    }

    if (config.authType !== "none" && !config.authValue) {
      errors.push("authValue is required when authType is enabled");
    }

    if (config.timeoutMs <= 0 || config.timeoutMs > 120000) {
      errors.push("timeoutMs must be between 1 and 120000");
    }

    if (config.retryCount < 0 || config.retryCount > 10) {
      errors.push("retryCount must be between 0 and 10");
    }

    if (config.retryDelayMs < 0 || config.retryDelayMs > 60000) {
      errors.push("retryDelayMs must be between 0 and 60000");
    }

    if (typeof config.valueTransform !== "number" || Number.isNaN(config.valueTransform)) {
      errors.push("valueTransform must be numeric");
    }

    return errors.length > 0 ? this.invalid(errors) : this.valid();
  }

  async run(rawConfig: Record<string, unknown>): Promise<InputResult> {
    const config = normalizeConfig(rawConfig);
    const validation = this.validateConfig(rawConfig);
    if (!validation.valid) {
      return {
        ...this.failure(`Invalid API input config: ${(validation.errors || []).join(", ")}`),
      };
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(config.headers || {}),
    };

    if (config.authType === "bearer") {
      headers.Authorization = `Bearer ${config.authValue}`;
    } else if (config.authType === "basic") {
      headers.Authorization = `Basic ${config.authValue}`;
    } else if (config.authType === "api_key") {
      headers[config.authHeaderName || "x-api-key"] = config.authValue || "";
    }

    let lastError = "Unknown API input error";

    for (let attempt = 0; attempt <= config.retryCount; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

      try {
        const requestInit: RequestInit = {
          method: config.method,
          headers,
          signal: controller.signal,
        };

        if (config.method === "POST" && config.bodyTemplate) {
          requestInit.body = config.bodyTemplate;
        }

        const response = await fetch(config.url, requestInit);
        const responseBody = await response.json().catch(() => null);

        if (!response.ok) {
          lastError = `API responded with ${response.status}`;
          if (attempt < config.retryCount) {
            await sleep(config.retryDelayMs);
            continue;
          }
          return {
            ...this.failure(lastError, { url: config.url, method: config.method }, responseBody),
          };
        }

        const extracted = getByPath(responseBody, config.responsePath);
        const numericValue = Number(extracted);
        if (Number.isNaN(numericValue)) {
          return {
            ...this.failure(
              `Value at path '${config.responsePath}' is not numeric`,
              { url: config.url, path: config.responsePath },
              responseBody
            ),
          };
        }

        const value = numericValue * config.valueTransform;

        return {
          ...this.success("API input fetched successfully", { url: config.url, method: config.method }, responseBody),
          value,
        };
      } catch (error) {
        lastError = error instanceof Error ? error.message : "Request failed";
        if (attempt < config.retryCount) {
          await sleep(config.retryDelayMs);
          continue;
        }

        return {
          ...this.failure(
            `API input fetch failed: ${lastError}`,
            { url: config.url, method: config.method }
          ),
        };
      } finally {
        clearTimeout(timeout);
      }
    }

    return { ...this.failure(lastError) };
  }
}

export const apiInputHandler = new ApiInputHandler();
