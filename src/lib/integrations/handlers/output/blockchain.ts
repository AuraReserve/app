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

interface BlockchainOutputConfig {
  blockchain?: SupportedBlockchain;
  rpcUrl: string;
  chainId: number;
  contractAddress: string;
  writeMode: "merkle_root" | "por_value";
  valueDecimals?: number;
}

const AURA_RESERVE_ORACLE_ABI = parseAbi([
  "function writeValue(uint256 value, string unit)",
  "function writeMerkle(bytes32 merkleRoot, uint256 totalBalance, uint256 leafCount, string unit)",
]);

const DEFAULT_DECIMALS = 18;

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

    const { signTransaction } = await import("@/lib/signer/client");

    try {
      if (config.writeMode === "por_value") {
        const entryValue = context.entry.value;
        if (entryValue === null || entryValue === undefined) {
          return this.failure("Stream entry has no value for PoR write mode");
        }

        const value = parseUnits(entryValue.toString(), config.valueDecimals ?? DEFAULT_DECIMALS);
        const data = encodeFunctionData({
          abi: AURA_RESERVE_ORACLE_ABI,
          functionName: "writeValue",
          args: [value, context.unit],
        });
        const signedTx = await signTransaction({
          to: config.contractAddress,
          data,
          chainId: `0x${config.chainId.toString(16)}`,
        });
        const txHash = await publicClient.sendRawTransaction({ serializedTransaction: signedTx as `0x${string}` });
        const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

        return this.success(
          "PoR value written to blockchain",
          { value: entryValue, unit: context.unit },
          { txHash, receipt }
        );
      }

      // merkle_root mode
      const artifactData = context.entry.artifactData;
      if (!artifactData) {
        return this.failure("Stream entry has no artifact data for merkle write mode");
      }

      const merkleRoot = normalizeRoot(String(artifactData.merkleRoot || ""));
      if (!merkleRoot) return this.failure("Invalid merkle root format in entry artifact data");

      const totalBalance = typeof artifactData.totalBalance === "number"
        ? artifactData.totalBalance
        : 0;
      const leafCount = typeof artifactData.leafCount === "number"
        ? artifactData.leafCount
        : 0;

      const totalBalanceUnits = parseUnits(
        totalBalance.toString(),
        config.valueDecimals ?? DEFAULT_DECIMALS
      );

      const data = encodeFunctionData({
        abi: AURA_RESERVE_ORACLE_ABI,
        functionName: "writeMerkle",
        args: [merkleRoot, totalBalanceUnits, BigInt(leafCount), context.unit],
      });
      const signedTx = await signTransaction({
        to: config.contractAddress,
        data,
        chainId: `0x${config.chainId.toString(16)}`,
      });
      const txHash = await publicClient.sendRawTransaction({ serializedTransaction: signedTx as `0x${string}` });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

      return this.success(
        "Merkle root written to blockchain",
        { merkleRoot, totalBalance, leafCount, unit: context.unit },
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
