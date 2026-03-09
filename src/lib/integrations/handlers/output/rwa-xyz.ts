/**
 * RWA.xyz Output Handler
 *
 * Syncs stream entry data to the RWA.xyz platform.
 * Reads the latest StreamEntry value and pushes it as asset metrics.
 */

import { BaseOutputHandler } from "../../base-handler";
import type { ExecutionResult, StoreEntryContext, ValidationResult } from "../../types";

interface RwaXyzConfig {
  apiKey: string;
  assetId: string;
  navPerToken?: number;
  retryCount?: number;
}

const RWA_XYZ_BASE_URL = "https://ingestion-api.rwa.xyz/v1";

function normalizeConfig(config: Record<string, unknown>): RwaXyzConfig {
  return {
    apiKey: String(config.apiKey || ""),
    assetId: String(config.assetId || ""),
    navPerToken: typeof config.navPerToken === "number" ? config.navPerToken : 1,
    retryCount: typeof config.retryCount === "number" ? config.retryCount : 2,
  };
}

function isValidConfig(config: RwaXyzConfig): boolean {
  return config.apiKey.trim().length > 0 && config.assetId.trim().length > 0;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class RwaXyzOutputHandler extends BaseOutputHandler {
  key = "rwa_xyz";
  displayName = "RWA.xyz";

  validateConfig(rawConfig: Record<string, unknown>): ValidationResult {
    const config = normalizeConfig(rawConfig);
    const errors: string[] = [];
    if (!isValidConfig(config)) {
      errors.push("Configuration must include non-empty apiKey and assetId");
    }
    if ((config.navPerToken ?? 1) <= 0) {
      errors.push("navPerToken must be a positive number");
    }
    if ((config.retryCount ?? 0) < 0 || (config.retryCount ?? 0) > 10) {
      errors.push("retryCount must be between 0 and 10");
    }
    return errors.length > 0 ? this.invalid(errors) : this.valid();
  }

  async run(
    rawConfig: Record<string, unknown>,
    context: StoreEntryContext
  ): Promise<ExecutionResult> {
    if (context.entry.value === null || context.entry.value === undefined) {
      return this.failure("RWA.xyz output requires a stream entry with a numeric value");
    }

    const config = normalizeConfig(rawConfig);
    if (!isValidConfig(config)) {
      return this.failure("Invalid configuration for RWA.xyz output");
    }

    const dateStr = context.entry.timestamp.toISOString().split("T")[0];
    const tokenSupply = context.entry.value;
    const navPerToken = config.navPerToken ?? 1;
    const aum = tokenSupply * navPerToken;

    const payload = [
      {
        id: config.assetId,
        metrics: {
          token_supply_circulating: tokenSupply,
          net_asset_value: navPerToken,
          net_asset_value_dollar: navPerToken,
          aum,
          aum_dollar: aum,
        },
      },
    ];

    const url = `${RWA_XYZ_BASE_URL}/assets/metrics/${dateStr}`;
    let lastError = "RWA.xyz output failed";

    for (let attempt = 0; attempt <= (config.retryCount ?? 0); attempt += 1) {
      try {
        const response = await fetch(url, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${config.apiKey}`,
          },
          body: JSON.stringify(payload),
        });
        const responsePayload = await response.json().catch(() => null);
        if (!response.ok) {
          lastError = `RWA.xyz API error: ${response.status} ${response.statusText}`;
          if (attempt < (config.retryCount ?? 0)) {
            await sleep(500 * (attempt + 1));
            continue;
          }
          return this.failure(lastError, { url, payload }, responsePayload);
        }

        return this.success(`Successfully synced ${config.assetId} for ${dateStr}`, { url, payload }, responsePayload);
      } catch (error) {
        lastError = `RWA.xyz output failed: ${error instanceof Error ? error.message : "Unknown error"}`;
        if (attempt < (config.retryCount ?? 0)) {
          await sleep(500 * (attempt + 1));
          continue;
        }
        return this.failure(lastError, { url, payload });
      }
    }

    return this.failure(lastError, { url, payload });
  }
}

export const rwaXyzOutputHandler = new RwaXyzOutputHandler();
