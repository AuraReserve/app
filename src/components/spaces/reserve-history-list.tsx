"use client";

import React, { memo, useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Archive as ArchiveIcon,
  Database,
  TreeDeciduous,
  AlertTriangle,
  User,
  Zap,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ARTIFACT_LABELS_SHORT, ARTIFACT_BADGE_COLORS } from "@/lib/artifact-types";

// ── Types ────────────────────────────────────────────────────────────

export interface ReserveEntry {
  id: string;
  artifactType: string;
  value: number | null;
  artifactData: Record<string, unknown> | null;
  timestamp: string;
  createdDate: string;
  ripcord: boolean;
  isAutomated: boolean;
  notes: string;
  archived: boolean;
  archivedAt: string | null;
  archivedReason: string | null;
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

interface ReserveHistoryListProps {
  entries: ReserveEntry[];
  variant?: "full" | "compact";
  maxItems?: number;
  showFilter?: boolean;
  showStreamBadge?: boolean;
  showMoreLink?: string;
  title?: string;
  onEntryClick?: (entry: ReserveEntry) => void;
}

// ── Helpers ──────────────────────────────────────────────────────────

const ARTIFACT_BADGE = ARTIFACT_BADGE_COLORS;
const ARTIFACT_LABELS = ARTIFACT_LABELS_SHORT;

type FilterValue = "active" | "archived" | "all";

function ArtifactIcon({ type }: { type: string }) {
  if (type !== "value") return <TreeDeciduous className="w-4 h-4 text-green-600" />;
  return <Database className="w-4 h-4 text-blue-600" />;
}

function entrySummary(entry: ReserveEntry): string {
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

function entryNumericValue(entry: ReserveEntry): number | null {
  const artifactKey = entry.artifactType.toLowerCase();
  if (artifactKey === "value") return entry.value;
  const ad = entry.artifactData as Record<string, unknown> | null;
  if (ad) {
    if (typeof ad.totalBalance === "number") return ad.totalBalance;
    if (typeof ad.total === "number") return ad.total;
  }
  return null;
}

// ── Component ────────────────────────────────────────────────────────

export const ReserveHistoryList = memo(function ReserveHistoryList({
  entries,
  variant = "full",
  maxItems,
  showFilter = false,
  showStreamBadge = false,
  showMoreLink,
  title = "Reserve History",
  onEntryClick,
}: ReserveHistoryListProps) {
  const [filter, setFilter] = useState<FilterValue>("active");

  const filteredEntries = useMemo(() => {
    let result = entries;
    if (filter === "active") {
      result = entries.filter((e) => !e.archived);
    } else if (filter === "archived") {
      result = entries.filter((e) => e.archived);
    }
    if (maxItems != null) {
      result = result.slice(0, maxItems);
    }
    return result;
  }, [entries, filter, maxItems]);

  return (
    <Card className="shadow-sm border-slate-200">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Database className="w-5 h-5 text-blue-600" />
            {title}
          </CardTitle>
          {showFilter && (
            <div className="flex items-center gap-1">
              {(["active", "archived", "all"] as const).map((v) => (
                <Button
                  key={v}
                  variant={filter === v ? "default" : "outline"}
                  size="sm"
                  className="h-7 text-xs capitalize"
                  onClick={() => setFilter(v)}
                >
                  {v}
                </Button>
              ))}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {filteredEntries.length === 0 ? (
          <div className="py-8 text-center border-2 border-dashed border-slate-200 rounded-lg">
            <Database className="w-8 h-8 text-slate-200 mx-auto mb-2" />
            <p className="text-sm text-slate-400">No reserve entries yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredEntries.map((entry) => {
              const artifactKey = entry.artifactType.toLowerCase();
              const isClickable = !!onEntryClick;

              return (
                <div
                  key={entry.id}
                  className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                    entry.archived
                      ? "border-slate-200 bg-slate-50 opacity-60"
                      : "border-slate-100 hover:bg-slate-50"
                  } ${isClickable ? "cursor-pointer" : ""}`}
                  onClick={isClickable ? () => onEntryClick(entry) : undefined}
                  role={isClickable ? "button" : undefined}
                  tabIndex={isClickable ? 0 : undefined}
                  onKeyDown={
                    isClickable
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onEntryClick(entry);
                          }
                        }
                      : undefined
                  }
                >
                  <div className="mt-0.5">
                    <ArtifactIcon type={artifactKey} />
                  </div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      {showStreamBadge && (
                        <span className="font-medium text-sm truncate">
                          {entry.stream.name}
                        </span>
                      )}
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
                      {entry.archived && (
                        <Badge variant="secondary" className="text-xs">
                          <ArchiveIcon className="w-3 h-3 mr-0.5" />
                          Archived
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-slate-700">
                      {(() => {
                        const numValue = entryNumericValue(entry);
                        const unit = entry.stream.unit ?? "";
                        if (numValue != null) {
                          return (
                            <>
                              <span className="font-semibold">{numValue.toLocaleString()}</span>
                              {unit && <span className="text-slate-500 ml-1">{unit}</span>}
                            </>
                          );
                        }
                        return entrySummary(entry);
                      })()}
                    </p>
                    {variant === "full" ? (
                      <div className="flex items-center gap-3 text-xs text-slate-400">
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3" />
                          {entry.submitter?.name ?? entry.submitter?.email ?? "Unknown"}
                        </span>
                        <span className="flex items-center gap-1">
                          <Zap className="w-3 h-3" />
                          {entry.sourceIntegration
                            ? entry.sourceIntegration.integration.displayName
                            : entry.isAutomated
                              ? "Automated"
                              : "Manual"}
                        </span>
                        <span title="Record date (user-selected)">
                          Record date:{" "}
                          {formatDistanceToNow(new Date(entry.timestamp), {
                            addSuffix: true,
                          })}
                        </span>
                        {entry.createdDate && (
                          <span title="When this entry was entered into the system">
                            Entered:{" "}
                            {formatDistanceToNow(new Date(entry.createdDate), {
                              addSuffix: true,
                            })}
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="text-xs text-slate-400">
                        {formatDistanceToNow(new Date(entry.timestamp), {
                          addSuffix: true,
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {showMoreLink && (
              <Link
                href={showMoreLink}
                className="block w-full text-center text-sm text-blue-600 hover:text-blue-800 py-2 hover:bg-slate-50 rounded-lg transition-colors"
              >
                View all {entries.length} entries
              </Link>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
});
