/**
 * Blockchain Input Handler
 *
 * Reads token balances and custom contract data from EVM chains (Ethereum, Avalanche)
 * using Viem. Shared by Avalanche and Ethereum integrations with chain config.
 */

import { BaseInputHandler } from "../../base-handler";
import type { InputResult, ValidationResult } from "../../types";
import { createPublicClient, http, formatUnits, parseAbi } from "viem";
import type { Abi } from "viem";

type BlockchainNetwork = "ethereum" | "avalanche";
type BlockchainFetchType = "wallet_balance" | "total_supply" | "contract_read";

interface BlockchainInputConfig {
  blockchain: BlockchainNetwork;
  fetchType: BlockchainFetchType;
  rpcUrl: string;
  tokenAddress: string;
  walletAddress?: string;
  decimals: number;
  abiJson?: string | object;
  functionName?: string;
  functionArgs?: unknown[] | string;
  resultIndex?: number;
}

const ERC20_ABI = parseAbi([
  "function balanceOf(address owner) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
]) as Abi;

function parseAbiJson(value?: string | object): Abi | null {
  if (!value) return null;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? (parsed as Abi) : null;
    } catch {
      return null;
    }
  }
  return Array.isArray(value) ? (value as Abi) : null;
}

function parseFunctionArgs(value?: unknown[] | string): unknown[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function normalizeConfig(config: Record<string, unknown>): BlockchainInputConfig {
  const decimalsRaw = config.decimals;
  const decimals =
    typeof decimalsRaw === "number"
      ? decimalsRaw
      : typeof decimalsRaw === "string" && decimalsRaw.trim().length > 0
        ? Number(decimalsRaw)
        : 18;
  const resultIndexRaw = config.resultIndex;
  const resultIndex =
    typeof resultIndexRaw === "number"
      ? resultIndexRaw
      : typeof resultIndexRaw === "string" && resultIndexRaw.trim().length > 0
        ? Number(resultIndexRaw)
        : undefined;

  return {
    blockchain: (config.blockchain as BlockchainNetwork) || "ethereum",
    fetchType: (config.fetchType as BlockchainFetchType) || "wallet_balance",
    rpcUrl: String(config.rpcUrl || ""),
    tokenAddress: String(config.tokenAddress || ""),
    walletAddress: config.walletAddress ? String(config.walletAddress) : undefined,
    decimals,
    abiJson: config.abiJson as string | object | undefined,
    functionName: config.functionName ? String(config.functionName) : undefined,
    functionArgs: config.functionArgs as unknown[] | string | undefined,
    resultIndex,
  };
}

export class BlockchainInputHandler extends BaseInputHandler {
  key = "blockchain";
  displayName = "Blockchain Input";

  validateConfig(rawConfig: Record<string, unknown>): ValidationResult {
    const config = normalizeConfig(rawConfig);
    const errors: string[] = [];

    if (!["ethereum", "avalanche"].includes(config.blockchain)) {
      errors.push("Blockchain must be 'ethereum' or 'avalanche'");
    }

    if (!["wallet_balance", "total_supply", "contract_read"].includes(config.fetchType)) {
      errors.push("Fetch type must be 'wallet_balance', 'total_supply', or 'contract_read'");
    }

    if (!config.rpcUrl) {
      errors.push("RPC URL is required");
    } else {
      try {
        new URL(config.rpcUrl);
      } catch {
        errors.push("RPC URL must be a valid URL");
      }
    }

    if (config.tokenAddress && !/^0x[a-fA-F0-9]{40}$/.test(config.tokenAddress)) {
      errors.push("Token address must be a valid 0x address");
    }

    if (config.fetchType === "wallet_balance") {
      if (!config.walletAddress || !/^0x[a-fA-F0-9]{40}$/.test(config.walletAddress)) {
        errors.push("Wallet address must be a valid 0x address");
      }
    }

    if (config.fetchType === "total_supply" && !config.tokenAddress) {
      errors.push("Token address is required for total_supply fetch type");
    }

    if (config.fetchType === "contract_read") {
      if (!config.abiJson || !parseAbiJson(config.abiJson)) {
        errors.push("ABI JSON is required for contract_read and must be a JSON array");
      }
      if (!config.functionName) {
        errors.push("Function name is required for contract_read");
      }
      if (config.resultIndex !== undefined && config.resultIndex < 0) {
        errors.push("Result index must be a non-negative number");
      }
    }

    if (typeof config.decimals !== "number" || config.decimals < 0 || config.decimals > 18) {
      errors.push("Decimals must be a number between 0 and 18");
    }

    return errors.length > 0 ? this.invalid(errors) : this.valid();
  }

  async run(rawConfig: Record<string, unknown>): Promise<InputResult> {
    const config = normalizeConfig(rawConfig);
    const validation = this.validateConfig(rawConfig);
    if (!validation.valid) {
      return this.failure(`Invalid blockchain config: ${(validation.errors || []).join(", ")}`);
    }

    try {
      const client = createPublicClient({ transport: http(config.rpcUrl) });

      // Native currency balance (no token address, wallet_balance mode)
      if (config.fetchType === "wallet_balance" && !config.tokenAddress) {
        const balance = await client.getBalance({
          address: config.walletAddress as `0x${string}`,
        });
        const value = Number(formatUnits(balance, config.decimals));
        return { ...this.success("Native currency balance fetched"), value };
      }

      if (config.fetchType === "contract_read") {
        const abi = parseAbiJson(config.abiJson);
        const args = parseFunctionArgs(config.functionArgs);

        const result = await client.readContract({
          address: config.tokenAddress as `0x${string}`,
          abi: abi as Abi,
          functionName: config.functionName as string,
          args,
        });

        let rawValue: unknown = result;
        if (Array.isArray(result)) {
          if (config.resultIndex !== undefined) rawValue = result[config.resultIndex];
          else if (result.length === 1) rawValue = result[0];
          else return this.failure("Contract read returned multiple values. Set resultIndex.");
        }

        if (typeof rawValue !== "bigint" && typeof rawValue !== "number" && typeof rawValue !== "string") {
          return this.failure("Contract read returned a non-numeric value");
        }

        const normalized = typeof rawValue === "bigint" ? rawValue : BigInt(rawValue);
        const value = Number(formatUnits(normalized, config.decimals));
        return { ...this.success("Blockchain contract read succeeded"), value };
      }

      const rawBalance =
        config.fetchType === "total_supply"
          ? await client.readContract({
              address: config.tokenAddress as `0x${string}`,
              abi: ERC20_ABI,
              functionName: "totalSupply",
            })
          : await client.readContract({
              address: config.tokenAddress as `0x${string}`,
              abi: ERC20_ABI,
              functionName: "balanceOf",
              args: [config.walletAddress as `0x${string}`],
            });

      if (typeof rawBalance !== "bigint" && typeof rawBalance !== "number" && typeof rawBalance !== "string") {
        return this.failure("Blockchain fetch returned a non-numeric value");
      }

      const normalizedBalance = typeof rawBalance === "bigint" ? rawBalance : BigInt(rawBalance);
      const value = Number(formatUnits(normalizedBalance, config.decimals));
      return { ...this.success("Blockchain fetch succeeded"), value };
    } catch (error) {
      return this.failure(
        `Blockchain fetch failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }
}

export const blockchainInputHandler = new BlockchainInputHandler();
