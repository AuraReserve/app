"use client";

import React, { useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ChevronDown,
  ChevronRight,
  Hash,
  Layers,
  TreeDeciduous,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MerkleLeaf {
  id: string;
  leafId: string;
  leafHash: string;
  value: number | null;
  leafData: Record<string, unknown> | null;
  leafIndex: number;
}

interface MerkleTreeViewerProps {
  artifactData: Record<string, unknown>;
  leaves?: MerkleLeaf[];
  unit?: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function truncateHash(hash: string, len = 8): string {
  if (hash.length <= len * 2 + 2) return hash;
  return `${hash.slice(0, len)}...${hash.slice(-len)}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MerkleTreeViewer({
  artifactData,
  leaves,
  unit,
}: MerkleTreeViewerProps) {
  const [showTree, setShowTree] = useState(false);
  const [showLeaves, setShowLeaves] = useState(false);

  const merkleRoot = artifactData.merkleRoot as string | undefined;
  const treeData = artifactData.treeData as { levels: string[][] } | undefined;
  const leafCount =
    typeof artifactData.leafCount === "number" ? artifactData.leafCount : null;
  const totalBalance =
    typeof artifactData.totalBalance === "number"
      ? artifactData.totalBalance
      : null;
  const treeDepth =
    typeof artifactData.treeDepth === "number" ? artifactData.treeDepth : null;
  const defaultLeaf = artifactData.defaultLeaf as string | undefined;

  const levels = treeData?.levels;
  const sums = (treeData as { sums?: number[][] } | undefined)?.sums;
  const computedDepth = levels ? levels.length : treeDepth;

  return (
    <div className="space-y-4">
      {/* Summary Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {merkleRoot && (
          <div className="col-span-2 sm:col-span-4 bg-slate-50 border border-slate-200 rounded-lg p-3">
            <p className="text-xs font-medium text-slate-500 mb-1">
              Merkle Root
            </p>
            <p className="font-mono text-sm text-slate-800 break-all">
              {merkleRoot}
            </p>
          </div>
        )}
        {leafCount != null && (
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
            <p className="text-xs font-medium text-slate-500 mb-1">Leaves</p>
            <p className="text-lg font-semibold text-slate-900">
              {leafCount.toLocaleString()}
            </p>
          </div>
        )}
        {totalBalance != null && (
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
            <p className="text-xs font-medium text-slate-500 mb-1">
              Total Balance
            </p>
            <p className="text-lg font-semibold text-slate-900">
              {totalBalance.toLocaleString()}
              {unit && (
                <span className="text-sm font-normal text-slate-500 ml-1">
                  {unit}
                </span>
              )}
            </p>
          </div>
        )}
        {computedDepth != null && (
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
            <p className="text-xs font-medium text-slate-500 mb-1">
              Tree Depth
            </p>
            <p className="text-lg font-semibold text-slate-900">
              {computedDepth}
            </p>
          </div>
        )}
        {defaultLeaf && (
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
            <p className="text-xs font-medium text-slate-500 mb-1">
              Default Leaf
            </p>
            <p className="font-mono text-xs text-slate-700 break-all">
              {truncateHash(defaultLeaf, 12)}
            </p>
          </div>
        )}
      </div>

      {/* Tree Levels Visualization */}
      {levels && levels.length > 0 && (
        <div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 text-sm font-medium text-slate-700"
            onClick={() => setShowTree(!showTree)}
          >
            {showTree ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
            <Layers className="w-4 h-4 text-green-600" />
            Tree Structure ({levels.length} levels)
          </Button>

          {showTree && <TreeLevels levels={levels} sums={sums} unit={unit} />}
        </div>
      )}

      {/* Leaves */}
      {leaves && leaves.length > 0 && (
        <div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 text-sm font-medium text-slate-700"
            onClick={() => setShowLeaves(!showLeaves)}
          >
            {showLeaves ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
            <TreeDeciduous className="w-4 h-4 text-green-600" />
            Leaf Data ({leaves.length} leaves)
          </Button>

          {showLeaves && <LeafTable leaves={leaves} unit={unit} />}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tree Levels
// ---------------------------------------------------------------------------

function TreeLevels({
  levels,
  sums,
  unit,
}: {
  levels: string[][];
  sums?: number[][];
  unit?: string | null;
}) {
  // levels[0] = leaves, levels[last] = root
  // Display root first, then down to leaves
  const reversed = useMemo(() => [...levels].reverse(), [levels]);
  const reversedSums = useMemo(
    () => (sums ? [...sums].reverse() : undefined),
    [sums],
  );

  return (
    <div className="mt-2 space-y-2 overflow-x-auto">
      {reversed.map((level, ri) => {
        const levelIndex = levels.length - 1 - ri;
        const levelSums = reversedSums?.[ri];
        const isRoot = levelIndex === levels.length - 1;
        const isLeafLevel = levelIndex === 0;
        const label = isRoot
          ? "Root"
          : isLeafLevel
            ? "Leaves"
            : `Level ${levelIndex}`;

        return (
          <div key={levelIndex} className="space-y-1">
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className="text-xs font-medium shrink-0"
              >
                {label}
              </Badge>
              <span className="text-xs text-slate-400">
                {level.length} node{level.length !== 1 ? "s" : ""}
              </span>
              {levelSums && isRoot && (
                <span className="text-xs font-medium text-purple-600">
                  Σ {levelSums[0].toLocaleString()}
                  {unit && <span className="text-purple-400 ml-0.5">{unit}</span>}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-1">
              {level.slice(0, 64).map((hash, i) => (
                <span
                  key={i}
                  className={`inline-flex items-center gap-1 font-mono text-xs px-2 py-1 rounded border ${
                    isRoot
                      ? "bg-blue-50 border-blue-200 text-blue-800"
                      : isLeafLevel
                        ? "bg-green-50 border-green-200 text-green-800"
                        : "bg-slate-50 border-slate-200 text-slate-700"
                  }`}
                  title={`${hash}${levelSums ? ` | Sum: ${levelSums[i]}` : ""}`}
                >
                  <Hash className="w-3 h-3 opacity-40" />
                  {truncateHash(hash, 6)}
                  {levelSums && (
                    <span className="text-purple-600 font-semibold ml-1 border-l border-current/20 pl-1">
                      {levelSums[i]?.toLocaleString()}
                    </span>
                  )}
                </span>
              ))}
              {level.length > 64 && (
                <span className="text-xs text-slate-400 px-2 py-1">
                  +{level.length - 64} more
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Leaf Table
// ---------------------------------------------------------------------------

function LeafTable({
  leaves,
  unit,
}: {
  leaves: MerkleLeaf[];
  unit?: string | null;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const sorted = useMemo(
    () => [...leaves].sort((a, b) => a.leafIndex - b.leafIndex),
    [leaves]
  );

  return (
    <div className="mt-2 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-slate-500">
            <th className="pb-2 pr-3 font-medium w-12">#</th>
            <th className="pb-2 pr-3 font-medium">Leaf ID</th>
            <th className="pb-2 pr-3 font-medium">Hash</th>
            <th className="pb-2 pr-3 font-medium text-right">Value</th>
            <th className="pb-2 font-medium w-8"></th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((leaf) => {
            const isExpanded = expanded.has(leaf.id);
            const hasData =
              leaf.leafData && Object.keys(leaf.leafData).length > 0;

            return (
              <React.Fragment key={leaf.id}>
                <tr
                  className={`border-b last:border-0 hover:bg-slate-50 ${hasData ? "cursor-pointer" : ""}`}
                  onClick={hasData ? () => toggle(leaf.id) : undefined}
                >
                  <td className="py-2 pr-3 text-slate-400 font-mono text-xs">
                    {leaf.leafIndex}
                  </td>
                  <td className="py-2 pr-3 text-slate-700 font-mono text-xs">
                    {leaf.leafId}
                  </td>
                  <td
                    className="py-2 pr-3 font-mono text-xs text-slate-500"
                    title={leaf.leafHash}
                  >
                    {truncateHash(leaf.leafHash, 8)}
                  </td>
                  <td className="py-2 pr-3 text-right font-medium text-slate-900">
                    {leaf.value != null ? leaf.value.toLocaleString() : "--"}
                    {unit && leaf.value != null && (
                      <span className="text-slate-400 ml-1 font-normal text-xs">
                        {unit}
                      </span>
                    )}
                  </td>
                  <td className="py-2 text-center">
                    {hasData &&
                      (isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-slate-400" />
                      ))}
                  </td>
                </tr>
                {isExpanded && hasData && (
                  <tr>
                    <td colSpan={5} className="py-2 px-4 bg-slate-50">
                      <pre className="text-xs font-mono text-slate-600 whitespace-pre-wrap overflow-x-auto max-h-48 overflow-y-auto">
                        {JSON.stringify(leaf.leafData, null, 2)}
                      </pre>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
