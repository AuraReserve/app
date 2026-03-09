/**
 * Shared interfaces for the modular merkle tree system.
 *
 * Each tree type (standard, sum, sparse) implements TreeBuilder.
 * Adding a new tree type = implement this interface + register in index.ts.
 */

export interface LeafEntry {
  id: string;
  data: Record<string, unknown>;
}

export interface BuildOptions {
  valueField?: string;
  depth?: number;
}

export interface LeafResult {
  id: string;
  hash: string;
  value: number;
  data: Record<string, unknown>;
}

export interface MerkleProof {
  path: string[];
  directions: ("left" | "right")[];
}

export interface MerkleTreeResult {
  merkleRoot: string;
  treeData: { levels: string[][] };
  leafCount: number;
  totalBalance: number;
  leaves: LeafResult[];
}

/** Merkle sum tree — each node commits to both hash and sum */
export interface MerkleSumTreeResult {
  merkleRoot: string;
  treeData: { levels: string[][]; sums: number[][] };
  leafCount: number;
  totalBalance: number;
  leaves: LeafResult[];
}

export interface SparseMerkleTreeResult {
  merkleRoot: string;
  treeDepth: number;
  defaultLeaf: string;
  leafCount: number;
  totalBalance: number;
  nodeStore: Record<string, string>;
  leaves: LeafResult[];
}

export type BuildResult = MerkleTreeResult | MerkleSumTreeResult | SparseMerkleTreeResult;

export interface TreeBuilder {
  build(entries: LeafEntry[], options: BuildOptions): BuildResult;
  generateProof(treeData: Record<string, unknown>, leafIdentifier: string | number): MerkleProof | null;
  verifyProof(leafHash: string, proof: MerkleProof, expectedRoot: string): boolean;
}
