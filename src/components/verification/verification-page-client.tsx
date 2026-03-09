"use client";

import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import {
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronRight,
  Shield,
  Hash,
  FileJson,
} from "lucide-react";

interface Snapshot {
  id: string;
  timestamp: string;
  merkleRoot: string | null;
  leafCount: number;
}

interface VerificationResult {
  verified: boolean;
  dataMatch: boolean | null;
  snapshot: {
    rootHash: string | null;
    timestamp: string;
    leafCount: number | null;
    totalBalance: number | null;
  };
  leaf: {
    leafId: string;
    leafHash: string;
    leafIndex: number;
    leafData: Record<string, unknown>;
    value: number | null;
  } | null;
  proof: {
    path: string[];
    directions: ("left" | "right")[];
  } | null;
}

interface VerificationPageClientProps {
  spaceName: string;
  spaceApiIdentifier: string;
  streamName: string;
  streamSlug: string;
  artifactType: string;
  snapshots: Snapshot[];
}

const EXAMPLE_JSON = JSON.stringify(
  { leafId: "your-id", rootHash: "abc123...", expectedData: { balance: 100 } },
  null,
  2
);

export function VerificationPageClient({
  spaceName,
  spaceApiIdentifier,
  streamName,
  streamSlug,
  artifactType,
  snapshots,
}: VerificationPageClientProps) {
  const [jsonInput, setJsonInput] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [showProof, setShowProof] = useState(false);

  const latestSnapshot = snapshots[0] ?? null;

  const handleVerify = async () => {
    setParseError(null);
    setError(null);
    setResult(null);
    setShowProof(false);

    // Parse JSON input
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

    const leafId = parsed.leafId;
    if (typeof leafId !== "string" || !leafId.trim()) {
      setParseError('Missing required field "leafId" (string).');
      return;
    }

    const rootHash = typeof parsed.rootHash === "string" ? parsed.rootHash : null;
    const expectedData =
      parsed.expectedData && typeof parsed.expectedData === "object" && !Array.isArray(parsed.expectedData)
        ? (parsed.expectedData as Record<string, unknown>)
        : null;

    setIsVerifying(true);

    try {
      const res = await fetch(
        `/api/v1/reserves/${spaceApiIdentifier}/streams/${streamSlug}/verify`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ leafId: leafId.trim(), rootHash, expectedData }),
        }
      );

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? `Verification failed (${res.status})`);
        return;
      }

      const data: VerificationResult = await res.json();
      setResult(data);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
          <span>{spaceName}</span>
          <span>/</span>
          <span>{streamName}</span>
        </div>
        <h1 className="text-2xl font-semibold text-slate-900">
          Verify Your Data
        </h1>
        <p className="text-slate-500 mt-1">
          Verify that your data is included in this reserve&apos;s Merkle tree proof.
        </p>
        <div className="flex items-center gap-2 mt-2">
          <Badge variant="outline">
            {artifactType.replace(/_/g, " ")}
          </Badge>
          {latestSnapshot && (
            <span className="text-xs text-slate-400">
              Latest snapshot: {new Date(latestSnapshot.timestamp).toLocaleDateString("en-US", {
                year: "numeric",
                month: "short",
                day: "numeric",
              })} ({latestSnapshot.leafCount} leaves)
            </span>
          )}
        </div>
      </div>

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
              className="mt-1 font-mono text-sm min-h-[140px]"
            />
            <p className="text-xs text-slate-400 mt-1.5">
              Required: <code className="bg-slate-100 px-1 rounded">leafId</code>.
              Optional: <code className="bg-slate-100 px-1 rounded">rootHash</code> (defaults to latest snapshot),{" "}
              <code className="bg-slate-100 px-1 rounded">expectedData</code> (verifies your data matches).
            </p>
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
                Verify
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Error */}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Result */}
      {result && (
        <Card
          className={
            result.verified
              ? "border-green-200 bg-green-50/50"
              : "border-red-200 bg-red-50/50"
          }
        >
          <CardContent className="pt-6">
            <div className="flex items-start gap-4">
              {result.verified ? (
                <CheckCircle2 className="w-8 h-8 text-green-600 flex-shrink-0" />
              ) : (
                <XCircle className="w-8 h-8 text-red-500 flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <h3
                  className={`text-lg font-semibold ${
                    result.verified ? "text-green-800" : "text-red-800"
                  }`}
                >
                  {result.verified
                    ? "Verified \u2014 Your data is included"
                    : "Not Found"}
                </h3>
                <p
                  className={`text-sm mt-1 ${
                    result.verified ? "text-green-700" : "text-red-600"
                  }`}
                >
                  {result.verified
                    ? `Your entry was found in the snapshot from ${new Date(
                        result.snapshot.timestamp
                      ).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}.`
                    : "Your entry was not found in the selected snapshot."}
                </p>

                {/* Data match indicator */}
                {result.dataMatch !== null && (
                  <div className="mt-3">
                    {result.dataMatch ? (
                      <Badge className="bg-green-100 text-green-800 border-green-200">
                        Data matches your expected values
                      </Badge>
                    ) : (
                      <Badge variant="destructive">
                        Data does NOT match your expected values
                      </Badge>
                    )}
                  </div>
                )}

                {/* Leaf details */}
                {result.leaf && (
                  <div className="mt-4 space-y-2">
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-slate-500">Leaf ID:</span>{" "}
                        <span className="font-mono">{result.leaf.leafId}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Leaf Index:</span>{" "}
                        <span className="font-mono">{result.leaf.leafIndex}</span>
                      </div>
                      {result.leaf.value !== null && (
                        <div>
                          <span className="text-slate-500">Value:</span>{" "}
                          <span className="font-mono">{result.leaf.value}</span>
                        </div>
                      )}
                    </div>

                    <div className="text-sm">
                      <span className="text-slate-500">Leaf Hash:</span>
                      <div className="font-mono text-xs break-all mt-0.5 text-slate-700">
                        {result.leaf.leafHash}
                      </div>
                    </div>

                    <div className="text-sm">
                      <span className="text-slate-500">Stored Data:</span>
                      <pre className="mt-1 p-2 bg-white rounded border text-xs overflow-x-auto">
                        {JSON.stringify(result.leaf.leafData, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}

                {/* Snapshot info */}
                <div className="mt-4 pt-3 border-t border-slate-200 text-sm text-slate-500">
                  <div className="flex items-center gap-1">
                    <Hash className="w-3 h-3" />
                    <span>Root:</span>
                    <span className="font-mono text-xs truncate">
                      {result.snapshot.rootHash}
                    </span>
                  </div>
                </div>

                {/* Expandable proof section */}
                {result.proof && (
                  <div className="mt-3">
                    <button
                      onClick={() => setShowProof(!showProof)}
                      className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
                    >
                      {showProof ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )}
                      {showProof ? "Hide" : "Show"} full Merkle proof
                    </button>

                    {showProof && (
                      <div className="mt-2 p-3 bg-white rounded border text-xs font-mono space-y-2">
                        <div>
                          <span className="text-slate-500">Leaf hash:</span>
                          <div className="break-all">{result.leaf?.leafHash}</div>
                        </div>
                        <div className="text-slate-500 font-sans text-xs">
                          Proof path ({result.proof.path.length} levels):
                        </div>
                        {result.proof.path.map((hash, i) => (
                          <div key={i} className="flex gap-2">
                            <span className="text-slate-400 w-24 flex-shrink-0">
                              Level {i} ({result.proof!.directions[i]}):
                            </span>
                            <span className="break-all">{hash}</span>
                          </div>
                        ))}
                        <div className="pt-2 border-t">
                          <span className="text-slate-500">Expected root:</span>
                          <div className="break-all">
                            {result.snapshot.rootHash}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
