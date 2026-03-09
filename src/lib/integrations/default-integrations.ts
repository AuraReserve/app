/**
 * Default Integration Catalog
 *
 * Defines built-in integrations with capability flags.
 * These are upserted into the database on startup/seed.
 *
 * NOTE: Due to Prisma v7 bug #28894, enum values use the UNMAPPED uppercase
 * names (e.g. "CRON") not the @map'd lowercase ("cron"). The cast to the
 * Prisma type happens at the DAL layer when upserted.
 */

import type { ArtifactType, IntegrationTrigger } from "@prisma/client";
import { requireArtifactType } from "@/lib/artifact-types";

/** All artifact types, used by integrations that accept any data shape. */
const ALL_ARTIFACT_TYPES: ArtifactType[] = [
  requireArtifactType("value"),
  requireArtifactType("merkle_tree"),
  requireArtifactType("merkle_sum_tree"),
  requireArtifactType("sparse_merkle_tree"),
];

export interface DefaultIntegration {
  key: string;
  displayName: string;
  description: string;
  supportsInput: boolean;
  supportsOutput: boolean;
  supportedArtifactTypes: ArtifactType[];
  isFree: boolean;
  supportedTriggers: IntegrationTrigger[];
  configSchema: Record<string, unknown>;
  defaultTrigger: IntegrationTrigger | null;
  defaultSchedule: string | null;
  isAvailableSelfHosted: boolean;
  bundleKey: string | null;
}

