"use client";

import React, { useState } from "react";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Clock,
  Shield,
  AlertTriangle,
  Archive as ArchiveIcon,
  Undo2,
  User,
  Zap,
  Loader2,
} from "lucide-react";
import type { ReserveEntry } from "@/components/spaces/reserve-history-list";
import { ARTIFACT_LABELS_SHORT, ARTIFACT_BADGE_COLORS, isMerkleArtifactType } from "@/lib/artifact-types";
import { MerkleTreeViewer } from "@/components/spaces/merkle-tree-viewer";

interface MerkleLeaf {
  id: string;
  leafId: string;
  leafHash: string;
  value: number | null;
  leafData: Record<string, unknown> | null;
  leafIndex: number;
}

export interface ReserveDetailDialogProps {
  isOpen: boolean;
  onClose: () => void;
  entry: ReserveEntry | null;
  onArchive?: (entryId: string, reason: string) => Promise<void>;
  onRestore?: (entryId: string) => Promise<void>;
  isPending?: boolean;
  canManage?: boolean;
  /** Optional: supply leaves for merkle entries. If not supplied and the entry is merkle, the dialog fetches them. */
  leaves?: MerkleLeaf[];
  /** Required for auto-fetching leaves: spaceId and streamId */
  spaceId?: string;
  streamId?: string;
}

function getNumericValue(entry: ReserveEntry): number | null {
  const artifactKey = entry.artifactType.toLowerCase();
  if (artifactKey === "value") return entry.value;
  const ad = entry.artifactData as Record<string, unknown> | null;
  if (ad) {
    if (typeof ad.totalBalance === "number") return ad.totalBalance;
    if (typeof ad.total === "number") return ad.total;
  }
  return null;
}

