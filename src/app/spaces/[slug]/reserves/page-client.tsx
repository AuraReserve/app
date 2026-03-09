"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Activity, Shield, BarChart3, Plus, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { ReserveChart } from "@/components/spaces/reserve-chart";
import { ReserveHistoryList } from "@/components/spaces/reserve-history-list";
import type { ReserveEntry } from "@/components/spaces/reserve-history-list";
import { ReserveDetailDialog } from "@/components/spaces/reserve-detail-dialog";
import type { StoreOverviewData } from "@/components/spaces/store-overview-card";
import type { SpaceIntegrationData } from "@/components/spaces/store-flow-visualization";
import type { SpacePermissions } from "@/lib/permissions";

interface ReservesPageClientProps {
  slug: string;
  space: {
    id: string;
    name: string;
    description: string | null;
    [key: string]: unknown;
  };
  stores: StoreOverviewData[];
  integrations: SpaceIntegrationData[];
  permissions: SpacePermissions;
}

export default function ReservesPageClient({
  slug,
  space,
  stores,
  integrations,
  permissions,
}: ReservesPageClientProps) {
  const searchParams = useSearchParams();
  const initialStream = searchParams.get("stream");
  const [selectedTab, setSelectedTab] = useState<string>(() => {
    if (initialStream && stores.some((s) => s.id === initialStream)) {
      return initialStream;
    }
    return "overview";
  });
  const [entries, setEntries] = useState<ReserveEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEntry, setSelectedEntry] = useState<ReserveEntry | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [archivePending, setArchivePending] = useState(false);

  const handleEntryClick = (entry: ReserveEntry) => {
    setSelectedEntry(entry);
    setDialogOpen(true);
  };

  const handleArchive = async (entryId: string, reason: string) => {
    setArchivePending(true);
    try {
      const res = await fetch(`/api/spaces/${space.id}/entries/${entryId}/archive`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "archive", reason }),
      });
      if (!res.ok) throw new Error("Failed to archive");
      setEntries((prev) =>
        prev.map((e) =>
          e.id === entryId
            ? { ...e, archived: true, archivedAt: new Date().toISOString(), archivedReason: reason }
            : e
        )
      );
    } finally {
      setArchivePending(false);
    }
  };

  const handleRestore = async (entryId: string) => {
    setArchivePending(true);
    try {
      const res = await fetch(`/api/spaces/${space.id}/entries/${entryId}/archive`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "restore" }),
      });
      if (!res.ok) throw new Error("Failed to restore");
      setEntries((prev) =>
        prev.map((e) =>
          e.id === entryId
            ? { ...e, archived: false, archivedAt: null, archivedReason: null }
            : e
        )
      );
    } finally {
      setArchivePending(false);
    }
  };

  const selectedStreamId = selectedTab === "overview" ? "all" : selectedTab;

  useEffect(() => {
    setLoading(true);
    const url =
      selectedStreamId === "all"
        ? `/api/spaces/${space.id}/activity?limit=100`
        : `/api/spaces/${space.id}/activity?limit=100&streamId=${selectedStreamId}`;

    fetch(url)
      .then((res) => (res.ok ? res.json() : []))
      .then((data: ReserveEntry[]) => {
        setEntries(data);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [space.id, selectedStreamId]);

  // Stat calculations
  const mostRecentDate = useMemo(() => {
    if (entries.length === 0) return null;
    const sorted = [...entries].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    return new Date(sorted[0].timestamp);
  }, [entries]);

  const activeStreamCount = useMemo(() => {
    const streamsWithEntries = new Set(
      (stores ?? [])
        .filter((s) => s._count.entries > 0)
        .map((s) => s.id)
    );
    return streamsWithEntries.size;
  }, [stores]);

  const totalEntries = useMemo(() => {
    return (stores ?? []).reduce((sum, s) => sum + s._count.entries, 0);
  }, [stores]);

  // Per-stream chart data for overview (one chart per stream)
  const perStreamChartData = useMemo(() => {
    return (stores ?? []).map((stream) => {
      const streamEntries = entries
        .filter((e) => e.stream?.id === stream.id && e.value != null && !e.archived)
        .map((e) => ({ date: e.timestamp, reserve: e.value! }))
        .reverse();
      return { stream, data: streamEntries };
    });
  }, [entries, stores]);

  // Single stream chart data (when a specific stream tab is selected)
  const singleChartData = useMemo(() => {
    return entries
      .filter((e) => e.value != null && !e.archived)
      .map((e) => ({ date: e.timestamp, reserve: e.value! }))
      .reverse();
  }, [entries]);

  const singleChartUnit = useMemo(() => {
    if (selectedStreamId !== "all") {
      const stream = (stores ?? []).find((s) => s.id === selectedStreamId);
      return stream?.unit ?? "";
    }
    return "";
  }, [selectedStreamId, stores]);

  const hasMultipleStreams = (stores ?? []).length > 1;

  return (
    <div className="p-4 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Reserves</h1>
          <p className="text-muted-foreground mt-1">
            Proof-of-reserve entries and audit history for {space.name}
          </p>
        </div>
        {permissions.canManageReserves && (() => {
          let addEntryHref = `/spaces/${slug}/input`;
          if (selectedTab !== "overview") {
            const inputIntegration = (integrations ?? []).find(
              (i) => i.stream.id === selectedTab && i.direction.toLowerCase() === "input"
            );
            if (inputIntegration) {
              addEntryHref = `/spaces/${slug}/input/${inputIntegration.id}`;
            }
          } else if (stores.length === 1) {
            const inputIntegration = (integrations ?? []).find(
              (i) => i.stream.id === stores[0].id && i.direction.toLowerCase() === "input"
            );
            if (inputIntegration) {
              addEntryHref = `/spaces/${slug}/input/${inputIntegration.id}`;
            }
          }
          return (
            <Button asChild>
              <Link href={addEntryHref} className="inline-flex items-center gap-2">
                <Plus className="h-4 w-4" />
                Add Entry
              </Link>
            </Button>
          );
        })()}
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-green-200 bg-green-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-green-600 flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Most Recent Audit
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-900">
              {mostRecentDate ? format(mostRecentDate, "PPP") : "No entries"}
            </div>
            <p className="text-xs text-green-600/70">latest entry date</p>
          </CardContent>
        </Card>

        <Card className="border-blue-200 bg-blue-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-blue-600 flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Active Streams
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-900">{activeStreamCount}</div>
            <p className="text-xs text-blue-600/70">streams with entries</p>
          </CardContent>
        </Card>

        <Card className="border-purple-200 bg-purple-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-purple-600 flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Total Entries
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-900">{totalEntries}</div>
            <p className="text-xs text-purple-600/70">across all streams</p>
          </CardContent>
        </Card>
      </div>

      {/* Stream Tabs */}
      <Tabs value={selectedTab} onValueChange={setSelectedTab}>
        {hasMultipleStreams && (
          <TabsList className="h-auto flex-wrap">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            {(stores ?? []).map((stream) => (
              <TabsTrigger key={stream.id} value={stream.id}>
                {stream.name}
              </TabsTrigger>
            ))}
          </TabsList>
        )}

        {/* Chart */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {selectedTab === "overview" ? (
              <div className={`grid gap-4 mt-4 ${hasMultipleStreams ? "grid-cols-1 lg:grid-cols-2" : ""}`}>
                {perStreamChartData.map(({ stream, data }) => (
                  <ReserveChart
                    key={stream.id}
                    data={data}
                    unit={stream.unit ?? ""}
                    title={stream.name}
                  />
                ))}
              </div>
            ) : (
              <div className="mt-4">
                <ReserveChart
                  data={singleChartData}
                  unit={singleChartUnit}
                  title={
                    (stores ?? []).find((s) => s.id === selectedTab)?.name ?? "Reserve History"
                  }
                />
              </div>
            )}

            {/* Reserve History List */}
            <ReserveHistoryList
              entries={entries}
              variant="full"
              showStreamBadge={selectedTab === "overview"}
              showFilter
              title="Reserve History"
              onEntryClick={handleEntryClick}
            />
          </>
        )}
      </Tabs>

      <ReserveDetailDialog
        isOpen={dialogOpen}
        onClose={() => setDialogOpen(false)}
        entry={selectedEntry}
        onArchive={handleArchive}
        onRestore={handleRestore}
        isPending={archivePending}
        canManage={permissions.canManageReserves}
        spaceId={space.id}
      />
    </div>
  );
}
