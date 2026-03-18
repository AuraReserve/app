/**
 * Blockchain Output Handler
 *
 * Writes PoR values or merkle roots to smart contracts on EVM chains.
 * Shared by Avalanche and Ethereum integrations with chain config.
 */

import { BaseOutputHandler } from "../../base-handler";
import type { ExecutionResult, StoreEntryContext, ValidationResult } from "../../types";
import { createPublicClient, encodeFunctionData, http, parseAbi, parseUnits } from "viem";
import { avalanche, mainnet } from "viem/chains";
import {
  getDefaultChainId,
  getDefaultRpcUrl,
  type SupportedBlockchain,
} from "@/lib/blockchain";
import type { ArtifactType } from "@prisma/client";

interface BlockchainOutputConfig {
  blockchain?: SupportedBlockchain;
  rpcUrl: string;
  chainId: number;
  contractAddress: string;
  writeMode: "merkle_root" | "por_value";
  valueDecimals?: number;
}

const AGGREGATOR_ORACLE_ABI = parseAbi([
  "function writeRound(int256 answer)",
]);

const MERKLE_ORACLE_ABI = parseAbi([
  "function writeSnapshot(bytes32 merkleRoot, uint8 treeType, uint256 totalSum, uint256 leafCount, string metadata)",
]);

/** Maps app ArtifactType to contract TreeType enum value */
function artifactTypeToTreeType(artifactType: ArtifactType): number {
  switch (artifactType) {
    case "MERKLE_TREE":
      return 0; // Standard
    case "MERKLE_SUM_TREE":
      return 1; // SumTree
    case "SPARSE_MERKLE_TREE":
      return 2; // SparseMerkle
    default:
      return 0;
  }
}

const DEFAULT_DECIMALS = 18;
const GAS_LIMIT_BUFFER_PERCENT = 20n; // 20% buffer on estimated gas

async function estimateGas(
  client: ReturnType<typeof createPublicClient>,
  tx: { from: `0x${string}`; to: `0x${string}`; data: `0x${string}` }
): Promise<{ gas: string; maxFeePerGas: string; maxPriorityFeePerGas: string }> {
  const [gasEstimate, fees] = await Promise.all([
    client.estimateGas({ account: tx.from, to: tx.to, data: tx.data }),
    client.estimateFeesPerGas(),
  ]);

  const gasWithBuffer = gasEstimate + (gasEstimate * GAS_LIMIT_BUFFER_PERCENT) / 100n;

  return {
    gas: `0x${gasWithBuffer.toString(16)}`,
    maxFeePerGas: `0x${(fees.maxFeePerGas ?? 0n).toString(16)}`,
    maxPriorityFeePerGas: `0x${(fees.maxPriorityFeePerGas ?? 0n).toString(16)}`,
  };
}

function normalizeRoot(root: string): `0x${string}` | null {
  const normalized = root.startsWith("0x") ? root : `0x${root}`;
  if (!/^0x[a-fA-F0-9]{64}$/.test(normalized)) return null;
  return normalized as `0x${string}`;
}

function normalizeConfig(config: Record<string, unknown>): BlockchainOutputConfig {
  const blockchain =
    config.blockchain === "ethereum" || config.blockchain === "avalanche"
      ? (config.blockchain as SupportedBlockchain)
      : "avalanche";

  const rpcUrl =
    typeof config.rpcUrl === "string" && config.rpcUrl.trim().length > 0
      ? config.rpcUrl
      : (getDefaultRpcUrl(blockchain) ?? "");

  const chainId =
    typeof config.chainId === "number" && Number.isFinite(config.chainId)
      ? config.chainId
      : (getDefaultChainId(blockchain) ?? 43114);

  return {
    blockchain,
    rpcUrl,
    chainId,
    contractAddress: String(config.contractAddress ?? ""),
    writeMode: config.writeMode === "merkle_root" ? "merkle_root" : "por_value",
    valueDecimals:
      typeof config.valueDecimals === "number" && Number.isFinite(config.valueDecimals)
        ? config.valueDecimals
        : undefined,
  };
}

export class BlockchainOutputHandler extends BaseOutputHandler {
  key = "blockchain";
  displayName = "Blockchain Output";

  validateConfig(config: Record<string, unknown>): ValidationResult {
    const normalized = normalizeConfig(config);
    const errors: string[] = [];

    try {
      new URL(normalized.rpcUrl);
    } catch {
      errors.push("RPC URL must be a valid URL");
    }

    if (!/^0x[a-fA-F0-9]{40}$/.test(normalized.contractAddress)) {
      errors.push("Contract address must be a valid 0x address");
    }

    if (typeof normalized.chainId !== "number" || normalized.chainId <= 0) {
      errors.push("Chain ID must be a positive number");
    }

    if (
      normalized.valueDecimals !== undefined &&
      (typeof normalized.valueDecimals !== "number" || normalized.valueDecimals < 0 || normalized.valueDecimals > 36)
    ) {
      errors.push("Value decimals must be between 0 and 36");
    }

    return errors.length > 0 ? this.invalid(errors) : this.valid();
  }

