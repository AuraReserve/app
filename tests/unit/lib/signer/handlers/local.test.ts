// tests/unit/lib/signer/handlers/local.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("viem/accounts", () => ({
  privateKeyToAccount: vi.fn().mockReturnValue({
    address: "0xTestAddress",
    signTransaction: vi.fn().mockResolvedValue("0xSignedTx"),
  }),
}));

describe("localSignHandler", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.AVALANCHE_SIGNER_PRIVATE_KEY;
    delete process.env.ETHEREUM_SIGNER_PRIVATE_KEY;
    delete process.env.BLOCKCHAIN_SIGNER_PRIVATE_KEY;
  });

  it("signs transaction using env private key", async () => {
    process.env.AVALANCHE_SIGNER_PRIVATE_KEY = "0x" + "ab".repeat(32);
    const { localSignHandler } = await import("@/lib/signer/handlers/local");
    const result = await localSignHandler({
      jsonrpc: "2.0",
      method: "eth_signTransaction",
      params: [{ to: "0x" + "00".repeat(20), chainId: "0xa86a" }],
      id: 1,
    });

    expect(result.result).toBe("0xSignedTx");
  });

  it("returns eth_accounts with signer address", async () => {
    process.env.AVALANCHE_SIGNER_PRIVATE_KEY = "0x" + "ab".repeat(32);
    const { localSignHandler } = await import("@/lib/signer/handlers/local");
    const result = await localSignHandler({
      jsonrpc: "2.0",
      method: "eth_accounts",
      params: [],
      id: 1,
    });

    expect(result.result).toEqual(["0xTestAddress"]);
  });

  it("returns error when no private key configured", async () => {
    const { localSignHandler } = await import("@/lib/signer/handlers/local");
    const result = await localSignHandler({
      jsonrpc: "2.0",
      method: "eth_signTransaction",
      params: [{ to: "0x" + "00".repeat(20), chainId: "0xa86a" }],
      id: 1,
    });

    expect(result.error).toBeDefined();
    expect(result.error?.message).toContain("No signer private key");
  });
});
