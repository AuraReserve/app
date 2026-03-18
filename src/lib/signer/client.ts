// src/lib/signer/client.ts
import type { JsonRpcRequest, JsonRpcResponse, SignTransactionParams } from "./types";

let requestId = 0;

function getSignerUrl(): string {
  return (
    process.env.SIGNER_SERVICE_URL ||
    "http://localhost:3000/api/internal/signer/sign"
  );
}

function getSignerToken(): string {
  return process.env.SIGNER_SERVICE_TOKEN || "";
}

async function jsonRpcCall(
  method: string,
  params: unknown[]
): Promise<unknown> {
  const url = getSignerUrl();
  const token = getSignerToken();

  const body: JsonRpcRequest = {
    jsonrpc: "2.0",
    method,
    params,
    id: ++requestId,
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(
      `Signer service error: ${response.status} ${response.statusText}`
    );
  }

  const data: JsonRpcResponse = await response.json();

  if (data.error) {
    throw new Error(data.error.message);
  }

  return data.result;
}

export async function signTransaction(
  tx: SignTransactionParams
): Promise<string> {
  const result = await jsonRpcCall("eth_signTransaction", [tx]);
  return result as string;
}

export async function personalSign(
  message: string,
  address: string
): Promise<string> {
  const result = await jsonRpcCall("personal_sign", [message, address]);
  return result as string;
}

export async function getAccounts(): Promise<string[]> {
  const result = await jsonRpcCall("eth_accounts", []);
  return result as string[];
}
