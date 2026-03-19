"use client";

import React, { useState } from "react";
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
  ChevronDown,
  ChevronRight,
  Shield,
  Hash,
  FileJson,
  Clock,
  Layers,
} from "lucide-react";

interface Snapshot {
  id: string;
  timestamp: string;
  merkleRoot: string | null;
  leafCount: number;
}

interface VerificationResult {
  verified: boolean;
  snapshot: {
    rootHash: string | null;
    timestamp: string;
    leafCount: number | null;
    totalBalance: number | null;
  };
  computedLeafHash: string;
  leaf: {
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

const EXAMPLE_LEAF = JSON.stringify(
  { userId: "user_004", balance: 0.01, currency: "BTC" },
  null,
  2,
);

export function VerificationPageClient({
  spaceName,
  spaceApiIdentifier,
  streamName,
  streamSlug,
  artifactType,
  snapshots,
}: VerificationPageClientProps) {
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string>(
    snapshots[0]?.id ?? "__manual",
  );
  const [manualRootHash, setManualRootHash] = useState("");
  const [leafDataInput, setLeafDataInput] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [showProof, setShowProof] = useState(false);

  const isManual = selectedSnapshotId === "__manual";
  const selectedSnapshot = snapshots.find((s) => s.id === selectedSnapshotId);

  const rootHash = isManual
    ? manualRootHash.trim() || null
    : selectedSnapshot?.merkleRoot ?? null;

  const handleVerify = async () => {
    setParseError(null);
    setError(null);
    setResult(null);
    setShowProof(false);

    if (!leafDataInput.trim()) {
      setParseError("Please paste your data as a JSON object.");
      return;
    }

    let data: Record<string, unknown>;
    try {
      const parsed = JSON.parse(leafDataInput);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        setParseError("Data must be a JSON object.");
        return;
      }
      data = parsed;
    } catch {
      setParseError("Invalid JSON. Please check the format and try again.");
      return;
    }

    setIsVerifying(true);

    try {
      const res = await fetch(
        `/api/v1/reserves/${spaceApiIdentifier}/streams/${streamSlug}/verify`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data, rootHash }),
        },
      );

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error ?? `Verification failed (${res.status})`);
        return;
      }

      const body: VerificationResult = await res.json();
      setResult(body);
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
          Paste your data below to cryptographically verify that it is included
          in this reserve&apos;s Merkle tree.
        </p>
        <div className="flex items-center gap-2 mt-2">
          <Badge variant="outline">
            {artifactType.replace(/_/g, " ")}
          </Badge>
          {snapshots.length > 0 && (
            <span className="text-xs text-slate-400">
              {snapshots.length} snapshot{snapshots.length !== 1 && "s"}{" "}
              available
            </span>
          )}
        </div>
      </div>

      {/* Snapshot Selection */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Layers className="w-4 h-4" />
            Snapshot
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {snapshots.length > 0 ? (
            <div className="space-y-2">
              <Label className="text-sm">
                Select a snapshot to verify against
              </Label>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {snapshots.map((snapshot) => (
                  <label
                    key={snapshot.id}
                    className={`flex items-center gap-3 p-2.5 rounded-md border cursor-pointer transition-colors ${
                      selectedSnapshotId === snapshot.id
                        ? "border-blue-300 bg-blue-50"
                        : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    <input
                      type="radio"
                      name="snapshot"
                      value={snapshot.id}
                      checked={selectedSnapshotId === snapshot.id}
                      onChange={() => setSelectedSnapshotId(snapshot.id)}
                      className="accent-blue-600"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 text-sm">
                        <Clock className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                        <span className="text-slate-700">
                          {new Date(snapshot.timestamp).toLocaleDateString(
                            "en-US",
                            {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            },
                          )}
                        </span>
                        <span className="text-xs text-slate-400">
                          {snapshot.leafCount} leaves
                        </span>
                      </div>
                      {snapshot.merkleRoot && (
                        <div className="flex items-center gap-1 mt-0.5">
                          <Hash className="w-3 h-3 text-slate-300 flex-shrink-0" />
                          <span className="font-mono text-xs text-slate-400 truncate">
                            {snapshot.merkleRoot}
                          </span>
                        </div>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-500">
              No snapshots available for this stream.
            </p>
          )}

          {/* Manual root hash option */}
          <div className="pt-2 border-t border-slate-100">
            <label
              className={`flex items-center gap-3 p-2.5 rounded-md border cursor-pointer transition-colors ${
                isManual
                  ? "border-blue-300 bg-blue-50"
                  : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              <input
                type="radio"
                name="snapshot"
                value="__manual"
                checked={isManual}
                onChange={() => setSelectedSnapshotId("__manual")}
                className="accent-blue-600"
              />
              <span className="text-sm text-slate-700">
                Enter root hash manually
              </span>
            </label>
            {isManual && (
              <div className="mt-2">
                <Input
                  placeholder="Paste the Merkle root hash..."
                  value={manualRootHash}
                  onChange={(e) => setManualRootHash(e.target.value)}
                  className="font-mono text-sm"
                />
              </div>
            )}
          </div>

          {/* Show selected root hash */}
          {rootHash && !isManual && (
            <div className="text-xs text-slate-500 flex items-center gap-1">
              <Hash className="w-3 h-3" />
              Root: <span className="font-mono">{rootHash}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Data Input */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileJson className="w-4 h-4" />
            Your Data
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="leafData" className="text-sm">
              Paste your data as JSON
            </Label>
            <Textarea
              id="leafData"
              placeholder={EXAMPLE_LEAF}
              value={leafDataInput}
              onChange={(e) => {
                setLeafDataInput(e.target.value);
                setParseError(null);
              }}
              className="mt-1 font-mono text-sm min-h-[140px]"
            />
            <p className="text-xs text-slate-400 mt-1.5">
              Your data will be hashed and checked against the Merkle tree. If
              even a single value differs, the hash won&apos;t match and
              verification will fail.
            </p>
          </div>

          {parseError && (
            <Alert variant="destructive">
              <AlertDescription>{parseError}</AlertDescription>
            </Alert>
          )}

          <Button
            onClick={handleVerify}
            disabled={isVerifying || !leafDataInput.trim()}
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
                    ? "Verified \u2014 Your data is in the tree"
                    : result.leaf
                      ? "Invalid \u2014 Proof verification failed"
                      : "Not Found \u2014 Hash not in this snapshot"}
                </h3>
                <p
                  className={`text-sm mt-1 ${
                    result.verified ? "text-green-700" : "text-red-600"
                  }`}
                >
                  {result.verified
                    ? `Your data was cryptographically verified against the snapshot from ${new Date(
                        result.snapshot.timestamp,
                      ).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}.`
                    : result.leaf
                      ? "The leaf was found but the Merkle proof could not be verified against the root hash."
                      : "The hash of your data does not match any leaf in this snapshot. Check that your data is exactly correct \u2014 even small differences will produce a different hash."}
                </p>

                {/* Hash details */}
                <div className="mt-4 space-y-2">
                  <div className="text-sm">
                    <span className="text-slate-500">Your data hashes to:</span>
                    <div className="font-mono text-xs break-all mt-0.5 text-slate-700">
                      {result.computedLeafHash}
                    </div>
                  </div>

                  {/* Leaf details (only shown when found) */}
                  {result.leaf && (
                    <>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="text-slate-500">Leaf Index:</span>{" "}
                          <span className="font-mono">
                            {result.leaf.leafIndex}
                          </span>
                        </div>
                        {result.leaf.value !== null && (
                          <div>
                            <span className="text-slate-500">Value:</span>{" "}
                            <span className="font-mono">
                              {result.leaf.value}
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="text-sm">
                        <span className="text-slate-500">Stored Data:</span>
                        <pre className="mt-1 p-2 bg-white rounded border text-xs overflow-x-auto">
                          {JSON.stringify(result.leaf.leafData, null, 2)}
                        </pre>
                      </div>
                    </>
                  )}
                </div>

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
                          <div className="break-all">
                            {result.computedLeafHash}
                          </div>
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
                          <span className="text-slate-500">
                            Expected root:
                          </span>
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
