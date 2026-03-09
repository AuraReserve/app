import { describe, it, expect } from "vitest";
import {
  validateValueEntry,
  validateMerkleTreeEntry,
  validateMerkleSumTreeEntry,
  validateSparseMerkleTreeEntry,
  validateEntryForArtifactType,
  validateMerkleLeafData,
} from "@/lib/dal/artifact-validation";
import type { CreateEntryInput } from "@/lib/dal/stream-entries";

const base: CreateEntryInput = {
  artifactType: "VALUE",
  submittedBy: "user-1",
};

describe("Artifact type validation", () => {
  describe("validateValueEntry", () => {
    it("passes with a valid numeric value", () => {
      const result = validateValueEntry({ ...base, value: 1000.5 });
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it("fails when value is null", () => {
      const result = validateValueEntry({ ...base, value: null });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("numeric");
    });

    it("fails when value is undefined", () => {
      const result = validateValueEntry({ ...base });
      expect(result.valid).toBe(false);
    });

    it("fails for non-finite values", () => {
      const result = validateValueEntry({ ...base, value: Infinity });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("finite");
    });
  });

  describe("validateMerkleTreeEntry", () => {
    const validArtifactData = {
      merkleRoot: "0xabc123",
      treeData: { nodes: [] },
      leafCount: 100,
    };

    it("passes with valid merkle tree data", () => {
      const result = validateMerkleTreeEntry({
        ...base,
        artifactType: "MERKLE_TREE",
        artifactData: validArtifactData,
      });
      expect(result.valid).toBe(true);
    });

    it("fails when artifactData is missing", () => {
      const result = validateMerkleTreeEntry({
        ...base,
        artifactType: "MERKLE_TREE",
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("artifactData");
    });

    it("fails when merkleRoot is missing", () => {
      const result = validateMerkleTreeEntry({
        ...base,
        artifactType: "MERKLE_TREE",
        artifactData: { ...validArtifactData, merkleRoot: undefined },
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("merkleRoot"))).toBe(true);
    });

    it("fails when leafCount is negative", () => {
      const result = validateMerkleTreeEntry({
        ...base,
        artifactType: "MERKLE_TREE",
        artifactData: { ...validArtifactData, leafCount: -1 },
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("leafCount"))).toBe(true);
    });
  });

  describe("validateMerkleSumTreeEntry", () => {
    const validArtifactData = {
      merkleRoot: "0xabc123",
      treeData: { nodes: [] },
      leafCount: 50,
      totalBalance: 999.99,
    };

    it("passes with valid merkle sum tree data", () => {
      const result = validateMerkleSumTreeEntry({
        ...base,
        artifactType: "MERKLE_SUM_TREE",
        artifactData: validArtifactData,
      });
      expect(result.valid).toBe(true);
    });

    it("fails when totalBalance is missing", () => {
      const { totalBalance: _, ...noBalance } = validArtifactData;
      const result = validateMerkleSumTreeEntry({
        ...base,
        artifactType: "MERKLE_SUM_TREE",
        artifactData: noBalance,
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("totalBalance"))).toBe(true);
    });
  });

  describe("validateSparseMerkleTreeEntry", () => {
    const validArtifactData = {
      merkleRoot: "0xdef456",
      treeDepth: 256,
      defaultLeaf: "0x0000",
    };

    it("passes with valid sparse merkle tree data", () => {
      const result = validateSparseMerkleTreeEntry({
        ...base,
        artifactType: "SPARSE_MERKLE_TREE",
        artifactData: validArtifactData,
      });
      expect(result.valid).toBe(true);
    });

    it("fails when treeDepth is missing", () => {
      const { treeDepth: _, ...noDepth } = validArtifactData;
      const result = validateSparseMerkleTreeEntry({
        ...base,
        artifactType: "SPARSE_MERKLE_TREE",
        artifactData: noDepth,
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("treeDepth"))).toBe(true);
    });

    it("fails when defaultLeaf is missing", () => {
      const { defaultLeaf: _, ...noDefault } = validArtifactData;
      const result = validateSparseMerkleTreeEntry({
        ...base,
        artifactType: "SPARSE_MERKLE_TREE",
        artifactData: noDefault,
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("defaultLeaf"))).toBe(true);
    });

    it("accepts valid sparse merkle tree entry with nodeStore", () => {
      const result = validateSparseMerkleTreeEntry({
        ...base,
        artifactType: "SPARSE_MERKLE_TREE",
        artifactData: {
          ...validArtifactData,
          nodeStore: { "0x01": "0xabc", "0x02": "0xdef" },
        },
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it("rejects sparse merkle tree entry with invalid nodeStore", () => {
      const result = validateSparseMerkleTreeEntry({
        ...base,
        artifactType: "SPARSE_MERKLE_TREE",
        artifactData: {
          ...validArtifactData,
          nodeStore: "not-an-object",
        },
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("nodeStore"))).toBe(true);
    });
  });

  describe("validateEntryForArtifactType", () => {
    it("dispatches to the correct validator", () => {
      const valueResult = validateEntryForArtifactType("VALUE", { ...base, value: 42 });
      expect(valueResult.valid).toBe(true);

      const treeResult = validateEntryForArtifactType("MERKLE_TREE", { ...base });
      expect(treeResult.valid).toBe(false);
    });

    it("accepts uppercase enum keys from Prisma runtime", () => {
      const result = validateEntryForArtifactType(
        "VALUE" as unknown as CreateEntryInput["artifactType"],
        { ...base, value: 42 }
      );
      expect(result.valid).toBe(true);
    });
  });

  describe("validateMerkleLeafData", () => {
    it("rejects leaves missing the configured valueField", () => {
      const leaves = [
        { id: "BAR-001", data: { weight_oz: 400 } },
        { id: "BAR-002", data: { purity: 0.999 } },
      ];
      const result = validateMerkleLeafData(leaves, "weight_oz");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("BAR-002");
      expect(result.error).toContain("weight_oz");
    });

    it("rejects leaves with non-numeric valueField", () => {
      const leaves = [{ id: "BAR-001", data: { weight_oz: "four hundred" } }];
      const result = validateMerkleLeafData(leaves, "weight_oz");
      expect(result.valid).toBe(false);
    });

    it("accepts valid leaves", () => {
      const leaves = [
        { id: "BAR-001", data: { weight_oz: 400, vault: "Zurich" } },
        { id: "BAR-002", data: { weight_oz: 100, vault: "London" } },
      ];
      const result = validateMerkleLeafData(leaves, "weight_oz");
      expect(result.valid).toBe(true);
    });

    it("rejects leaves with missing id", () => {
      const leaves = [{ data: { weight_oz: 400 } }];
      const result = validateMerkleLeafData(leaves, "weight_oz");
      expect(result.valid).toBe(false);
    });

    it("rejects duplicate ids", () => {
      const leaves = [
        { id: "BAR-001", data: { weight_oz: 400 } },
        { id: "BAR-001", data: { weight_oz: 200 } },
      ];
      const result = validateMerkleLeafData(leaves, "weight_oz");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("duplicate");
    });
  });
});
