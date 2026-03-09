import { describe, expect, it } from "vitest";
import { merkleSumTreeBuilder, type MerkleSumProof } from "@/lib/merkle/merkle-sum-tree";
import { merkleTreeBuilder } from "@/lib/merkle/merkle-tree";
import type { LeafEntry, MerkleSumTreeResult } from "@/lib/merkle/types";

const sampleEntries: LeafEntry[] = [
  { id: "a", data: { name: "Gold Bar 1", weight: 100 } },
  { id: "b", data: { name: "Gold Bar 2", weight: 250 } },
  { id: "c", data: { name: "Gold Bar 3", weight: 50 } },
];

describe("merkleSumTreeBuilder", () => {
  describe("build", () => {
    it("throws when valueField is not provided", () => {
      expect(() => merkleSumTreeBuilder.build(sampleEntries, {})).toThrow(
        "valueField is required for merkle sum tree",
      );
    });

    it("throws when valueField is empty string", () => {
      expect(() =>
        merkleSumTreeBuilder.build(sampleEntries, { valueField: "" }),
      ).toThrow("valueField is required for merkle sum tree");
    });

    it("computes correct total balance", () => {
      const result = merkleSumTreeBuilder.build(sampleEntries, {
        valueField: "weight",
      });
      expect(result.totalBalance).toBe(400);
    });

    it("handles entries where valueField is missing from data", () => {
      const entries: LeafEntry[] = [
        { id: "x", data: { name: "No weight" } },
        { id: "y", data: { name: "Has weight", weight: 10 } },
      ];
      const result = merkleSumTreeBuilder.build(entries, {
        valueField: "weight",
      });
      expect(result.totalBalance).toBe(10);
      expect(result.leaves[0].value).toBe(0);
      expect(result.leaves[1].value).toBe(10);
    });

    it("produces DIFFERENT root than standard tree (sums are committed in hashes)", () => {
      const sumResult = merkleSumTreeBuilder.build(sampleEntries, {
        valueField: "weight",
      });
      const stdResult = merkleTreeBuilder.build(sampleEntries, {
        valueField: "weight",
      });
      expect(sumResult.merkleRoot).not.toBe(stdResult.merkleRoot);
      // But leaf count and total should match
      expect(sumResult.leafCount).toBe(stdResult.leafCount);
      expect(sumResult.totalBalance).toBe(stdResult.totalBalance);
    });

    it("returns correct leaf count", () => {
      const result = merkleSumTreeBuilder.build(sampleEntries, {
        valueField: "weight",
      });
      expect(result.leafCount).toBe(3);
    });

    it("handles empty entries with valueField", () => {
      const result = merkleSumTreeBuilder.build([], {
        valueField: "weight",
      });
      expect(result.leafCount).toBe(0);
      expect(result.totalBalance).toBe(0);
      expect(result.leaves).toEqual([]);
    });

    it("stores sums at every level in treeData", () => {
      const result = merkleSumTreeBuilder.build(sampleEntries, {
        valueField: "weight",
      }) as MerkleSumTreeResult;

      const { levels, sums } = result.treeData;
      expect(sums).toBeDefined();
      expect(sums.length).toBe(levels.length);

      // Leaf sums = individual values
      expect(sums[0]).toEqual([100, 250, 50]);

      // Each parent sum = left + right
      // With 3 leaves: odd leaf pairs with phantom (sum 0), so 50+0=50
      expect(sums[1]).toEqual([350, 50]);

      // Root sum = true total (no inflation from odd-leaf duplication)
      expect(sums[2]).toEqual([400]);
    });

    it("produces deterministic root for same input", () => {
      const r1 = merkleSumTreeBuilder.build(sampleEntries, { valueField: "weight" });
      const r2 = merkleSumTreeBuilder.build(sampleEntries, { valueField: "weight" });
      expect(r1.merkleRoot).toBe(r2.merkleRoot);
    });
  });

  describe("generateProof + verifyProof", () => {
    it("generates and verifies valid proof for each leaf", () => {
      const result = merkleSumTreeBuilder.build(sampleEntries, {
        valueField: "weight",
      });

      for (let i = 0; i < result.leaves.length; i++) {
        const proof = merkleSumTreeBuilder.generateProof(
          result.treeData,
          i,
        ) as MerkleSumProof;
        expect(proof).not.toBeNull();
        expect(proof.siblingValues).toBeDefined();
        expect(proof.leafValue).toBe(result.leaves[i].value);

        const valid = merkleSumTreeBuilder.verifyProof(
          result.leaves[i].hash,
          proof,
          result.merkleRoot,
        );
        expect(valid).toBe(true);
      }
    });

    it("rejects proof with wrong root", () => {
      const result = merkleSumTreeBuilder.build(sampleEntries, {
        valueField: "weight",
      });
      const proof = merkleSumTreeBuilder.generateProof(result.treeData, 0);
      expect(proof).not.toBeNull();

      const valid = merkleSumTreeBuilder.verifyProof(
        result.leaves[0].hash,
        proof!,
        "0000000000000000000000000000000000000000000000000000000000000000",
      );
      expect(valid).toBe(false);
    });

    it("rejects proof with wrong leaf hash", () => {
      const result = merkleSumTreeBuilder.build(sampleEntries, {
        valueField: "weight",
      });
      const proof = merkleSumTreeBuilder.generateProof(result.treeData, 0);
      expect(proof).not.toBeNull();

      const valid = merkleSumTreeBuilder.verifyProof(
        "wrong_hash",
        proof!,
        result.merkleRoot,
      );
      expect(valid).toBe(false);
    });

    it("rejects proof without sum data", () => {
      const result = merkleSumTreeBuilder.build(sampleEntries, {
        valueField: "weight",
      });
      // Construct a plain MerkleProof without siblingValues
      const proof = merkleSumTreeBuilder.generateProof(result.treeData, 0)!;
      const plainProof = { path: proof.path, directions: proof.directions };

      const valid = merkleSumTreeBuilder.verifyProof(
        result.leaves[0].hash,
        plainProof,
        result.merkleRoot,
      );
      expect(valid).toBe(false);
    });

    it("returns null for out-of-range leaf index", () => {
      const result = merkleSumTreeBuilder.build(sampleEntries, {
        valueField: "weight",
      });
      const proof = merkleSumTreeBuilder.generateProof(result.treeData, 99);
      expect(proof).toBeNull();
    });
  });
});
