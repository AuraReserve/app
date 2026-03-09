/**
 * Sparse Merkle Tree Builder
 *
 * A fixed-depth tree where leaf position is determined by hashing the leaf ID.
 * Only non-empty nodes are stored. Supports both inclusion and non-inclusion proofs.
 *
 * Key properties:
 * - Tree depth is configurable (default 160)
 * - Leaf index = first `depth` bits of sha256(leafId) (MSBs)
 * - Empty slots use precomputed default hashes
 * - Node store: Map keyed by "level:hexIndex"
 * - Non-inclusion proofs: proving a key does NOT exist (empty slot)
 */

import { sha256, hashLeaf, hashNodes } from "./hash";
import type {
  TreeBuilder,
  LeafEntry,
  BuildOptions,
  SparseMerkleTreeResult,
  MerkleProof,
  LeafResult,
} from "./types";

// Cache default hashes by depth to avoid recomputation
const defaultHashesCache = new Map<number, string[]>();

/**
 * Compute default hashes for each level of an empty sparse tree.
 * defaultHashes[0] = sha256("sparse:empty") (leaf level)
 * defaultHashes[n] = hashNodes(defaultHashes[n-1], defaultHashes[n-1])
 */
function getDefaultHashes(depth: number): string[] {
  const cached = defaultHashesCache.get(depth);
  if (cached) return cached;

  const defaults: string[] = new Array(depth + 1);
  defaults[0] = sha256("sparse:empty");
  for (let i = 1; i <= depth; i++) {
    defaults[i] = hashNodes(defaults[i - 1], defaults[i - 1]);
  }

  defaultHashesCache.set(depth, defaults);
  return defaults;
}

/**
 * Compute the leaf index (bigint) from a leaf ID string.
 * Takes the first `depth` bits (MSBs) of sha256(leafId).
 */
function leafIndex(leafId: string, depth: number): bigint {
  const hash = sha256(leafId);
  const fullBigInt = BigInt("0x" + hash);
  // sha256 is 256 bits. Keep the top `depth` bits by shifting right.
  const shift = 256 - depth;
  return fullBigInt >> BigInt(shift);
}

function buildTree(
  entries: LeafEntry[],
  options: BuildOptions,
): SparseMerkleTreeResult {
  const depth = options.depth ?? 160;
  const defaultHashes = getDefaultHashes(depth);
  const valueField = options.valueField;

  if (entries.length === 0) {
    return {
      merkleRoot: defaultHashes[depth],
      treeDepth: depth,
      defaultLeaf: defaultHashes[0],
      leafCount: 0,
      totalBalance: 0,
      nodeStore: {},
      leaves: [],
    };
  }

  // Build leaves and place them at their sparse positions
  const nodeStore = new Map<string, string>();
  const leaves: LeafResult[] = [];

  for (const entry of entries) {
    const hash = hashLeaf(entry.data);
    const value =
      valueField && typeof entry.data[valueField] === "number"
        ? (entry.data[valueField] as number)
        : 0;

    leaves.push({ id: entry.id, hash, value, data: entry.data });

    const idx = leafIndex(entry.id, depth);
    const key = `0:${idx.toString(16)}`;
    nodeStore.set(key, hash);
  }

  // Propagate up level by level. We only need to process indices
  // that have non-default values at each level.
  // Collect the set of parent indices that need updating at each level.
  let currentIndices = new Set<bigint>();
  for (const entry of entries) {
    currentIndices.add(leafIndex(entry.id, depth));
  }

  for (let level = 0; level < depth; level++) {
    const parentIndices = new Set<bigint>();

    for (const idx of currentIndices) {
      const parentIdx = idx >> 1n;
      parentIndices.add(parentIdx);
    }

    for (const parentIdx of parentIndices) {
      const leftIdx = parentIdx * 2n;
      const rightIdx = parentIdx * 2n + 1n;

      const leftKey = `${level}:${leftIdx.toString(16)}`;
      const rightKey = `${level}:${rightIdx.toString(16)}`;

      const leftHash = nodeStore.get(leftKey) ?? defaultHashes[level];
      const rightHash = nodeStore.get(rightKey) ?? defaultHashes[level];

      const parentHash = hashNodes(leftHash, rightHash);
      const parentKey = `${level + 1}:${parentIdx.toString(16)}`;

      // Only store non-default nodes
      if (parentHash !== defaultHashes[level + 1]) {
        nodeStore.set(parentKey, parentHash);
      }
    }

    currentIndices = parentIndices;
  }

  // Root is at level=depth, index=0
  const rootKey = `${depth}:0`;
  const merkleRoot = nodeStore.get(rootKey) ?? defaultHashes[depth];

  // Convert nodeStore to plain object for serialization
  const nodeStoreObj: Record<string, string> = {};
  for (const [k, v] of nodeStore) {
    nodeStoreObj[k] = v;
  }

  const totalBalance = leaves.reduce((sum, l) => sum + l.value, 0);

  return {
    merkleRoot,
    treeDepth: depth,
    defaultLeaf: defaultHashes[0],
    leafCount: leaves.length,
    totalBalance,
    nodeStore: nodeStoreObj,
    leaves,
  };
}

function generateProof(
  treeData: Record<string, unknown>,
  leafIdentifier: string | number,
): MerkleProof | null {
  const data = treeData as {
    nodeStore: Record<string, string>;
    treeDepth: number;
  };
  const { nodeStore, treeDepth: depth } = data;
  if (!nodeStore || depth == null) return null;

  const defaultHashes = getDefaultHashes(depth);
  const leafId = String(leafIdentifier);
  const idx = leafIndex(leafId, depth);

  const path: string[] = [];
  const directions: ("left" | "right")[] = [];

  let currentIdx = idx;

  for (let level = 0; level < depth; level++) {
    const isRight = currentIdx % 2n === 1n;
    const siblingIdx = isRight ? currentIdx - 1n : currentIdx + 1n;

    const siblingKey = `${level}:${siblingIdx.toString(16)}`;
    const siblingHash = nodeStore[siblingKey] ?? defaultHashes[level];

    path.push(siblingHash);
    directions.push(isRight ? "left" : "right");

    currentIdx = currentIdx >> 1n;
  }

  return { path, directions };
}

function verifyProof(
  leafHash: string,
  proof: MerkleProof,
  expectedRoot: string,
): boolean {
  let currentHash = leafHash;

  for (let i = 0; i < proof.path.length; i++) {
    const sibling = proof.path[i];
    if (proof.directions[i] === "left") {
      currentHash = hashNodes(sibling, currentHash);
    } else {
      currentHash = hashNodes(currentHash, sibling);
    }
  }

  return currentHash === expectedRoot;
}

export const sparseMerkleTreeBuilder = {
  build: buildTree,
  generateProof,
  verifyProof,
} satisfies TreeBuilder;
