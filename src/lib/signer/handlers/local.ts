// src/lib/signer/handlers/local.ts
import { privateKeyToAccount } from "viem/accounts";
import type { TransactionSerializableEIP1559 } from "viem";
import type { JsonRpcRequest, JsonRpcResponse, SignTransactionParams } from "../types";

function getPrivateKey(): string | undefined {
  return (
    process.env.AVALANCHE_SIGNER_PRIVATE_KEY ||
    process.env.ETHEREUM_SIGNER_PRIVATE_KEY ||
    process.env.BLOCKCHAIN_SIGNER_PRIVATE_KEY
  );
}

function normalizeKey(key: string): `0x${string}` {
  return key.startsWith("0x")
    ? (key as `0x${string}`)
    : (`0x${key}` as `0x${string}`);
}

export async function localSignHandler(
  request: JsonRpcRequest
): Promise<JsonRpcResponse> {
  const key = getPrivateKey();
  if (!key) {
    return {
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "No signer private key configured",
      },
      id: request.id,
    };
  }

  const account = privateKeyToAccount(normalizeKey(key));

  try {
    switch (request.method) {
      case "eth_signTransaction": {
        const params = request.params[0] as SignTransactionParams;
        const tx: TransactionSerializableEIP1559 = {
          type: "eip1559",
          to: params.to as `0x${string}`,
          data: params.data as `0x${string}` | undefined,
          value: params.value ? BigInt(params.value) : undefined,
          chainId: parseInt(params.chainId, 16),
          gas: params.gas ? BigInt(params.gas) : undefined,
          maxFeePerGas: params.maxFeePerGas
            ? BigInt(params.maxFeePerGas)
            : undefined,
          maxPriorityFeePerGas: params.maxPriorityFeePerGas
            ? BigInt(params.maxPriorityFeePerGas)
            : undefined,
          nonce: params.nonce ? parseInt(params.nonce, 16) : undefined,
        };
        const signed = await account.signTransaction(tx);
        return { jsonrpc: "2.0", result: signed, id: request.id };
      }

      case "personal_sign": {
        return {
          jsonrpc: "2.0",
          error: { code: -32601, message: "personal_sign not yet implemented" },
          id: request.id,
        };
      }

      case "eth_accounts":
        return {
          jsonrpc: "2.0",
          result: [account.address],
          id: request.id,
        };

      default:
        return {
          jsonrpc: "2.0",
          error: { code: -32601, message: `Method not supported: ${request.method}` },
          id: request.id,
        };
    }
  } catch (err) {
    return {
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: err instanceof Error ? err.message : "Signing failed",
      },
      id: request.id,
    };
  }
}