export function ReserveDetailDialog({
  isOpen,
  onClose,
  entry,
  onArchive,
  onRestore,
  isPending = false,
  canManage = false,
  leaves: externalLeaves,
  spaceId,
  streamId,
}: ReserveDetailDialogProps) {
  const [showArchiveSection, setShowArchiveSection] = useState(false);
  const [archiveReason, setArchiveReason] = useState("");
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [fetchedLeaves, setFetchedLeaves] = useState<MerkleLeaf[] | null>(null);
  const [leavesLoading, setLeavesLoading] = useState(false);

  // Auto-fetch leaves for merkle entries when dialog opens
  React.useEffect(() => {
    if (!isOpen || !entry || externalLeaves) {
      setFetchedLeaves(null);
      return;
    }
    if (!isMerkleArtifactType(entry.artifactType)) return;
    if (!spaceId) return;

    const sid = streamId ?? entry.stream.id;
    if (!sid) return;

    let cancelled = false;
    setLeavesLoading(true);
    fetch(`/api/spaces/${spaceId}/stores/${sid}/entries/${entry.id}?leaves=true`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.leaves) {
          setFetchedLeaves(data.leaves);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLeavesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-fetch when entry identity/type changes, not on every entry object reference
  }, [isOpen, entry?.id, entry?.artifactType, externalLeaves, spaceId, streamId, entry?.stream.id]);

  const leaves = externalLeaves ?? fetchedLeaves;

  const handleClose = () => {
    setShowArchiveSection(false);
    setArchiveReason("");
    setArchiveError(null);
    onClose();
  };

  const handleArchive = async () => {
    if (!entry) return;
    const reason = archiveReason.trim();
    if (!reason) {
      setArchiveError("Please provide a reason for archiving this entry.");
      return;
    }
    setArchiveError(null);
    try {
      await onArchive?.(entry.id, reason);
      handleClose();
    } catch {
      setArchiveError("Failed to archive entry. Please try again.");
    }
  };

  const handleRestore = async () => {
    if (!entry) return;
    setArchiveError(null);
    try {
      await onRestore?.(entry.id);
      handleClose();
    } catch {
      setArchiveError("Failed to restore this entry. Please try again.");
    }
  };

  if (!entry) return null;

  const numericValue = getNumericValue(entry);
  const unit = entry.stream.unit ?? "";
  const artifactKey = entry.artifactType.toLowerCase();

  return (
    <Dialog open={isOpen} onOpenChange={(open) => (open ? undefined : handleClose())}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto sm:max-w-[600px]">
        <DialogHeader className="space-y-3 pb-4 border-b pr-8">
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-4">
              <DialogTitle className="text-2xl font-bold text-slate-900 pr-2">
                Reserve Entry
              </DialogTitle>
              <div className="flex items-center gap-2 shrink-0">
                <Badge className={`text-sm ${ARTIFACT_BADGE_COLORS[artifactKey] ?? "bg-slate-100 text-slate-800"}`}>
                  {ARTIFACT_LABELS_SHORT[artifactKey] ?? entry.artifactType}
                </Badge>
                {entry.archived && (
                  <Badge variant="secondary" className="text-sm">Archived</Badge>
                )}
              </div>
            </div>
            <DialogDescription className="text-slate-600 flex items-center gap-2">
              <Clock className="w-4 h-4 shrink-0" />
              <span>
                Record date: {format(new Date(entry.timestamp), "PPP")} at{" "}
                {format(new Date(entry.timestamp), "p")}
              </span>
            </DialogDescription>
          </div>
        </DialogHeader>

        <div className="space-y-6 py-6">
          {/* Value — Featured Section */}
          {numericValue != null && (
            <div className="bg-gradient-to-br from-blue-50 to-slate-50 border-2 border-blue-100 rounded-xl p-6 shadow-sm">
              <div className="flex items-baseline gap-3 flex-wrap">
                <p className="text-4xl sm:text-5xl font-bold text-slate-900">
                  {numericValue.toLocaleString()}
                </p>
                {unit && <p className="text-xl sm:text-2xl font-medium text-slate-600">{unit}</p>}
              </div>
              <p className="text-sm text-slate-500 mt-2">
                {entry.stream.name}
              </p>
            </div>
          )}

          {/* Details Table */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-5">
            <div className="space-y-0">
              <div className="flex items-center justify-between min-h-[44px] py-3 border-b border-slate-200">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-slate-500 shrink-0" />
                  <span className="text-sm font-medium text-slate-600">Record date:</span>
                </div>
                <p className="font-medium text-slate-900">
                  {format(new Date(entry.timestamp), "PPP")} at {format(new Date(entry.timestamp), "p")}
                </p>
              </div>

              {entry.createdDate && (
                <div className="flex items-center justify-between min-h-[44px] py-3 border-b border-slate-200">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-slate-500 shrink-0" />
                    <span className="text-sm font-medium text-slate-600">Entered:</span>
                  </div>
                  <p className="font-medium text-slate-900">
                    {format(new Date(entry.createdDate), "PPP")} at {format(new Date(entry.createdDate), "p")}
                  </p>
                </div>
              )}

              <div className="flex items-center justify-between min-h-[44px] py-3 border-b border-slate-200">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-slate-500 shrink-0" />
                  <span className="text-sm font-medium text-slate-600">Submitted by:</span>
                </div>
                <p className="font-medium text-slate-900">
                  {entry.submitter?.name ?? entry.submitter?.email ?? "Unknown"}
                </p>
              </div>

              <div className="flex items-center justify-between min-h-[44px] py-3 border-b border-slate-200">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-slate-500 shrink-0" />
                  <span className="text-sm font-medium text-slate-600">Stream:</span>
                </div>
                <p className="font-medium text-slate-900">{entry.stream.name}</p>
              </div>

              <div className="flex items-center justify-between min-h-[44px] py-3">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-slate-500 shrink-0" />
                  <span className="text-sm font-medium text-slate-600">Source:</span>
                </div>
                <p className="font-medium text-slate-900">
                  {entry.sourceIntegration
                    ? entry.sourceIntegration.integration.displayName
                    : entry.isAutomated
                      ? "Automated"
                      : "Manual"}
                </p>
              </div>
            </div>
          </div>

          {/* Ripcord Alert */}
          {entry.ripcord && (
            <div className="bg-red-50 border-2 border-red-200 rounded-lg p-5">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className="w-5 h-5 text-red-600" />
                <p className="font-semibold text-red-900 text-lg">Ripcord Active</p>
              </div>
            </div>
          )}

          {/* Notes */}
          {entry.notes && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-5">
              <p className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                <span className="w-1 h-4 bg-blue-500 rounded"></span>
                Notes
              </p>
              <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
                {entry.notes}
              </p>
            </div>
          )}

          {/* Artifact Data — Merkle Tree Visualization */}
          {isMerkleArtifactType(entry.artifactType) && entry.artifactData && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-5">
              <p className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                <span className="w-1 h-4 bg-green-500 rounded"></span>
                Merkle Tree
              </p>
              {leavesLoading ? (
                <div className="flex items-center gap-2 text-sm text-slate-500 py-4 justify-center">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading tree data...
                </div>
              ) : (
                <MerkleTreeViewer
                  artifactData={entry.artifactData}
                  leaves={leaves ?? undefined}
                  unit={entry.stream.unit}
                />
              )}
            </div>
          )}

          {/* Artifact Data — Raw (non-merkle) */}
          {!isMerkleArtifactType(entry.artifactType) &&
            entry.artifactData &&
            Object.keys(entry.artifactData).length > 0 && (
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-5">
                <p className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                  <span className="w-1 h-4 bg-purple-500 rounded"></span>
                  Entry Data
                </p>
                <pre className="text-xs font-mono text-slate-600 whitespace-pre-wrap overflow-x-auto max-h-64 overflow-y-auto">
                  {JSON.stringify(entry.artifactData, null, 2)}
                </pre>
              </div>
            )}

          {/* Archive Info (when archived) */}
          {entry.archived ? (
            <div className="bg-amber-50 border-2 border-amber-200 rounded-lg p-5">
              <div className="flex items-center gap-2 mb-3">
                <ArchiveIcon className="w-5 h-5 text-amber-600" />
                <p className="font-semibold text-amber-900">Archive Information</p>
              </div>
              <div className="space-y-2">
                <div>
                  <p className="text-xs font-medium text-amber-700 mb-1">Reason:</p>
                  <p className="text-sm text-amber-900 whitespace-pre-line">
                    {entry.archivedReason ?? "No reason provided."}
                  </p>
                </div>
                {entry.archivedAt && (
                  <p className="text-xs text-amber-600 mt-2 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    Archived on {format(new Date(entry.archivedAt), "PPP 'at' p")}
                  </p>
                )}
              </div>
            </div>
          ) : (
            showArchiveSection && (
              <div className="space-y-4 pt-4 border-t">
                <div className="bg-red-50 border-l-4 border-red-400 p-4 rounded">
                  <div className="flex gap-3">
                    <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-red-900 mb-1">Archive Warning</p>
                      <p className="text-sm text-red-700 leading-relaxed">
                        Archiving marks this entry as inactive. It will be visually greyed out
                        and excluded from charts. You can restore it anytime.
                      </p>
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="archive_reason" className="text-sm font-semibold text-slate-700">
                    Archive Reason <span className="text-red-500">*</span>
                  </Label>
                  <Textarea
                    id="archive_reason"
                    placeholder="Explain why this entry should be archived (e.g., data error, duplicate entry, superseded by new audit...)"
                    value={archiveReason}
                    onChange={(e) => setArchiveReason(e.target.value)}
                    rows={4}
                    className="resize-none"
                  />
                  <p className="text-xs text-slate-500">
                    This reason will be recorded in the audit log.
                  </p>
                </div>
              </div>
            )
          )}

          {archiveError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600" />
              <p className="text-sm text-red-700 font-medium">{archiveError}</p>
            </div>
          )}
        </div>

        <DialogFooter className="pt-4 border-t gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={handleClose} className="border-slate-300">
            Close
          </Button>
          {canManage && (
            <>
              {entry.archived ? (
                <Button
                  type="button"
                  onClick={handleRestore}
                  disabled={isPending}
                  className="bg-blue-600 hover:bg-blue-700 flex items-center gap-2"
                >
                  <Undo2 className="w-4 h-4" />
                  {isPending ? "Restoring..." : "Restore Entry"}
                </Button>
              ) : showArchiveSection ? (
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => { setShowArchiveSection(false); setArchiveReason(""); setArchiveError(null); }}
                    className="border-slate-300"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    className="bg-red-600 hover:bg-red-700 flex items-center gap-2"
                    onClick={handleArchive}
                    disabled={isPending}
                  >
                    <ArchiveIcon className="w-4 h-4" />
                    {isPending ? "Archiving..." : "Confirm Archive"}
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="destructive"
                  className="flex items-center gap-2"
                  onClick={() => setShowArchiveSection(true)}
                >
                  <ArchiveIcon className="w-4 h-4" />
                  Archive Entry
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
