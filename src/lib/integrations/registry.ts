/**
 * Integration Handler Registry
 *
 * Maps integration keys to handler instances for runtime dispatch.
 * Uses separate maps for input and output since an integration key
 * can have both (e.g., "api" has both input and output handlers).
 *
 * Also maps database integration keys to shared handlers where needed
 * (e.g., "avalanche" and "ethereum" both use the blockchain handler).
 */

import type { InputHandler, OutputHandler } from "./types";

// Import all handler instances
import { manualInputHandler } from "./handlers/input/manual";
import { apiInputHandler } from "./handlers/input/api";
import { blockchainInputHandler } from "./handlers/input/blockchain";
import { apiOutputHandler } from "./handlers/output/api";
import { webhookOutputHandler } from "./handlers/output/webhook";
import { blockchainOutputHandler } from "./handlers/output/blockchain";
import { rwaXyzOutputHandler } from "./handlers/output/rwa-xyz";

class IntegrationRegistry {
  private inputHandlers = new Map<string, InputHandler>();
  private outputHandlers = new Map<string, OutputHandler>();

  registerInput(key: string, handler: InputHandler): void {
    this.inputHandlers.set(key, handler);
  }

  registerOutput(key: string, handler: OutputHandler): void {
    this.outputHandlers.set(key, handler);
  }

  getInputHandler(key: string): InputHandler | undefined {
    return this.inputHandlers.get(key);
  }

  getOutputHandler(key: string): OutputHandler | undefined {
    return this.outputHandlers.get(key);
  }

  getAllInputHandlers(): Array<{ key: string; handler: InputHandler }> {
    return Array.from(this.inputHandlers.entries()).map(([key, handler]) => ({
      key,
      handler,
    }));
  }

  getAllOutputHandlers(): Array<{ key: string; handler: OutputHandler }> {
    return Array.from(this.outputHandlers.entries()).map(([key, handler]) => ({
      key,
      handler,
    }));
  }
}

// ---------------------------------------------------------------------------
// Singleton with default registrations
// ---------------------------------------------------------------------------

let registry: IntegrationRegistry | null = null;

function createDefaultRegistry(): IntegrationRegistry {
  const reg = new IntegrationRegistry();

  // Input handlers: key matches Integration.key in the database
  reg.registerInput("manual", manualInputHandler);
  reg.registerInput("api", apiInputHandler);
  reg.registerInput("api-fetch", apiInputHandler);
  // Blockchain input handler — registered under all possible keys
  reg.registerInput("blockchain-read", blockchainInputHandler);
  reg.registerInput("avalanche", blockchainInputHandler);
  reg.registerInput("ethereum", blockchainInputHandler);

  // Output handlers: key matches Integration.key in the database
  reg.registerOutput("api", apiOutputHandler);
  reg.registerOutput("webhook", webhookOutputHandler);
  // Avalanche & Ethereum both use the shared blockchain output handler
  reg.registerOutput("avalanche", blockchainOutputHandler);
  reg.registerOutput("ethereum", blockchainOutputHandler);
  reg.registerOutput("rwa_xyz", rwaXyzOutputHandler);

  return reg;
}

/**
 * Get the singleton integration registry. Lazily initialized on first call.
 */
export function getIntegrationRegistry(): IntegrationRegistry {
  if (!registry) {
    registry = createDefaultRegistry();
  }
  return registry;
}

/**
 * Reset the registry (useful for testing).
 */
export function resetIntegrationRegistry(): void {
  registry = null;
}