  async run(
    rawConfig: Record<string, unknown>,
    context: StoreEntryContext
  ): Promise<ExecutionResult> {
    const config = normalizeConfig(rawConfig);
    const validation = this.validateConfig(rawConfig);
    if (!validation.valid) {
      return this.failure(
        `Invalid blockchain output config: ${(validation.errors || []).join(", ")}`
      );
    }

    const chainBase = config.blockchain === "ethereum" ? mainnet : avalanche;
    const chain = {
      ...chainBase,
      id: config.chainId,
      rpcUrls: {
        ...chainBase.rpcUrls,
        default: { ...chainBase.rpcUrls.default, http: [config.rpcUrl] },
      },
    };
    const publicClient = createPublicClient({ chain, transport: http(config.rpcUrl) });

    const { signTransaction, getAccounts } = await import("@/lib/signer/client");

    try {
      // Resolve signer address for gas estimation
      const accounts = await getAccounts();
      const from = accounts[0] as `0x${string}` | undefined;
      if (!from) {
        return this.failure("No signer account available");
      }

      if (config.writeMode === "por_value") {
        const entryValue = context.entry.value;
        if (entryValue === null || entryValue === undefined) {
          return this.failure("Stream entry has no value for PoR write mode");
        }

        const decimals = config.valueDecimals ?? DEFAULT_DECIMALS;
        const answer = parseUnits(entryValue.toString(), decimals);
        const calldata = encodeFunctionData({
          abi: AGGREGATOR_ORACLE_ABI,
          functionName: "writeRound",
          args: [answer],
        });

        const gasParams = await estimateGas(publicClient, {
          from,
          to: config.contractAddress as `0x${string}`,
          data: calldata,
        });

        const signedTx = await signTransaction({
          to: config.contractAddress,
          data: calldata,
          chainId: `0x${config.chainId.toString(16)}`,
          ...gasParams,
        });
        const txHash = await publicClient.sendRawTransaction({ serializedTransaction: signedTx as `0x${string}` });
        const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

        return this.success(
          "PoR value written to blockchain",
          { value: entryValue, decimals, unit: context.unit },
          { txHash, receipt }
        );
      }

      // merkle_root mode → MerkleOracle.writeSnapshot
      const artifactData = context.entry.artifactData;
      if (!artifactData) {
        return this.failure("Stream entry has no artifact data for merkle write mode");
      }

      const merkleRoot = normalizeRoot(String(artifactData.merkleRoot || ""));
      if (!merkleRoot) return this.failure("Invalid merkle root format in entry artifact data");

      const treeType = artifactTypeToTreeType(context.artifactType);

      const leafCount = typeof artifactData.leafCount === "number"
        ? artifactData.leafCount
        : 0;
      if (leafCount === 0) {
        return this.failure("Leaf count must be greater than 0");
      }

      // totalSum must be 0 for Standard and SparseMerkle tree types
      const isSumTree = treeType === 1;
      const totalSum = isSumTree && typeof artifactData.totalBalance === "number"
        ? artifactData.totalBalance
        : 0;

      const totalSumUnits = parseUnits(
        totalSum.toString(),
        config.valueDecimals ?? DEFAULT_DECIMALS
      );

      const metadata = typeof artifactData.metadata === "string"
        ? artifactData.metadata
        : JSON.stringify(artifactData.metadata ?? {});

      const calldata = encodeFunctionData({
        abi: MERKLE_ORACLE_ABI,
        functionName: "writeSnapshot",
        args: [merkleRoot, treeType, totalSumUnits, BigInt(leafCount), metadata],
      });

      const gasParams = await estimateGas(publicClient, {
        from,
        to: config.contractAddress as `0x${string}`,
        data: calldata,
      });

      const signedTx = await signTransaction({
        to: config.contractAddress,
        data: calldata,
        chainId: `0x${config.chainId.toString(16)}`,
        ...gasParams,
      });
      const txHash = await publicClient.sendRawTransaction({ serializedTransaction: signedTx as `0x${string}` });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

      return this.success(
        "Merkle snapshot written to blockchain",
        { merkleRoot, treeType, totalSum, leafCount, metadata },
        { txHash, receipt }
      );
    } catch (error) {
      return this.failure(
        `Blockchain output failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }
}

export const blockchainOutputHandler = new BlockchainOutputHandler();
