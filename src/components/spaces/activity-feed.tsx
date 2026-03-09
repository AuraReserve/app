"use client";

import React, { memo, useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Activity,
  Database,
  TreeDeciduous,
  AlertTriangle,
  User,
  Zap,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ARTIFACT_LABELS_SHORT, ARTIFACT_BADGE_COLORS } from "@/lib/artifact-types";

interface StoreInfo {
  id: string;
  name: string;
}

interface ActivityEntry {
  id: string;
  artifactType: string;
  value: number | null;
  artifactData: Record<string, unknown> | null;
  timestamp: string;
  ripcord: boolean;
  isAutomated: boolean;
  notes: string;
  submittedBy: string;
  submitter: { name: string | null; email: string } | null;
  stream: {
    id: string;
    name: string;
    slug: string;
    artifactType: string;
    unit: string | null;
  };
  sourceIntegration: {
    integration: { displayName: string; key: string };
  } | null;
}

interface ActivityFeedProps {
  spaceId: string;
  spaceSlug: string;
  streams: StoreInfo[];
}

const ARTIFACT_BADGE = ARTIFACT_BADGE_COLORS;
const ARTIFACT_LABELS = ARTIFACT_LABELS_SHORT;

function ArtifactIcon({ type }: { type: string }) {
  if (type !== "value") return <TreeDeciduous className="w-4 h-4 text-green-600" />;
  return <Database className="w-4 h-4 text-blue-600" />;
}

function entrySummary(entry: ActivityEntry): string {
  const artifactKey = entry.artifactType.toLowerCase();
  if (artifactKey === "value" && entry.value != null) {
    const unit = entry.stream.unit ?? "";
    return `${entry.value.toLocaleString()} ${unit}`.trim();
  }
  const ad = entry.artifactData as Record<string, unknown> | null;
  if (ad) {
    const leafCount = typeof ad.leafCount === "number" ? ad.leafCount : null;
    const totalBalance = typeof ad.totalBalance === "number" ? ad.totalBalance : null;
    if (totalBalance != null) {
      return `Balance: ${totalBalance.toLocaleString()}`;
    }
    if (leafCount != null) {
      return `${leafCount} leaves`;
    }
  }
  return "Entry submitted";
}

const COLLAPSED_LIMIT = 3;

export const ActivityFeed = memo(function ActivityFeed({
  spaceId,
  spaceSlug,
  streams,
}: ActivityFeedProps) {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStreamId, setFilterStreamId] = useState<string>("all");

  const fetchActivity = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: "20" });
    if (filterStreamId !== "all") {
      params.set("streamId", filterStreamId);
    }
    const response = await fetch(
      `/api/spaces/${spaceId}/activity?${params}`
    );
    if (response.ok) {
      setEntries(await response.json());
    }
    setLoading(false);
  }, [spaceId, filterStreamId]);

  useEffect(() => {
    fetchActivity();
  }, [fetchActivity]);

  return (
    <Card className="shadow-sm border-slate-200">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="w-5 h-5 text-blue-600" />
            Recent Activity
          </CardTitle>
          {streams.length > 1 && (
            <Select value={filterStreamId} onValueChange={setFilterStreamId}>
              <SelectTrigger className="w-[180px] h-8 text-xs">
                <SelectValue placeholder="All data stores" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All data stores</SelectItem>
                {streams.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="py-8 text-center text-sm text-slate-400 animate-pulse">
            Loading activity...
          </div>
        ) : entries.length === 0 ? (
          <div className="py-8 text-center">
            <Activity className="w-8 h-8 text-slate-200 mx-auto mb-2" />
            <p className="text-sm text-slate-400">No activity yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {entries.slice(0, COLLAPSED_LIMIT).map((entry) => {
              const artifactKey = entry.artifactType.toLowerCase();
              const submitterName =
                entry.submitter?.name ?? entry.submitter?.email ?? "Unknown";
              const sourceName = entry.sourceIntegration
                ? entry.sourceIntegration.integration.displayName
                : entry.isAutomated
                  ? "Automated"
                  : "Manual";

              return (
                <div
                  key={entry.id}
                  className="flex items-start gap-3 p-3 rounded-lg border border-slate-100 hover:bg-slate-50 transition-colors"
                >
                  <div className="mt-0.5">
                    <ArtifactIcon type={artifactKey} />
                  </div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm truncate">
                        {entry.stream.name}
                      </span>
                      <Badge
                        className={`text-xs ${ARTIFACT_BADGE[artifactKey] ?? "bg-slate-100 text-slate-800"}`}
                      >
                        {ARTIFACT_LABELS[artifactKey] ?? entry.artifactType}
                      </Badge>
                      {entry.ripcord && (
                        <Badge variant="destructive" className="text-xs">
                          <AlertTriangle className="w-3 h-3 mr-0.5" />
                          Ripcord
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-slate-700">
                      {entrySummary(entry)}
                    </p>
                    <div className="flex items-center gap-3 text-xs text-slate-400">
                      <span className="flex items-center gap-1">
                        <User className="w-3 h-3" />
                        {submitterName}
                      </span>
                      <span className="flex items-center gap-1">
                        <Zap className="w-3 h-3" />
                        {sourceName}
                      </span>
                      <span>
                        {formatDistanceToNow(new Date(entry.timestamp), {
                          addSuffix: true,
                        })}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
            {entries.length > COLLAPSED_LIMIT && (
              <Link
                href={`/spaces/${spaceSlug}/activity`}
                className="block w-full text-center text-sm text-blue-600 hover:text-blue-800 py-2 hover:bg-slate-50 rounded-lg transition-colors"
              >
                Show more
              </Link>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
});
