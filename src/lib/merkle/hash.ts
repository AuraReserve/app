import { createHash } from "crypto";

export function sha256(data: string): string {
  return createHash("sha256").update(data).digest("hex");
}

export function sortObjectKeys(obj: Record<string, unknown>): Record<string, unknown> {
  if (obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) {
    return obj.map((item) =>
      typeof item === "object" && item !== null
        ? sortObjectKeys(item as Record<string, unknown>)
        : item
    ) as unknown as Record<string, unknown>;
  }
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    const value = obj[key];
    sorted[key] =
      typeof value === "object" && value !== null
        ? sortObjectKeys(value as Record<string, unknown>)
        : value;
  }
  return sorted;
}

export function hashLeaf(data: Record<string, unknown>): string {
  return sha256(`leaf:${JSON.stringify(sortObjectKeys(data))}`);
}

export function hashNodes(left: string, right: string): string {
  const [first, second] = left < right ? [left, right] : [right, left];
  return sha256(`node:${first}${second}`);
}

/** Hash two nodes with their sums committed into the hash (for Merkle Sum Trees) */
export function hashSumNodes(
  leftHash: string,
  leftSum: number,
  rightHash: string,
  rightSum: number,
): string {
  const [firstHash, firstSum, secondHash, secondSum] =
    leftHash < rightHash
      ? [leftHash, leftSum, rightHash, rightSum]
      : [rightHash, rightSum, leftHash, leftSum];
  return sha256(`sumnode:${firstHash}:${firstSum}:${secondHash}:${secondSum}`);
}
