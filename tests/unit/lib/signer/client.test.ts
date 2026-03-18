// tests/unit/lib/signer/client.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

describe("signTransaction", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    delete process.env.SIGNER_SERVICE_URL;
    delete process.env.SIGNER_SERVICE_TOKEN;
  });

  it("sends JSON-RPC request to signer service", async () => {
    process.env.SIGNER_SERVICE_URL = "http://signer:4000/sign";
    process.env.SIGNER_SERVICE_TOKEN = "test-token-123456";

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          jsonrpc: "2.0",
          result: "0xsigned",
          id: 1,
        }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { signTransaction } = await import("@/lib/signer/client");
    const result = await signTransaction({
      to: "0x1234567890abcdef1234567890abcdef12345678",
      chainId: "0xa86a",
      value: "0x0",
    });

    expect(result).toBe("0xsigned");
    expect(mockFetch).toHaveBeenCalledWith(
      "http://signer:4000/sign",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-token-123456",
        }),
      })
    );
  });

  it("throws on JSON-RPC error response", async () => {
    process.env.SIGNER_SERVICE_URL = "http://signer:4000/sign";
    process.env.SIGNER_SERVICE_TOKEN = "test-token-123456";

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            jsonrpc: "2.0",
            error: { code: -32000, message: "Key not found" },
            id: 1,
          }),
      })
    );

    const { signTransaction } = await import("@/lib/signer/client");
    await expect(
      signTransaction({
        to: "0x1234567890abcdef1234567890abcdef12345678",
        chainId: "0xa86a",
      })
    ).rejects.toThrow("Key not found");
  });
});
