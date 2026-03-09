import { NextResponse } from "next/server";
import { createPublicClient, http, parseAbi } from "viem";

const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;
const ERC20_DECIMALS_ABI = parseAbi(["function decimals() view returns (uint8)"]);

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { rpcUrl?: unknown; tokenAddress?: unknown };
    const rpcUrl = typeof body.rpcUrl === "string" ? body.rpcUrl.trim() : "";
    const tokenAddress = typeof body.tokenAddress === "string" ? body.tokenAddress.trim() : "";

    if (!rpcUrl || !tokenAddress) {
      return NextResponse.json({ error: "rpcUrl and tokenAddress are required" }, { status: 400 });
    }

    try {
      const parsed = new URL(rpcUrl);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return NextResponse.json({ error: "rpcUrl must use http or https" }, { status: 400 });
      }
    } catch {
      return NextResponse.json({ error: "rpcUrl must be a valid URL" }, { status: 400 });
    }

    if (!ADDRESS_REGEX.test(tokenAddress)) {
      return NextResponse.json({ error: "tokenAddress must be a valid 0x address" }, { status: 400 });
    }

    const client = createPublicClient({ transport: http(rpcUrl) });
    const decimals = await client.readContract({
      address: tokenAddress as `0x${string}`,
      abi: ERC20_DECIMALS_ABI,
      functionName: "decimals",
    });

    const normalizedDecimals = Number(decimals);
    if (!Number.isInteger(normalizedDecimals) || normalizedDecimals < 0 || normalizedDecimals > 255) {
      return NextResponse.json({ error: "Invalid decimals value returned by contract" }, { status: 422 });
    }

    return NextResponse.json({ decimals: normalizedDecimals });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: `Failed to fetch decimals: ${message}` }, { status: 502 });
  }
}
