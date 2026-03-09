/**
 * Artifact Type Validation Helpers
 *
 * Validates entry data shapes based on artifact type before persistence.
 * Each artifact type has specific required fields in the entry data.
 */

import type { ArtifactType } from "@prisma/client";
import type { CreateEntryInput } from "./stream-entries";
import { artifactTypeToLower } from "@/lib/artifact-types";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

function ok(): ValidationResult {
  return { valid: true, errors: [] };
}

function fail(...errors: string[]): ValidationResult {
  return { valid: false, errors };
}

/**
 * Validate a VALUE artifact entry — must have a numeric `value`
 */
export function validateValueEntry(data: CreateEntryInput): ValidationResult {
  const errors: string[] = [];

  if (data.value == null) {
    errors.push("VALUE entries must have a numeric 'value' field");
  } else if (typeof data.value !== "number" || !isFinite(data.value)) {
    errors.push("'value' must be a finite number");
  }

  return errors.length > 0 ? fail(...errors) : ok();
}

/**
 * Validate a MERKLE_TREE artifact entry — must have merkleRoot, treeData, leafCount in artifactData
 */
export function validateMerkleTreeEntry(data: CreateEntryInput): ValidationResult {
  const errors: string[] = [];

  if (!data.artifactData || typeof data.artifactData !== "object" || Array.isArray(data.artifactData)) {
    errors.push("MERKLE_TREE entries must have an 'artifactData' object");
    return fail(...errors);
  }

  const ad = data.artifactData as Record<string, unknown>;

  if (!ad.merkleRoot || typeof ad.merkleRoot !== "string") {
    errors.push("artifactData.merkleRoot must be a non-empty string");
  }

  if (!ad.treeData || typeof ad.treeData !== "object") {
    errors.push("artifactData.treeData must be an object");
  }

  if (typeof ad.leafCount !== "number" || ad.leafCount < 0 || !Number.isInteger(ad.leafCount)) {
    errors.push("artifactData.leafCount must be a non-negative integer");
  }

  return errors.length > 0 ? fail(...errors) : ok();
}

/**
 * Validate a MERKLE_SUM_TREE artifact entry — merkle tree fields + totalBalance + sums
 */
export function validateMerkleSumTreeEntry(data: CreateEntryInput): ValidationResult {
  const treeResult = validateMerkleTreeEntry(data);
  const errors = [...treeResult.errors];

  if (data.artifactData && typeof data.artifactData === "object" && !Array.isArray(data.artifactData)) {
    const ad = data.artifactData as Record<string, unknown>;
    if (typeof ad.totalBalance !== "number" || !isFinite(ad.totalBalance as number)) {
      errors.push("artifactData.totalBalance must be a finite number");
    }

    // Sum tree treeData should include sums array alongside levels
    if (ad.treeData && typeof ad.treeData === "object") {
      const td = ad.treeData as Record<string, unknown>;
      if (td.sums !== undefined && !Array.isArray(td.sums)) {
        errors.push("artifactData.treeData.sums must be an array if provided");
      }
    }
  }

  return errors.length > 0 ? fail(...errors) : ok();
}

/**
 * Validate a SPARSE_MERKLE_TREE artifact entry — must have merkleRoot, treeDepth, defaultLeaf
 */
export function validateSparseMerkleTreeEntry(data: CreateEntryInput): ValidationResult {
  const errors: string[] = [];

  if (!data.artifactData || typeof data.artifactData !== "object" || Array.isArray(data.artifactData)) {
    errors.push("SPARSE_MERKLE_TREE entries must have an 'artifactData' object");
    return fail(...errors);
  }

  const ad = data.artifactData as Record<string, unknown>;

  if (!ad.merkleRoot || typeof ad.merkleRoot !== "string") {
    errors.push("artifactData.merkleRoot must be a non-empty string");
  }

  if (typeof ad.treeDepth !== "number" || ad.treeDepth < 1 || !Number.isInteger(ad.treeDepth)) {
    errors.push("artifactData.treeDepth must be a positive integer");
  }

  if (!ad.defaultLeaf || typeof ad.defaultLeaf !== "string") {
    errors.push("artifactData.defaultLeaf must be a non-empty string");
  }

  if (ad.nodeStore !== undefined && (typeof ad.nodeStore !== "object" || Array.isArray(ad.nodeStore) || ad.nodeStore === null)) {
    errors.push("artifactData.nodeStore must be an object if provided");
  }

  return errors.length > 0 ? fail(...errors) : ok();
}

const validators: Record<string, (data: CreateEntryInput) => ValidationResult> = {
  value: validateValueEntry,
  merkle_tree: validateMerkleTreeEntry,
  merkle_sum_tree: validateMerkleSumTreeEntry,
  sparse_merkle_tree: validateSparseMerkleTreeEntry,
};

/**
 * Validate entry data against its artifact type.
 * Call this before createEntry/createEntryWithLeaves to get user-friendly errors.
 */
export function validateEntryForArtifactType(
  artifactType: ArtifactType,
  data: CreateEntryInput
): ValidationResult {
  const normalizedArtifactType = artifactTypeToLower(artifactType);
  const validator = validators[normalizedArtifactType];
  if (!validator) {
    return fail(`Unknown artifact type: ${artifactType}`);
  }
  return validator(data);
}

// ---------------------------------------------------------------------------
// Leaf validation
// ---------------------------------------------------------------------------

export interface LeafInput {
  id: string;
  data: Record<string, unknown>;
}

export interface LeafValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate merkle leaf data, ensuring each leaf has a unique id, an object `data`
 * field, and a finite numeric value at the specified `valueField` key within `data`.
 */
export function validateMerkleLeafData(
  leaves: unknown[],
  valueField: string,
): LeafValidationResult {
  if (!Array.isArray(leaves) || leaves.length === 0) {
    return { valid: false, error: "Leaves must be a non-empty array" };
  }

  const ids = new Set<string>();
  for (const leaf of leaves) {
    if (!leaf || typeof leaf !== "object") {
      return { valid: false, error: "Each leaf must be an object" };
    }
    const l = leaf as Record<string, unknown>;

    if (!l.id || typeof l.id !== "string") {
      return { valid: false, error: "Each leaf must have a string 'id' field" };
    }
    if (ids.has(l.id)) {
      return { valid: false, error: `Leaf has duplicate id: ${l.id}` };
    }
    ids.add(l.id);

    if (!l.data || typeof l.data !== "object") {
      return { valid: false, error: `Leaf ${l.id}: 'data' must be an object` };
    }
    const data = l.data as Record<string, unknown>;
    const val = data[valueField];
    if (val === undefined || val === null) {
      return { valid: false, error: `Leaf ${l.id}: missing required field '${valueField}' in data` };
    }
    if (typeof val !== "number" || !isFinite(val)) {
      return { valid: false, error: `Leaf ${l.id}: field '${valueField}' must be a finite number` };
    }
  }

  return { valid: true };
}
