"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Download, Loader2 } from "lucide-react";
import { StoreOverviewCard } from "@/components/spaces/store-overview-card";
import type { StoreOverviewData } from "@/components/spaces/store-overview-card";
import { StoreFlowVisualization } from "@/components/spaces/store-flow-visualization";
import type { SpaceIntegrationData } from "@/components/spaces/store-flow-visualization";
import { StoreCharts } from "@/components/spaces/store-charts";
import { ActivityFeed } from "@/components/spaces/activity-feed";
import { ReserveChart } from "@/components/spaces/reserve-chart";
import { ReserveHistoryList } from "@/components/spaces/reserve-history-list";
import type { ReserveEntry } from "@/components/spaces/reserve-history-list";
import type { SpacePermissions } from "@/lib/permissions";

interface SpaceDetailProps {
  slug: string;
  space: {
    id: string;
    name: string;
    description: string | null;
    is_active: boolean;
    [key: string]: unknown;
  };
  stores: StoreOverviewData[];
  integrations: SpaceIntegrationData[];
  permissions: SpacePermissions;
}

export default function SpaceDetail({
  slug,
  space,
  stores,
  integrations,
  permissions: _permissions,
}: SpaceDetailProps) {
  const activeStreams = (stores ?? []).filter((s: StoreOverviewData) => s.isActive !== false);

  const [activeTab, setActiveTab] = useState("overview");
  const [streamEntries, setStreamEntries] = useState<Record<string, ReserveEntry[]>>({});
  const [streamChartData, setStreamChartData] = useState<Record<string, Array<{ date: string; reserve: number }>>>({});
  const [loadingStreams, setLoadingStreams] = useState<Record<string, boolean>>({});

  // Use refs to avoid stale closures in the effect without adding objects to deps
  const fetchedRef = useRef<Set<string>>(new Set());
  const loadingRef = useRef<Set<string>>(new Set());

  const fetchStreamData = useCallback((streamId: string) => {
    if (fetchedRef.current.has(streamId) || loadingRef.current.has(streamId)) return;
    loadingRef.current.add(streamId);
    setLoadingStreams((prev) => ({ ...prev, [streamId]: true }));

    fetch(`/api/spaces/${space.id}/activity?limit=50&streamId=${streamId}`)
      .then((res) => (res.ok ? res.json() : []))
      .then((entries: ReserveEntry[]) => {
        fetchedRef.current.add(streamId);
        setStreamEntries((prev) => ({ ...prev, [streamId]: entries }));
        const chartData = entries
          .filter((e: ReserveEntry) => e.value != null)
          .map((e: ReserveEntry) => ({ date: e.timestamp, reserve: e.value! }))
          .reverse();
        setStreamChartData((prev) => ({ ...prev, [streamId]: chartData }));
      })
      .finally(() => {
        loadingRef.current.delete(streamId);
        setLoadingStreams((prev) => ({ ...prev, [streamId]: false }));
      });
  }, [space.id]);

  useEffect(() => {
    if (activeTab === "overview") return;
    fetchStreamData(activeTab);
  }, [activeTab, fetchStreamData]);

  return (
    <div className="p-4 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/spaces">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{space.name}</h1>
            <Badge variant={space.is_active ? "default" : "secondary"}>
              {space.is_active ? "Active" : "Inactive"}
            </Badge>
          </div>
          {space.description && (
            <p className="text-muted-foreground mt-1">{space.description}</p>
          )}
        </div>
      </div>

      {/* Tabbed Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          {activeStreams.map((stream: StoreOverviewData) => (
            <TabsTrigger key={stream.id} value={stream.id}>
              {stream.name}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6 mt-6">
          {/* Stream Overview — current values */}
          <div>
            {activeStreams.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  <Download className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No data inputs configured yet.</p>
                  <Button variant="link" asChild className="mt-2">
                    <Link href={`/spaces/${slug}/input`}>Configure your first data input</Link>
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {activeStreams.slice(0, 6).map((stream: StoreOverviewData) => {
                  const inputIntegration = (integrations ?? []).find(
                    (i: SpaceIntegrationData) => i.stream.id === stream.id && i.direction.toLowerCase() === "input"
                  );
                  return (
                    <StoreOverviewCard
                      key={stream.id}
                      stream={stream}
                      spaceSlug={slug}
                      integrationId={inputIntegration?.id}
                    />
                  );
                })}
              </div>
            )}
          </div>

          {/* Charts and Activity */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <StoreCharts
              streams={(stores ?? []) as StoreOverviewData[]}
              spaceId={space.id}
            />
            <ActivityFeed spaceId={space.id} spaceSlug={slug} streams={(stores ?? []).map(s => ({ id: s.id, name: s.name }))} />
          </div>

          {/* Data Flow Visualization */}
          {(integrations ?? []).length > 0 && (
            <StoreFlowVisualization
              streams={(stores ?? []) as StoreOverviewData[]}
              integrations={(integrations ?? []) as SpaceIntegrationData[]}
            />
          )}
        </TabsContent>

        {/* Per-Stream Tabs */}
        {activeStreams.map((stream: StoreOverviewData) => {
          const fetchedEntries = streamEntries[stream.id] ?? [];
          const chartData = streamChartData[stream.id] ?? [];
          const isLoading = loadingStreams[stream.id] ?? false;

          const streamIntegrations = (integrations ?? []).filter(
            (i: SpaceIntegrationData) => i.stream.id === stream.id
          );
          const inputIntegration = streamIntegrations.find(
            (i: SpaceIntegrationData) => i.direction.toLowerCase() === "input"
          );

          return (
            <TabsContent key={stream.id} value={stream.id} className="space-y-6 mt-6">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  {/* Overview Card + Chart */}
                  <div className="grid grid-cols-1 lg:grid-cols-8 gap-6 items-stretch">
                    <div className="lg:col-span-3 flex">
                      <StoreOverviewCard
                        stream={stream}
                        spaceSlug={slug}
                        integrationId={inputIntegration?.id}
                        className="w-full"
                      />
                    </div>
                    <div className="lg:col-span-5 flex">
                      <ReserveChart
                        data={chartData}
                        unit={stream.unit ?? ""}
                        title={`${stream.name} History`}
                        className="w-full"
                      />
                    </div>
                  </div>

                  {/* Stream-specific Data Flow */}
                  {streamIntegrations.length > 0 && (
                    <StoreFlowVisualization
                      streams={[stream] as StoreOverviewData[]}
                      integrations={streamIntegrations as SpaceIntegrationData[]}
                    />
                  )}

                  {/* Reserve History */}
                  <ReserveHistoryList
                    entries={fetchedEntries}
                    variant="compact"
                    maxItems={20}
                    showMoreLink={`/spaces/${slug}/activity`}
                    title={`${stream.name} Entries`}
                  />
                </>
              )}
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}
