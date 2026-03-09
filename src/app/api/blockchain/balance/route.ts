import { NextResponse } from "next/server";
import { createPublicClient, http, parseAbi, formatUnits } from "viem";

const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;
const ERC20_ABI = parseAbi([
  "function balanceOf(address owner) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
]);

interface BalanceRequest {
  rpcUrl?: unknown;
  walletAddress?: unknown;
  tokenAddress?: unknown;
  decimals?: unknown;
  fetchType?: unknown;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as BalanceRequest;
    const rpcUrl = typeof body.rpcUrl === "string" ? body.rpcUrl.trim() : "";
    const walletAddress = typeof body.walletAddress === "string" ? body.walletAddress.trim() : "";
    const tokenAddress = typeof body.tokenAddress === "string" ? body.tokenAddress.trim() : "";
    const fetchType = typeof body.fetchType === "string" ? body.fetchType : "wallet_balance";
    const decimalsOverride = typeof body.decimals === "number" ? body.decimals : undefined;

    if (!rpcUrl) {
      return NextResponse.json({ error: "rpcUrl is required" }, { status: 400 });
    }

    try {
      const parsed = new URL(rpcUrl);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return NextResponse.json({ error: "rpcUrl must use http or https" }, { status: 400 });
      }
    } catch {
      return NextResponse.json({ error: "rpcUrl must be a valid URL" }, { status: 400 });
    }

    if (fetchType === "wallet_balance" && !walletAddress) {
      return NextResponse.json({ error: "walletAddress is required for wallet_balance" }, { status: 400 });
    }

    if (walletAddress && !ADDRESS_REGEX.test(walletAddress)) {
      return NextResponse.json({ error: "walletAddress must be a valid 0x address" }, { status: 400 });
    }

    if (tokenAddress && !ADDRESS_REGEX.test(tokenAddress)) {
      return NextResponse.json({ error: "tokenAddress must be a valid 0x address" }, { status: 400 });
    }

    const client = createPublicClient({ transport: http(rpcUrl) });

    // Native currency balance (no token address)
    if (!tokenAddress && fetchType === "wallet_balance") {
      const balance = await client.getBalance({
        address: walletAddress as `0x${string}`,
      });
      const formatted = formatUnits(balance, decimalsOverride ?? 18);
      return NextResponse.json({
        balance: formatted,
        rawBalance: balance.toString(),
        decimals: decimalsOverride ?? 18,
        isNative: true,
      });
    }

    // ERC-20 token balance or total supply
    if (tokenAddress) {
      // Get decimals from contract if not overridden
      let decimals = decimalsOverride;
      let symbol: string | undefined;
      if (decimals === undefined) {
        try {
          decimals = Number(
            await client.readContract({
              address: tokenAddress as `0x${string}`,
              abi: ERC20_ABI,
              functionName: "decimals",
            })
          );
        } catch {
          decimals = 18;
        }
      }
      try {
        symbol = (await client.readContract({
          address: tokenAddress as `0x${string}`,
          abi: ERC20_ABI,
          functionName: "symbol",
        })) as string;
      } catch {
        // symbol is optional
      }

      if (fetchType === "total_supply") {
        const supply = await client.readContract({
          address: tokenAddress as `0x${string}`,
          abi: ERC20_ABI,
          functionName: "totalSupply",
        });
        const formatted = formatUnits(supply as bigint, decimals);
        return NextResponse.json({
          balance: formatted,
          rawBalance: (supply as bigint).toString(),
          decimals,
          symbol,
          isNative: false,
        });
      }

      // wallet_balance with token
      const balance = await client.readContract({
        address: tokenAddress as `0x${string}`,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [walletAddress as `0x${string}`],
      });
      const formatted = formatUnits(balance as bigint, decimals);
      return NextResponse.json({
        balance: formatted,
        rawBalance: (balance as bigint).toString(),
        decimals,
        symbol,
        isNative: false,
      });
    }

    return NextResponse.json({ error: "Invalid request parameters" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: `Failed to fetch balance: ${message}` }, { status: 502 });
  }
}
