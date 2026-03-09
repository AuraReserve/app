/**
 * Webhook Output Handler
 *
 * Reads the latest StreamEntry from the assigned stream and POSTs
 * the data to a configured webhook URL with optional HMAC signing.
 */

import { createHmac } from "crypto";
import { BaseOutputHandler } from "../../base-handler";
import type { ExecutionResult, StoreEntryContext, ValidationResult } from "../../types";

interface WebhookOutputConfig {
  url: string;
  method?: "POST" | "PUT";
  headers?: Record<string, string>;
  signingSecret?: string;
  timeoutMs?: number;
  retryCount?: number;
}

function normalizeConfig(config: Record<string, unknown>): WebhookOutputConfig {
  return {
    url: String(config.url || ""),
    method: ((config.method as string) || "POST").toUpperCase() as "POST" | "PUT",
    headers: (config.headers as Record<string, string>) || {},
    signingSecret: (config.signingSecret as string) || "",
    timeoutMs: typeof config.timeoutMs === "number" ? config.timeoutMs : 10000,
    retryCount: typeof config.retryCount === "number" ? config.retryCount : 2,
  };
}

function buildPayload(context: StoreEntryContext) {
  return {
    streamId: context.streamId,
    streamName: context.streamName,
    streamSlug: context.streamSlug,
    spaceId: context.spaceId,
    spaceName: context.spaceName,
    artifactType: context.artifactType,
    unit: context.unit,
    entry: {
      id: context.entry.id,
      value: context.entry.value,
      artifactData: context.entry.artifactData,
      timestamp: context.entry.timestamp.toISOString(),
      ripcord: context.entry.ripcord,
      ripcordDetails: context.entry.ripcordDetails,
      notes: context.entry.notes,
      metadata: context.entry.metadata,
    },
    sentAt: new Date().toISOString(),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class WebhookOutputHandler extends BaseOutputHandler {
  key = "webhook";
  displayName = "Webhook Output";

  validateConfig(rawConfig: Record<string, unknown>): ValidationResult {
    const config = normalizeConfig(rawConfig);
    const errors: string[] = [];

    if (!config.url) {
      errors.push("Webhook URL is required");
    } else {
      try {
        const parsed = new URL(config.url);
        if (!["http:", "https:"].includes(parsed.protocol)) {
          errors.push("Webhook URL must use http/https");
        }
      } catch {
        errors.push("Webhook URL must be valid");
      }
    }

    if (!["POST", "PUT"].includes(config.method || "POST")) {
      errors.push("Method must be POST or PUT");
    }

    if ((config.timeoutMs || 0) <= 0 || (config.timeoutMs || 0) > 120000) {
      errors.push("timeoutMs must be between 1 and 120000");
    }

    if ((config.retryCount || 0) < 0 || (config.retryCount || 0) > 10) {
      errors.push("retryCount must be between 0 and 10");
    }

    return errors.length > 0 ? this.invalid(errors) : this.valid();
  }

  async run(
    rawConfig: Record<string, unknown>,
    context: StoreEntryContext
  ): Promise<ExecutionResult> {
    const config = normalizeConfig(rawConfig);
    const validation = this.validateConfig(rawConfig);
    if (!validation.valid) {
      return this.failure(`Invalid webhook config: ${(validation.errors || []).join(", ")}`);
    }

    const payload = buildPayload(context);
    const payloadString = JSON.stringify(payload);

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...config.headers,
    };

    if (config.signingSecret) {
      const signature = createHmac("sha256", config.signingSecret)
        .update(payloadString)
        .digest("hex");
      headers["X-Aura-Signature"] = `sha256=${signature}`;
    }

    let lastError = "Webhook output failed";

    for (let attempt = 0; attempt <= (config.retryCount || 0); attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), config.timeoutMs || 10000);

      try {
        const response = await fetch(config.url, {
          method: config.method || "POST",
          headers,
          body: payloadString,
          signal: controller.signal,
        });

        const responsePayload = await response.text();

        if (!response.ok) {
          lastError = `Webhook response ${response.status}`;
          if (attempt < (config.retryCount || 0)) {
            await sleep(500 * (attempt + 1));
            continue;
          }
          return this.failure(lastError, payload, responsePayload);
        }

        return this.success("Webhook delivered", payload, responsePayload);
      } catch (error) {
        lastError = error instanceof Error ? error.message : "Webhook request failed";
        if (attempt < (config.retryCount || 0)) {
          await sleep(500 * (attempt + 1));
          continue;
        }
        return this.failure(lastError, payload);
      } finally {
        clearTimeout(timeout);
      }
    }

    return this.failure(lastError, payload);
  }
}

export const webhookOutputHandler = new WebhookOutputHandler();