export const defaultIntegrations: DefaultIntegration[] = [
  // ── Input integrations ─────────────────────────────────────────────

  {
    key: "manual",
    displayName: "Manual Input",
    description: "Manually enter reserve values through the portal UI.",
    supportsInput: true,
    supportsOutput: false,
    supportedArtifactTypes: ALL_ARTIFACT_TYPES,
    isFree: true,
    supportedTriggers: [],
    configSchema: {},
    defaultTrigger: null,
    defaultSchedule: null,
    isAvailableSelfHosted: true,
    bundleKey: null,
  },
  {
    key: "csv-upload",
    displayName: "CSV/JSON Upload",
    description: "Bulk import reserve data from CSV or JSON files.",
    supportsInput: true,
    supportsOutput: false,
    supportedArtifactTypes: ALL_ARTIFACT_TYPES,
    isFree: true,
    supportedTriggers: [],
    configSchema: {},
    defaultTrigger: null,
    defaultSchedule: null,
    isAvailableSelfHosted: true,
    bundleKey: null,
  },
  {
    key: "api",
    displayName: "API Ingest",
    description: "Ingest data via authenticated API push.",
    supportsInput: true,
    supportsOutput: false,
    supportedArtifactTypes: ALL_ARTIFACT_TYPES,
    isFree: false,
    supportedTriggers: [],
    configSchema: {},
    defaultTrigger: null,
    defaultSchedule: null,
    isAvailableSelfHosted: true,
    bundleKey: null,
  },
  {
    key: "blockchain-read",
    displayName: "Blockchain Read",
    description: "Read on-chain reserve data from EVM-compatible blockchains.",
    supportsInput: true,
    supportsOutput: false,
    supportedArtifactTypes: [
      requireArtifactType("value"),
      requireArtifactType("merkle_tree"),
      requireArtifactType("merkle_sum_tree"),
    ],
    isFree: false,
    supportedTriggers: [
      "CRON" as IntegrationTrigger,
      "MANUAL" as IntegrationTrigger,
    ],
    configSchema: {
      input: {
        type: "object",
        properties: {
          rpcUrl: { type: "string", description: "RPC endpoint URL" },
          contractAddress: { type: "string", description: "Reserve contract address" },
          tokenDecimals: { type: "number", description: "Token decimal places" },
        },
        required: ["rpcUrl", "contractAddress"],
      },
    },
    defaultTrigger: "CRON" as IntegrationTrigger,
    defaultSchedule: "0 */6 * * *",
    isAvailableSelfHosted: true,
    bundleKey: "blockchain",
  },
  {
    key: "api-fetch",
    displayName: "API Fetch",
    description: "Pull data from an external API on a schedule.",
    supportsInput: true,
    supportsOutput: false,
    supportedArtifactTypes: ALL_ARTIFACT_TYPES,
    isFree: false,
    supportedTriggers: [
      "CRON" as IntegrationTrigger,
      "MANUAL" as IntegrationTrigger,
    ],
    configSchema: {
      input: {
        type: "object",
        properties: {
          endpoint: { type: "string", description: "External API endpoint to poll" },
          headers: { type: "object", description: "Custom headers for API requests" },
          method: { type: "string", description: "HTTP method (GET, POST)" },
        },
        required: ["endpoint"],
      },
    },
    defaultTrigger: "CRON" as IntegrationTrigger,
    defaultSchedule: "0 */6 * * *",
    isAvailableSelfHosted: true,
    bundleKey: null,
  },

  // ── Output integrations ────────────────────────────────────────────

  {
    key: "api-serve",
    displayName: "API Endpoint",
    description: "Expose reserve data through public API endpoints.",
    supportsInput: false,
    supportsOutput: true,
    supportedArtifactTypes: ALL_ARTIFACT_TYPES,
    isFree: true,
    supportedTriggers: [],
    configSchema: {
      output: {
        type: "object",
        properties: {
          rateLimit: { type: "number", description: "Max requests per minute" },
        },
      },
    },
    defaultTrigger: null,
    defaultSchedule: null,
    isAvailableSelfHosted: true,
    bundleKey: null,
  },
  {
    key: "api-serve-all",
    displayName: "API Endpoint (All Streams)",
    description: "Expose all reserve streams through a single public API endpoint.",
    supportsInput: false,
    supportsOutput: true,
    supportedArtifactTypes: ALL_ARTIFACT_TYPES,
    isFree: true,
    supportedTriggers: [],
    configSchema: {
      output: {
        type: "object",
        properties: {
          rateLimit: { type: "number", description: "Max requests per minute" },
        },
      },
    },
    defaultTrigger: null,
    defaultSchedule: null,
    isAvailableSelfHosted: true,
    bundleKey: null,
  },
  {
    key: "webhook",
    displayName: "Webhook",
    description: "Push reserve data to external endpoints via webhooks.",
    supportsInput: false,
    supportsOutput: true,
    supportedArtifactTypes: ALL_ARTIFACT_TYPES,
    isFree: false,
    supportedTriggers: [
      "ON_CHANGE" as IntegrationTrigger,
      "CRON" as IntegrationTrigger,
      "MANUAL" as IntegrationTrigger,
    ],
    configSchema: {
      output: {
        type: "object",
        properties: {
          url: { type: "string", description: "Webhook destination URL" },
          secret: { type: "string", description: "HMAC signing secret" },
          headers: { type: "object", description: "Custom headers" },
        },
        required: ["url"],
      },
    },
    defaultTrigger: "ON_CHANGE" as IntegrationTrigger,
    defaultSchedule: null,
    isAvailableSelfHosted: true,
    bundleKey: null,
  },
  {
    key: "avalanche",
    displayName: "Avalanche",
    description: "Publish proof-of-reserve attestations on Avalanche C-Chain.",
    supportsInput: false,
    supportsOutput: true,
    supportedArtifactTypes: ALL_ARTIFACT_TYPES,
    isFree: false,
    supportedTriggers: [
      "ON_CHANGE" as IntegrationTrigger,
      "CRON" as IntegrationTrigger,
      "MANUAL" as IntegrationTrigger,
    ],
    configSchema: {
      output: {
        type: "object",
        properties: {
          rpcUrl: { type: "string", description: "Avalanche RPC endpoint" },
          contractAddress: { type: "string", description: "Proof-of-reserve contract address" },
          privateKey: { type: "string", description: "Wallet private key (encrypted)" },
        },
        required: ["rpcUrl", "contractAddress", "privateKey"],
      },
    },
    defaultTrigger: "MANUAL" as IntegrationTrigger,
    defaultSchedule: null,
    isAvailableSelfHosted: true,
    bundleKey: "blockchain",
  },
  {
    key: "rwa-xyz",
    displayName: "RWA.xyz",
    description: "Publish reserve attestations to the RWA.xyz platform.",
    supportsInput: false,
    supportsOutput: true,
    supportedArtifactTypes: ALL_ARTIFACT_TYPES,
    isFree: false,
    supportedTriggers: [
      "ON_CHANGE" as IntegrationTrigger,
      "CRON" as IntegrationTrigger,
      "MANUAL" as IntegrationTrigger,
    ],
    configSchema: {
      output: {
        type: "object",
        properties: {
          apiKey: { type: "string", description: "RWA.xyz API key" },
          assetId: { type: "string", description: "RWA.xyz asset identifier" },
        },
        required: ["apiKey", "assetId"],
      },
    },
    defaultTrigger: "MANUAL" as IntegrationTrigger,
    defaultSchedule: null,
    isAvailableSelfHosted: false,
    bundleKey: "rwa",
  },
];

/** Keys of free integrations that are always available without activation */
export const freeIntegrationKeys = defaultIntegrations
  .filter((i) => i.isFree)
  .map((i) => i.key);

/** Keys of paid integrations that require marketplace activation */
export const paidIntegrationKeys = defaultIntegrations
  .filter((i) => !i.isFree)
  .map((i) => i.key);
