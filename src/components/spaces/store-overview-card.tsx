"use client";

import React, { memo } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Database,
  Hash,
  TreeDeciduous,
  AlertTriangle,
  Plus,
  Clock,
  History,
  Shield,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ARTIFACT_LABELS, ARTIFACT_BADGE_COLORS } from "@/lib/artifact-types";

// Matches the return shape of getSpaceStores() DAL function
export interface StoreOverviewData {
  id: string;
  name: string;
  slug: string;
  artifactType: string;
  assetType: string | null;
  unit: string | null;
  isActive: boolean;
  entries: Array<{
    id: string;
    value: number | null;
    timestamp: string | Date;
    ripcord: boolean;
  }>;
  _count: {
    entries: number;
  };
}

interface StoreOverviewCardProps {
  stream: StoreOverviewData;
  spaceSlug: string;
  className?: string;
  /** Integration ID to link "Add Entry" directly to the input form */
  integrationId?: string;
}

const ARTIFACT_COLORS = ARTIFACT_BADGE_COLORS;

function ArtifactIcon({ type }: { type: string }) {
  switch (type) {
    case "merkle_tree":
    case "merkle_sum_tree":
    case "sparse_merkle_tree":
      return <TreeDeciduous className="w-5 h-5 text-green-600" />;
    default:
      return <Shield className="w-5 h-5 text-blue-600" />;
  }
}

export const StoreOverviewCard = memo(function StoreOverviewCard({
  stream,
  spaceSlug,
  className,
  integrationId,
}: StoreOverviewCardProps) {
  const latestEntry = stream.entries[0] ?? null;
  const entryCount = stream._count.entries;
  const artifactKey = stream.artifactType.toLowerCase();
  const isMerkleType = artifactKey !== "value";

  return (
    <Card className={`shadow-sm border-slate-200 hover:border-slate-300 transition-colors h-full ${className ?? ""}`}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-base">
          <div className="flex items-center gap-2 min-w-0">
            <ArtifactIcon type={artifactKey} />
            <span className="truncate">{stream.name}</span>
          </div>
          <Badge className={`text-xs shrink-0 ${ARTIFACT_COLORS[artifactKey] ?? "bg-slate-100 text-slate-800"}`}>
            {ARTIFACT_LABELS[artifactKey] ?? stream.artifactType}
          </Badge>
        </CardTitle>
        {(stream.assetType || stream.unit) && (
          <p className="text-xs text-slate-500">
            {[stream.assetType, stream.unit].filter(Boolean).join(" \u00B7 ")}
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {latestEntry ? (
          <>
            {/* Latest value */}
            {latestEntry.value != null ? (
              <div>
                <p className="text-4xl font-bold text-slate-900">
                  {latestEntry.value.toLocaleString()}
                </p>
                {stream.unit && (
                  <p className="text-sm text-slate-500 font-medium">{stream.unit}</p>
                )}
              </div>
            ) : isMerkleType ? (
              <div className="flex items-center gap-2">
                <Hash className="w-4 h-4 text-slate-400" />
                <span className="text-lg font-semibold text-slate-700">
                  {entryCount} {entryCount === 1 ? "snapshot" : "snapshots"}
                </span>
              </div>
            ) : (
              <div>
                <p className="text-4xl font-bold text-slate-400">&mdash;</p>
                {stream.unit && (
                  <p className="text-sm text-slate-500 font-medium">{stream.unit}</p>
                )}
              </div>
            )}

            {/* Entry count + last updated */}
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="flex items-center gap-1">
                <Database className="w-3 h-3" />
                {entryCount} {entryCount === 1 ? "entry" : "entries"}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {formatDistanceToNow(new Date(latestEntry.timestamp), {
                  addSuffix: true,
                })}
              </span>
            </div>

            {/* Ripcord warning */}
            {latestEntry.ripcord && (
              <Badge variant="destructive" className="text-xs">
                <AlertTriangle className="w-3 h-3 mr-1" />
                Ripcord Active
              </Badge>
            )}
          </>
        ) : (
          /* Empty state */
          <div className="text-center py-4">
            <ArtifactIcon type={artifactKey} />
            <p className="text-sm text-slate-400 mt-2 mb-3">No entries yet</p>
          </div>
        )}

        {/* Actions */}
        <div className="pt-2 border-t flex items-center gap-2">
          <Link href={integrationId ? `/spaces/${spaceSlug}/input/${integrationId}` : `/spaces/${spaceSlug}/input`}>
            <Button size="sm" className="h-7 px-3 text-xs">
              <Plus className="w-3 h-3 mr-1" />
              Add Entry
            </Button>
          </Link>
          <Link href={`/spaces/${spaceSlug}/reserves?stream=${stream.id}`}>
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-slate-500 hover:text-blue-600">
              <History className="w-3 h-3 mr-1" />
              History
            </Button>
          </Link>
          {!stream.isActive && (
            <Badge variant="outline" className="text-xs ml-auto">
              Inactive
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
});
