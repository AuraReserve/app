import { describe, expect, it } from "vitest";
import {
  artifactTypeToLower,
  isMerkleArtifactType,
  normalizeArtifactType,
  toPrismaArtifactType,
} from "@/lib/artifact-types";

describe("artifact type helpers", () => {
  it("normalizes lowercase values and uppercase enum keys", () => {
    const lower = normalizeArtifactType("value");
    const upper = normalizeArtifactType("VALUE");

    expect(lower).toBeTruthy();
    expect(upper).toBe(lower);
  });

  it("maps aliases to Prisma unmapped enum keys for query engine", () => {
    expect(toPrismaArtifactType("value")).toBe("VALUE");
    expect(toPrismaArtifactType("VALUE")).toBe("VALUE");
    expect(toPrismaArtifactType("merkle_tree")).toBe("MERKLE_TREE");
  });

  it("identifies merkle artifact types regardless of case", () => {
    expect(isMerkleArtifactType("MERKLE_TREE")).toBe(true);
    expect(isMerkleArtifactType("merkle_sum_tree")).toBe(true);
    expect(isMerkleArtifactType("VALUE")).toBe(false);
  });

  it("normalizes artifact type strings for validation dispatch", () => {
    expect(artifactTypeToLower("VALUE")).toBe("value");
    expect(artifactTypeToLower("merkle_tree")).toBe("merkle_tree");
  });
});
