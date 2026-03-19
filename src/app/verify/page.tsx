"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  CheckCircle2,
  XCircle,
  Shield,
  Hash,
  FileJson,
  ChevronDown,
  ChevronRight,
  Info,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Client-side crypto (mirrors src/lib/merkle/hash.ts using Web Crypto)
// ---------------------------------------------------------------------------

async function sha256(data: string): Promise<string> {
  const encoded = new TextEncoder().encode(data);
  const buffer = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function sortObjectKeys(obj: Record<string, unknown>): Record<string, unknown> {
  if (obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) {
    return obj.map((item) =>
      typeof item === "object" && item !== null
        ? sortObjectKeys(item as Record<string, unknown>)
        : item
    ) as unknown as Record<string, unknown>;
  }
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    const value = obj[key];
    sorted[key] =
      typeof value === "object" && value !== null
        ? sortObjectKeys(value as Record<string, unknown>)
        : value;
  }
  return sorted;
}

async function hashLeaf(data: Record<string, unknown>): Promise<string> {
  return sha256(`leaf:${JSON.stringify(sortObjectKeys(data))}`);
}

async function hashNodes(left: string, right: string): Promise<string> {
  const [first, second] = left < right ? [left, right] : [right, left];
  return sha256(`node:${first}${second}`);
}

