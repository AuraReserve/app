/**
 * Merkle Sum Tree Builder
 *
 * A real Merkle Sum Tree where each internal node commits to both the hash
 * and the sum of its children. This means sums are cryptographically bound
 * at every level — you can verify the total balance at the root and prove
 * any individual leaf's contribution to that total.
 *
 * Node hash = hash(leftHash + leftSum + rightHash + rightSum)
 * Node sum  = leftSum + rightSum
 *
 * This produces DIFFERENT roots than the standard Merkle tree because
 * sums are embedded in every hash.
 */

import { sha256, hashLeaf, hashSumNodes } from "./hash";
import type {
  TreeBuilder,
  LeafEntry,
  BuildOptions,
  MerkleSumTreeResult,
  MerkleProof,
  LeafResult,
} from "./types";

function buildTree(
  entries: LeafEntry[],
  options: BuildOptions,
): MerkleSumTreeResult {
  if (!options.valueField) {
    throw new Error("valueField is required for merkle sum tree");
  }

  const valueField = options.valueField;

  if (entries.length === 0) {
    const emptyHash = sha256("empty");
    return {
      merkleRoot: emptyHash,
      treeData: { levels: [[emptyHash]], sums: [[0]] },
      leafCount: 0,
      totalBalance: 0,
      leaves: [],
    };
  }

  const leaves: LeafResult[] = entries.map((entry) => ({
    id: entry.id,
    hash: hashLeaf(entry.data),
    value: typeof entry.data[valueField] === "number"
      ? (entry.data[valueField] as number)
      : 0,
    data: entry.data,
  }));

  const levels: string[][] = [leaves.map((l) => l.hash)];
  const sums: number[][] = [leaves.map((l) => l.value)];

  let currentHashes = levels[0];
  let currentSums = sums[0];

  while (currentHashes.length > 1) {
    const nextHashes: string[] = [];
    const nextSums: number[] = [];

    for (let i = 0; i < currentHashes.length; i += 2) {
      const leftHash = currentHashes[i];
      const leftSum = currentSums[i];
      // Odd node: duplicate hash for tree structure, but use sum 0
      // to avoid inflating the total
      const rightHash = currentHashes[i + 1] ?? currentHashes[i];
      const rightSum = currentSums[i + 1] ?? 0;

      nextHashes.push(hashSumNodes(leftHash, leftSum, rightHash, rightSum));
      nextSums.push(leftSum + rightSum);
    }

    levels.push(nextHashes);
    sums.push(nextSums);
    currentHashes = nextHashes;
    currentSums = nextSums;
  }

  // totalBalance is the true sum of leaf values (not the tree root sum,
  // which may include duplicated odd leaves in the cryptographic structure)
  const totalBalance = leaves.reduce((sum, l) => sum + l.value, 0);

  return {
    merkleRoot: currentHashes[0],
    treeData: { levels, sums },
    leafCount: leaves.length,
    totalBalance,
    leaves,
  };
}

export interface MerkleSumProof extends MerkleProof {
  leafValue: number;
  siblingValues: number[];
}

function generateProof(
  treeData: Record<string, unknown>,
  leafIdentifier: string | number,
): MerkleSumProof | null {
  const data = treeData as { levels?: string[][]; sums?: number[][] };
  const { levels, sums } = data;
  if (!levels || !sums || levels.length === 0) return null;

  const leafIndex =
    typeof leafIdentifier === "string"
      ? parseInt(leafIdentifier, 10)
      : leafIdentifier;

  if (isNaN(leafIndex) || leafIndex < 0 || leafIndex >= levels[0].length) {
    return null;
  }

  const path: string[] = [];
  const directions: ("left" | "right")[] = [];
  const siblingValues: number[] = [];
  let idx = leafIndex;

  const leafValue = sums[0][leafIndex];

  if (levels.length === 1) {
    path.push(levels[0][idx]);
    directions.push("right");
    siblingValues.push(sums[0][idx]);
    return { path, directions, leafValue, siblingValues };
  }

  for (let level = 0; level < levels.length - 1; level++) {
    const currentLevel = levels[level];
    const currentSums = sums[level];
    const isRight = idx % 2 === 1;
    const siblingIdx = isRight ? idx - 1 : idx + 1;

    const sibling = siblingIdx < currentLevel.length
      ? currentLevel[siblingIdx]
      : currentLevel[idx];
    // Phantom sibling (odd node) has sum 0, matching build behavior
    const siblingSum = siblingIdx < currentSums.length
      ? currentSums[siblingIdx]
      : 0;

    path.push(sibling);
    directions.push(isRight ? "left" : "right");
    siblingValues.push(siblingSum);
    idx = Math.floor(idx / 2);
  }

  return { path, directions, leafValue, siblingValues };
}

function verifyProof(
  leafHash: string,
  proof: MerkleProof,
  expectedRoot: string,
): boolean {
  const sumProof = proof as MerkleSumProof;
  if (!Array.isArray(sumProof.siblingValues) || sumProof.leafValue == null) {
    return false;
  }

  let currentHash = leafHash;
  let currentSum = sumProof.leafValue;

  for (let i = 0; i < proof.path.length; i++) {
    const sibling = proof.path[i];
    const siblingSum = sumProof.siblingValues[i];

    if (proof.directions[i] === "left") {
      currentHash = hashSumNodes(sibling, siblingSum, currentHash, currentSum);
    } else {
      currentHash = hashSumNodes(currentHash, currentSum, sibling, siblingSum);
    }
    currentSum = currentSum + siblingSum;
  }

  return currentHash === expectedRoot;
}

export const merkleSumTreeBuilder = {
  build: buildTree,
  generateProof,
  verifyProof,
} satisfies TreeBuilder;
