import { describe, it, expect } from "vitest";
import { sparseMerkleTreeBuilder } from "@/lib/merkle/sparse-merkle-tree";
import { hashLeaf } from "@/lib/merkle/hash";
import type { SparseMerkleTreeResult } from "@/lib/merkle/types";

const entries = [
  { id: "gold-bar-001", data: { serial: "gold-bar-001", weight_oz: 32.15 } },
  { id: "gold-bar-002", data: { serial: "gold-bar-002", weight_oz: 31.80 } },
  { id: "gold-bar-003", data: { serial: "gold-bar-003", weight_oz: 32.00 } },
];

const DEPTH = 8;

describe("sparseMerkleTreeBuilder", () => {
  describe("build", () => {
    it("returns correct leaf count and depth", () => {
      const result = sparseMerkleTreeBuilder.build(entries, {
        depth: DEPTH,
      }) as SparseMerkleTreeResult;

      expect(result.leafCount).toBe(3);
      expect(result.treeDepth).toBe(DEPTH);
    });

    it("uses default depth 160 when not specified", () => {
      const result = sparseMerkleTreeBuilder.build(entries, {}) as SparseMerkleTreeResult;

      expect(result.treeDepth).toBe(160);
    });

    it("aggregates values when valueField provided", () => {
      const result = sparseMerkleTreeBuilder.build(entries, {
        depth: DEPTH,
        valueField: "weight_oz",
      }) as SparseMerkleTreeResult;

      expect(result.totalBalance).toBeCloseTo(32.15 + 31.80 + 32.00);
    });

    it("handles empty entries", () => {
      const result = sparseMerkleTreeBuilder.build([], {
        depth: DEPTH,
      }) as SparseMerkleTreeResult;

      expect(result.leafCount).toBe(0);
      expect(result.totalBalance).toBe(0);
      expect(result.merkleRoot).toBeTruthy();
      expect(result.leaves).toEqual([]);
    });

    it("produces deterministic roots", () => {
      const r1 = sparseMerkleTreeBuilder.build(entries, { depth: DEPTH }) as SparseMerkleTreeResult;
      const r2 = sparseMerkleTreeBuilder.build(entries, { depth: DEPTH }) as SparseMerkleTreeResult;

      expect(r1.merkleRoot).toBe(r2.merkleRoot);
    });

    it("produces different roots for different inputs", () => {
      const r1 = sparseMerkleTreeBuilder.build(entries, { depth: DEPTH }) as SparseMerkleTreeResult;
      const r2 = sparseMerkleTreeBuilder.build(
        [{ id: "silver-bar-001", data: { serial: "silver-bar-001", weight_oz: 100 } }],
        { depth: DEPTH },
      ) as SparseMerkleTreeResult;

      expect(r1.merkleRoot).not.toBe(r2.merkleRoot);
    });

    it("stores only non-empty nodes (far fewer than 2^depth)", () => {
      const result = sparseMerkleTreeBuilder.build(entries, {
        depth: DEPTH,
      }) as SparseMerkleTreeResult;

      const storedNodeCount = Object.keys(result.nodeStore).length;
      const totalPossibleNodes = 2 ** DEPTH; // 256 leaves alone

      expect(storedNodeCount).toBeLessThan(totalPossibleNodes);
      // With 3 leaves in a depth-8 tree, we expect roughly 3 * depth non-default nodes
      // (each leaf creates a path of ~depth nodes, with some sharing)
      expect(storedNodeCount).toBeGreaterThan(0);
      expect(storedNodeCount).toBeLessThan(totalPossibleNodes / 2);
    });
  });

  describe("generateProof (inclusion)", () => {
    it("generates valid inclusion proof for each leaf by ID", () => {
      const result = sparseMerkleTreeBuilder.build(entries, {
        depth: DEPTH,
      }) as SparseMerkleTreeResult;

      for (const entry of entries) {
        const proof = sparseMerkleTreeBuilder.generateProof(
          result as unknown as Record<string, unknown>,
          entry.id,
        );

        expect(proof).not.toBeNull();
        expect(proof!.path.length).toBe(DEPTH);
        expect(proof!.directions.length).toBe(DEPTH);

        const leafHash = hashLeaf(entry.data);
        const valid = sparseMerkleTreeBuilder.verifyProof(
          leafHash,
          proof!,
          result.merkleRoot,
        );
        expect(valid).toBe(true);
      }
    });
  });

  describe("generateProof (non-inclusion)", () => {
    it("proves an absent key does not exist via empty slot", () => {
      const result = sparseMerkleTreeBuilder.build(entries, {
        depth: DEPTH,
      }) as SparseMerkleTreeResult;

      const absentKey = "platinum-bar-999";
      const proof = sparseMerkleTreeBuilder.generateProof(
        result as unknown as Record<string, unknown>,
        absentKey,
      );

      expect(proof).not.toBeNull();
      expect(proof!.path.length).toBe(DEPTH);

      // Non-inclusion: verifying the default leaf hash against the root should succeed
      // because the slot at this key's position is empty
      const valid = sparseMerkleTreeBuilder.verifyProof(
        result.defaultLeaf,
        proof!,
        result.merkleRoot,
      );
      expect(valid).toBe(true);
    });
  });

  describe("verifyProof", () => {
    it("rejects wrong leaf hash", () => {
      const result = sparseMerkleTreeBuilder.build(entries, {
        depth: DEPTH,
      }) as SparseMerkleTreeResult;

      const proof = sparseMerkleTreeBuilder.generateProof(
        result as unknown as Record<string, unknown>,
        entries[0].id,
      )!;

      const valid = sparseMerkleTreeBuilder.verifyProof(
        "0000000000000000000000000000000000000000000000000000000000000000",
        proof,
        result.merkleRoot,
      );
      expect(valid).toBe(false);
    });

    it("rejects wrong root", () => {
      const result = sparseMerkleTreeBuilder.build(entries, {
        depth: DEPTH,
      }) as SparseMerkleTreeResult;

      const proof = sparseMerkleTreeBuilder.generateProof(
        result as unknown as Record<string, unknown>,
        entries[0].id,
      )!;

      const leafHash = hashLeaf(entries[0].data);
      const valid = sparseMerkleTreeBuilder.verifyProof(
        leafHash,
        proof,
        "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
      );
      expect(valid).toBe(false);
    });
  });
});
