/**
 * Shared types for store (data stream) and integration data shapes.
 *
 * These types match the API responses from /api/spaces/[spaceId]/stores
 * and /api/spaces/[spaceId]/integrations.
 */

export interface StoreData {
  id: string;
  name: string;
  slug: string;
  artifactType: string;
  assetType: string | null;
  unit: string | null;
  description: string;
  isActive: boolean;
  createdDate: string;
  createdBy?: string;
  entries: Array<{ id: string; value: number | null; timestamp: string; ripcord?: boolean }>;
  _count: { entries: number };
}

export interface EntryData {
  id: string;
  artifactType: string;
  value: number | null;
  artifactData: Record<string, unknown> | null;
  timestamp: string;
  ripcord: boolean;
  ripcordDetails: string[];
  isAutomated: boolean;
  notes: string;
  supportingDocuments: string[];
  submittedBy: string;
  metadata: Record<string, unknown>;
}

/** SpaceIntegration with included relations (full detail, used in plugins page) */
export interface SpaceIntegrationData {
  id: string;
  spaceId: string;
  integrationId: string;
  streamId: string;
  direction: "input" | "output";
  status: "active" | "inactive" | "error";
  config: Record<string, unknown>;
  schedule: string | null;
  trigger: "manual" | "cron" | "on_change" | null;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  createdDate: string;
  accessGroupId: string | null;
  accessGroup: { id: string; name: string } | null;
  integration: {
    id: string;
    key: string;
    displayName: string;
    description: string;
    supportsInput: boolean;
    supportsOutput: boolean;
    isFree: boolean;
    supportedTriggers: string[];
    configSchema: Record<string, unknown>;
  };
  stream: {
    id: string;
    name: string;
    slug: string;
    artifactType: string;
    isActive: boolean;
    valueField: string | null;
  };
}

/** Minimal store data shape (used in plugins page and store-flow-visualization) */
export interface StoreDataMinimal {
  id: string;
  name: string;
  slug: string;
  artifactType: string;
  isActive: boolean;
}
