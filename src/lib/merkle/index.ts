/**
 * Merkle module — public API
 *
 * Re-exports types, hash utilities, and individual builders.
 * Provides a registry that maps artifact type strings to builders,
 * plus backwards-compatible aliases for the old monolithic merkle.ts API.
 */

import { merkleTreeBuilder } from "./merkle-tree";
import { merkleSumTreeBuilder } from "./merkle-sum-tree";
import { sparseMerkleTreeBuilder } from "./sparse-merkle-tree";
import type { TreeBuilder } from "./types";

// Re-export types
export type {
  TreeBuilder,
  LeafEntry,
  BuildOptions,
  LeafResult,
  MerkleProof,
  BuildResult,
  MerkleTreeResult,
  MerkleSumTreeResult,
  SparseMerkleTreeResult,
} from "./types";

// Re-export hash utilities
export { sha256, hashLeaf, hashNodes, hashSumNodes, sortObjectKeys } from "./hash";

// Re-export individual builders
export { merkleTreeBuilder } from "./merkle-tree";
export { merkleSumTreeBuilder, type MerkleSumProof } from "./merkle-sum-tree";
export { sparseMerkleTreeBuilder } from "./sparse-merkle-tree";

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const builders: Record<string, TreeBuilder> = {
  merkle_tree: merkleTreeBuilder,
  merkle_sum_tree: merkleSumTreeBuilder,
  sparse_merkle_tree: sparseMerkleTreeBuilder,
};

export function getBuilder(artifactType: string): TreeBuilder {
  const normalized = String(artifactType).toLowerCase();
  const builder = builders[normalized];
  if (!builder) {
    throw new Error(
      `No tree builder registered for artifact type: ${artifactType}`,
    );
  }
  return builder;
}

export function hasBuilder(artifactType: string): boolean {
  return String(artifactType).toLowerCase() in builders;
}

// ---------------------------------------------------------------------------
// Backwards-compatible aliases (match old src/lib/merkle.ts signatures)
// ---------------------------------------------------------------------------

export function buildMerkleTreeFromLeaves(
  entries: Array<{ id: string; data: Record<string, unknown> }>,
  valueField: string,
) {
  return merkleTreeBuilder.build(entries, { valueField });
}

export function generateMerkleProof(
  treeData: { levels: string[][] },
  leafIndex: number,
) {
  return merkleTreeBuilder.generateProof(
    treeData as unknown as Record<string, unknown>,
    leafIndex,
  );
}

export function verifyMerkleProof(
  leafHash: string,
  proof: { path: string[]; directions: ("left" | "right")[] },
  expectedRoot: string,
) {
  return merkleTreeBuilder.verifyProof(leafHash, proof, expectedRoot);
}
