"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
  ArrowLeft,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ARTIFACT_LABELS_SHORT, ARTIFACT_BADGE_COLORS } from "@/lib/artifact-types";

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

interface ActivityPageClientProps {
  slug: string;
  spaceId: string;
  spaceName: string;
  streams: Array<{ id: string; name: string }>;
}

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

export default function ActivityPageClient({
  slug,
  spaceId,
  spaceName,
  streams,
}: ActivityPageClientProps) {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStreamId, setFilterStreamId] = useState<string>("all");

  const fetchActivity = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: "100" });
    if (filterStreamId !== "all") {
      params.set("streamId", filterStreamId);
    }
    const response = await fetch(`/api/spaces/${spaceId}/activity?${params}`);
    if (response.ok) {
      setEntries(await response.json());
    }
    setLoading(false);
  }, [spaceId, filterStreamId]);

  useEffect(() => {
    fetchActivity();
  }, [fetchActivity]);

  return (
    <div className="p-4 md:p-8 space-y-6">
      {/* Header */}
      <div>
        <Link
          href={`/spaces/${slug}`}
          className="inline-flex items-center text-sm text-slate-600 hover:text-slate-900 mb-3"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back to {spaceName}
        </Link>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="w-6 h-6 text-blue-600" />
            Activity Log
          </h1>
          {streams.length > 1 && (
            <Select value={filterStreamId} onValueChange={setFilterStreamId}>
              <SelectTrigger className="w-[220px]">
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
      </div>

      {/* Activity List */}
      <Card className="shadow-sm border-slate-200">
        <CardContent className="pt-6">
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
              {entries.map((entry) => {
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
                          className={`text-xs ${ARTIFACT_BADGE_COLORS[artifactKey] ?? "bg-slate-100 text-slate-800"}`}
                        >
                          {ARTIFACT_LABELS_SHORT[artifactKey] ?? entry.artifactType}
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
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
