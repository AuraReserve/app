/**
 * Standard Merkle Tree Builder
 *
 * Implements the TreeBuilder interface for standard binary merkle trees.
 * Port of the original src/lib/merkle.ts logic using shared hash utilities.
 */

import { sha256, hashLeaf, hashNodes } from "./hash";
import type {
  TreeBuilder,
  LeafEntry,
  BuildOptions,
  MerkleTreeResult,
  MerkleProof,
  LeafResult,
} from "./types";

function buildTree(
  entries: LeafEntry[],
  options: BuildOptions,
): MerkleTreeResult {
  if (entries.length === 0) {
    const emptyHash = sha256("empty");
    return {
      merkleRoot: emptyHash,
      treeData: { levels: [[emptyHash]] },
      leafCount: 0,
      totalBalance: 0,
      leaves: [],
    };
  }

  const valueField = options.valueField;

  const leaves: LeafResult[] = entries.map((entry) => ({
    id: entry.id,
    hash: hashLeaf(entry.data),
    value:
      valueField && typeof entry.data[valueField] === "number"
        ? (entry.data[valueField] as number)
        : 0,
    data: entry.data,
  }));

  const levels: string[][] = [leaves.map((l) => l.hash)];
  let currentLevel = levels[0];

  while (currentLevel.length > 1) {
    const nextLevel: string[] = [];
    for (let i = 0; i < currentLevel.length; i += 2) {
      const left = currentLevel[i];
      const right = currentLevel[i + 1] || currentLevel[i]; // duplicate odd leaf
      nextLevel.push(hashNodes(left, right));
    }
    levels.push(nextLevel);
    currentLevel = nextLevel;
  }

  const totalBalance = leaves.reduce((sum, l) => sum + l.value, 0);

  return {
    merkleRoot: currentLevel[0],
    treeData: { levels },
    leafCount: leaves.length,
    totalBalance,
    leaves,
  };
}

function generateProof(
  treeData: Record<string, unknown>,
  leafIdentifier: string | number,
): MerkleProof | null {
  const levels = (treeData as { levels: string[][] }).levels;
  if (!levels || levels.length === 0) return null;

  const leafIndex =
    typeof leafIdentifier === "string"
      ? parseInt(leafIdentifier, 10)
      : leafIdentifier;

  if (isNaN(leafIndex) || leafIndex < 0 || leafIndex >= levels[0].length) {
    return null;
  }

  const path: string[] = [];
  const directions: ("left" | "right")[] = [];
  let idx = leafIndex;

  // Single-leaf tree: the leaf is its own sibling
  if (levels.length === 1) {
    path.push(levels[0][idx]);
    directions.push("right");
    return { path, directions };
  }

  for (let level = 0; level < levels.length - 1; level++) {
    const currentLevel = levels[level];
    const isRight = idx % 2 === 1;
    const siblingIdx = isRight ? idx - 1 : idx + 1;
    const sibling =
      siblingIdx < currentLevel.length
        ? currentLevel[siblingIdx]
        : currentLevel[idx];

    path.push(sibling);
    directions.push(isRight ? "left" : "right");
    idx = Math.floor(idx / 2);
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

export const merkleTreeBuilder = {
  build: buildTree,
  generateProof,
  verifyProof,
} satisfies TreeBuilder;
