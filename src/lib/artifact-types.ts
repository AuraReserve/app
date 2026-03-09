import { ArtifactType } from "@prisma/client";

type ArtifactTypeKey = keyof typeof ArtifactType;
type ArtifactTypeEntry = { key: ArtifactTypeKey; value: ArtifactType };

const ARTIFACT_TYPE_ENTRIES = Object.entries(ArtifactType) as Array<[ArtifactTypeKey, ArtifactType]>;

const ARTIFACT_TYPE_LOOKUP = new Map<string, ArtifactTypeEntry>(
  ARTIFACT_TYPE_ENTRIES.flatMap(([key, value]) => [
    [key.toLowerCase(), { key, value }] as const,
    [String(value).toLowerCase(), { key, value }] as const,
  ])
);

const MERKLE_ARTIFACT_TYPE_ALIASES = new Set([
  "merkle_tree",
  "merkle_sum_tree",
  "sparse_merkle_tree",
]);

export function normalizeArtifactType(value: unknown): ArtifactType | null {
  if (typeof value !== "string") return null;
  const entry = ARTIFACT_TYPE_LOOKUP.get(value.toLowerCase());
  return entry ? (entry.key as unknown as ArtifactType) : null;
}

export function requireArtifactType(value: unknown, fieldName = "artifactType"): ArtifactType {
  const normalized = toPrismaArtifactType(value);
  if (!normalized) {
    throw new Error(`Invalid ${fieldName}: ${String(value)}`);
  }
  return normalized;
}

export function toPrismaArtifactType(value: unknown): ArtifactType | null {
  if (typeof value !== "string") return null;
  // Prisma v7 mapped enum bug (prisma/prisma#28894): query engine expects
  // unmapped uppercase names ("VALUE"), not the @map'd lowercase ("value").
  const entry = ARTIFACT_TYPE_LOOKUP.get(value.toLowerCase());
  return entry ? (entry.key as unknown as ArtifactType) : null;
}

export function isArtifactType(value: unknown): value is ArtifactType {
  return normalizeArtifactType(value) !== null;
}

export function artifactTypeToLower(value: unknown): string {
  return String(value ?? "").toLowerCase();
}

export function isMerkleArtifactType(value: unknown): boolean {
  return MERKLE_ARTIFACT_TYPE_ALIASES.has(artifactTypeToLower(value));
}

export function getArtifactTypeValues(): ArtifactType[] {
  return ARTIFACT_TYPE_ENTRIES.map(([, value]) => value);
}

// ── Shared UI constants for artifact types ──────────────────────────

/** Full human-readable labels for artifact types */
export const ARTIFACT_LABELS: Record<string, string> = {
  value: "Simple Value",
  merkle_tree: "Merkle Tree",
  merkle_sum_tree: "Merkle Sum Tree",
  sparse_merkle_tree: "Sparse Merkle Tree",
};

/** Short labels suitable for compact UI (badges in flow diagrams, activity feeds) */
export const ARTIFACT_LABELS_SHORT: Record<string, string> = {
  value: "Simple Value",
  merkle_tree: "Merkle",
  merkle_sum_tree: "Sum Tree",
  sparse_merkle_tree: "Sparse",
};

/** Badge colors (background + text) for artifact types */
export const ARTIFACT_BADGE_COLORS: Record<string, string> = {
  value: "bg-blue-100 text-blue-800",
  merkle_tree: "bg-green-100 text-green-800",
  merkle_sum_tree: "bg-purple-100 text-purple-800",
  sparse_merkle_tree: "bg-amber-100 text-amber-800",
};

/** Border + background colors for artifact type cards/containers */
export const ARTIFACT_BORDER_COLORS: Record<string, string> = {
  value: "border-blue-200 bg-blue-50",
  merkle_tree: "border-green-200 bg-green-50",
  merkle_sum_tree: "border-purple-200 bg-purple-50",
  sparse_merkle_tree: "border-amber-200 bg-amber-50",
};

/** Select options for artifact type dropdowns */
export const ARTIFACT_OPTIONS = [
  { value: "value", label: "Simple Value" },
  { value: "merkle_tree", label: "Merkle Tree" },
  { value: "merkle_sum_tree", label: "Merkle Sum Tree" },
  { value: "sparse_merkle_tree", label: "Sparse Merkle Tree" },
];

/** Status indicator dot colors */
export const STATUS_DOT_COLORS: Record<string, string> = {
  active: "text-green-500",
  inactive: "text-slate-300",
  error: "text-red-500",
};