async function verifyProof(
  leafHash: string,
  proof: { path: string[]; directions: ("left" | "right")[] },
  expectedRoot: string,
): Promise<{ valid: boolean; computedRoot: string }> {
  let currentHash = leafHash;

  for (let i = 0; i < proof.path.length; i++) {
    const sibling = proof.path[i];
    if (proof.directions[i] === "left") {
      currentHash = await hashNodes(sibling, currentHash);
    } else {
      currentHash = await hashNodes(currentHash, sibling);
    }
  }

  return { valid: currentHash === expectedRoot, computedRoot: currentHash };
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const EXAMPLE_JSON = JSON.stringify(
  {
    rootHash: "abc123...",
    leafData: { account: "user-1", balance: 100 },
    proof: {
      path: ["hash1...", "hash2..."],
      directions: ["right", "left"],
    },
  },
  null,
  2,
);

interface VerifyResult {
  valid: boolean;
  leafHash: string;
  computedRoot: string;
  expectedRoot: string;
}

export default function GenericVerifyPage() {
  const [jsonInput, setJsonInput] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const handleVerify = async () => {
    setParseError(null);
    setResult(null);
    setShowDetails(false);

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(jsonInput);
    } catch {
      setParseError("Invalid JSON. Please check the format and try again.");
      return;
    }

    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      setParseError("Input must be a JSON object.");
      return;
    }

    // Validate rootHash
    const rootHash = parsed.rootHash;
    if (typeof rootHash !== "string" || !rootHash.trim()) {
      setParseError('Missing required field "rootHash" (string).');
      return;
    }

    // Validate leafData or leafHash
    const leafData = parsed.leafData as Record<string, unknown> | undefined;
    const leafHashInput = parsed.leafHash as string | undefined;
    if (!leafData && !leafHashInput) {
      setParseError('Missing required field "leafData" (object) or "leafHash" (string).');
      return;
    }

    // Validate proof
    const proof = parsed.proof as { path?: unknown; directions?: unknown } | undefined;
    if (
      !proof ||
      !Array.isArray(proof.path) ||
      !Array.isArray(proof.directions) ||
      proof.path.length !== proof.directions.length ||
      !proof.path.every((p: unknown) => typeof p === "string") ||
      !proof.directions.every((d: unknown) => d === "left" || d === "right")
    ) {
      setParseError(
        'Missing or invalid "proof" field. Expected { path: string[], directions: ("left" | "right")[] } with matching lengths.',
      );
      return;
    }

    setIsVerifying(true);

    try {
      const leafHash = leafHashInput || (await hashLeaf(leafData!));
      const { valid, computedRoot } = await verifyProof(
        leafHash,
        proof as { path: string[]; directions: ("left" | "right")[] },
        rootHash.trim(),
      );

      setResult({
        valid,
        leafHash,
        computedRoot,
        expectedRoot: rootHash.trim(),
      });
    } catch {
      setParseError("Verification failed due to an unexpected error.");
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">
          Merkle Proof Verifier
        </h1>
        <p className="text-slate-500 mt-1">
          Verify that a piece of data is included in a Merkle tree by checking its proof against a known root hash. This tool runs entirely in your browser.
        </p>
      </div>

      {/* Instructions */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Info className="w-4 h-4" />
            How It Works
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-slate-600 space-y-2">
          <p>
            Paste a JSON object containing the <strong>root hash</strong> you want to verify against,
            the <strong>leaf data</strong> (or pre-computed leaf hash), and the <strong>Merkle proof</strong> (sibling hashes and directions).
          </p>
          <p>
            The verifier will hash your leaf data, walk up the proof path computing parent hashes,
            and check whether the result matches the expected root hash.
          </p>
          <div className="pt-2">
            <p className="font-medium text-slate-700 mb-1">Required fields:</p>
            <ul className="list-disc list-inside space-y-0.5 text-slate-500">
              <li>
                <code className="bg-slate-100 px-1 rounded text-xs">rootHash</code> — the Merkle root to verify against
              </li>
              <li>
                <code className="bg-slate-100 px-1 rounded text-xs">leafData</code> — your original data object, <em>or</em>{" "}
                <code className="bg-slate-100 px-1 rounded text-xs">leafHash</code> — a pre-computed leaf hash
              </li>
              <li>
                <code className="bg-slate-100 px-1 rounded text-xs">proof</code> —{" "}
                <code className="bg-slate-100 px-1 rounded text-xs">{"{ path: string[], directions: (\"left\" | \"right\")[] }"}</code>
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* JSON Input */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileJson className="w-4 h-4" />
            Verification Data
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label htmlFor="jsonInput" className="text-sm">
              Paste your verification JSON
            </Label>
            <Textarea
              id="jsonInput"
              placeholder={EXAMPLE_JSON}
              value={jsonInput}
              onChange={(e) => {
                setJsonInput(e.target.value);
                setParseError(null);
              }}
              className="mt-1 font-mono text-sm min-h-[200px]"
            />
          </div>

          {parseError && (
            <Alert variant="destructive">
              <AlertDescription>{parseError}</AlertDescription>
            </Alert>
          )}

          <Button
            onClick={handleVerify}
            disabled={isVerifying || !jsonInput.trim()}
            className="w-full"
          >
            {isVerifying ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                Verifying...
              </>
            ) : (
              <>
                <Shield className="w-4 h-4 mr-2" />
                Verify Proof
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Result */}
      {result && (
        <Card
          className={
            result.valid
              ? "border-green-200 bg-green-50/50"
              : "border-red-200 bg-red-50/50"
          }
        >
          <CardContent className="pt-6">
            <div className="flex items-start gap-4">
              {result.valid ? (
                <CheckCircle2 className="w-8 h-8 text-green-600 flex-shrink-0" />
              ) : (
                <XCircle className="w-8 h-8 text-red-500 flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <h3
                  className={`text-lg font-semibold ${
                    result.valid ? "text-green-800" : "text-red-800"
                  }`}
                >
                  {result.valid
                    ? "Proof Valid — Leaf is included in the tree"
                    : "Proof Invalid — Root hash mismatch"}
                </h3>
                <p
                  className={`text-sm mt-1 ${
                    result.valid ? "text-green-700" : "text-red-600"
                  }`}
                >
                  {result.valid
                    ? "The computed root matches the expected root hash. The data is verified."
                    : "The computed root does not match the expected root hash. The proof or data may be incorrect."}
                </p>

                {/* Hash details */}
                <div className="mt-4 space-y-2 text-sm">
                  <div>
                    <span className="text-slate-500">Leaf Hash:</span>
                    <div className="font-mono text-xs break-all mt-0.5 text-slate-700">
                      {result.leafHash}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Hash className="w-3 h-3 text-slate-400" />
                    <span className="text-slate-500">Expected Root:</span>
                    <span className="font-mono text-xs truncate text-slate-700">
                      {result.expectedRoot}
                    </span>
                  </div>
                  {!result.valid && (
                    <div className="flex items-center gap-1">
                      <Hash className="w-3 h-3 text-red-400" />
                      <span className="text-red-500">Computed Root:</span>
                      <span className="font-mono text-xs truncate text-red-700">
                        {result.computedRoot}
                      </span>
                    </div>
                  )}
                </div>

                {/* Expandable proof walkthrough */}
                <div className="mt-3">
                  <button
                    onClick={() => setShowDetails(!showDetails)}
                    className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
                  >
                    {showDetails ? (
                      <ChevronDown className="w-4 h-4" />
                    ) : (
                      <ChevronRight className="w-4 h-4" />
                    )}
                    {showDetails ? "Hide" : "Show"} proof details
                  </button>

                  {showDetails && (
                    <div className="mt-2 p-3 bg-white rounded border text-xs font-mono space-y-2">
                      <div>
                        <span className="text-slate-500">Leaf hash:</span>
                        <div className="break-all">{result.leafHash}</div>
                      </div>
                      <div>
                        <span className="text-slate-500">Expected root:</span>
                        <div className="break-all">{result.expectedRoot}</div>
                      </div>
                      <div>
                        <span className="text-slate-500">Computed root:</span>
                        <div className={`break-all ${result.valid ? "text-green-700" : "text-red-700"}`}>
                          {result.computedRoot}
                        </div>
                      </div>
                      <div className="pt-1 border-t">
                        <Badge variant={result.valid ? "default" : "destructive"} className="text-xs">
                          {result.valid ? "Match" : "Mismatch"}
                        </Badge>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Footer */}
      <p className="text-xs text-slate-400 text-center">
        All verification happens locally in your browser. No data is sent to any server.
      </p>
    </div>
  );
}
