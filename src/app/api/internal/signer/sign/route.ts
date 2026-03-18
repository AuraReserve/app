// src/app/api/internal/signer/sign/route.ts
import { NextRequest, NextResponse } from "next/server";
import { localSignHandler } from "@/lib/signer/handlers/local";
import type { JsonRpcRequest } from "@/lib/signer/types";

export async function POST(request: NextRequest) {
  // Authenticate with SIGNER_SERVICE_TOKEN (always required)
  const token = process.env.SIGNER_SERVICE_TOKEN;
  if (!token) {
    return NextResponse.json(
      { jsonrpc: "2.0", error: { code: -32000, message: "SIGNER_SERVICE_TOKEN not configured" }, id: null },
      { status: 500 }
    );
  }

  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${token}`) {
    return NextResponse.json(
      { jsonrpc: "2.0", error: { code: -32000, message: "Unauthorized" }, id: null },
      { status: 401 }
    );
  }

  const body: JsonRpcRequest = await request.json();

  if (body.jsonrpc !== "2.0" || !body.method) {
    return NextResponse.json(
      { jsonrpc: "2.0", error: { code: -32600, message: "Invalid request" }, id: body.id ?? null },
      { status: 400 }
    );
  }

  const result = await localSignHandler(body);
  return NextResponse.json(result);
}
