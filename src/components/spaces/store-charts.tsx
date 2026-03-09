"use client";

import React, { memo, useMemo, useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart3, TrendingUp, Database, TreeDeciduous } from "lucide-react";
import { subDays } from "date-fns";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import { generateMonthlyTicks } from "@/lib/chart-utils";
import {
  CHART_COLORS,
  timeXAxisProps,
  compactYAxisProps,
  ChartTooltip,
} from "@/components/charts/chart-primitives";

interface StoreInfo {
  id: string;
  name: string;
  slug: string;
  artifactType: string;
  unit: string | null;
}

interface StoreChartsProps {
  streams: StoreInfo[];
  spaceId: string;
}

interface EntryData {
  id: string;
  value: number | null;
  artifactData: Record<string, unknown> | null;
  timestamp: string;
  ripcord: boolean;
}

type DateRange = "7d" | "30d" | "90d" | "all";

const DATE_RANGES: { label: string; value: DateRange }[] = [
  { label: "7D", value: "7d" },
  { label: "30D", value: "30d" },
  { label: "90D", value: "90d" },
  { label: "All", value: "all" },
];

function getFromDate(range: DateRange): Date | null {
  switch (range) {
    case "7d":
      return subDays(new Date(), 7);
    case "30d":
      return subDays(new Date(), 30);
    case "90d":
      return subDays(new Date(), 90);
    default:
      return null;
  }
}

function ValueChart({
  data,
  unit,
}: {
  data: Array<{ date: string; value: number }>;
  unit: string;
}) {
  const timeData = useMemo(
    () => data.map((d) => ({ ...d, ts: new Date(d.date).getTime() })),
    [data]
  );

  const ticks = useMemo(() => {
    if (timeData.length < 2) return [];
    return generateMonthlyTicks(timeData[0].ts, timeData[timeData.length - 1].ts);
  }, [timeData]);

  if (data.length < 2) {
    return (
      <div className="h-[200px] flex flex-col items-center justify-center text-center">
        <BarChart3 className="w-8 h-8 text-slate-200 mb-2" />
        <p className="text-sm text-slate-400">Not enough data for chart</p>
      </div>
    );
  }

  return (
    <div style={{ height: 200 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={timeData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="valueGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(217 91% 60%)" stopOpacity={0.3} />
              <stop offset="100%" stopColor="hsl(217 91% 60%)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} vertical={false} />
          <XAxis {...timeXAxisProps(ticks)} />
          <YAxis {...compactYAxisProps()} />
          <Tooltip
            content={({ active, payload }) => (
              <ChartTooltip active={active} payload={payload} unit={unit} />
            )}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke={CHART_COLORS.blue}
            strokeWidth={2}
            fill="url(#valueGradient)"
            dot={false}
            activeDot={{ r: 4, fill: "white", stroke: "hsl(217 91% 60%)", strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function ArtifactIcon({ type }: { type: string }) {
  if (type !== "value") return <TreeDeciduous className="w-4 h-4" />;
  return <Database className="w-4 h-4" />;
}

const ARTIFACT_BADGE: Record<string, string> = {
  value: "bg-blue-100 text-blue-800",
  merkle_tree: "bg-green-100 text-green-800",
  merkle_sum_tree: "bg-purple-100 text-purple-800",
  sparse_merkle_tree: "bg-amber-100 text-amber-800",
};

export const StoreCharts = memo(function StoreCharts({
  streams,
  spaceId,
}: StoreChartsProps) {
  const [dateRange, setDateRange] = useState<DateRange>("90d");
  const [activeStream, setActiveStream] = useState<string>(streams[0]?.id ?? "");
  const [entriesMap, setEntriesMap] = useState<Record<string, EntryData[]>>({});
  const [loading, setLoading] = useState(false);

  const fetchEntries = useCallback(
    async (streamId: string, range: DateRange) => {
      const from = getFromDate(range);
      const params = new URLSearchParams({ limit: "200" });
      if (from) params.set("from", from.toISOString());

      const response = await fetch(
        `/api/spaces/${spaceId}/stores/${streamId}/entries?${params}`
      );
      if (!response.ok) return [];
      const data = await response.json();
      return (data.entries ?? []) as EntryData[];
    },
    [spaceId]
  );

  useEffect(() => {
    if (!activeStream) return;

    let cancelled = false;
    setLoading(true);

    fetchEntries(activeStream, dateRange).then((entries) => {
      if (cancelled) return;
      setEntriesMap((prev) => ({ ...prev, [activeStream]: entries }));
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [activeStream, dateRange, fetchEntries]);

  if (streams.length === 0) return null;

  const currentStream = streams.find((s) => s.id === activeStream) ?? streams[0];
  const entries = entriesMap[activeStream] ?? [];
  const isValueType = currentStream.artifactType.toLowerCase() === "value";

  // Transform entries for charts
  const valueChartData = entries
    .filter((e) => e.value != null)
    .map((e) => ({
      date: e.timestamp,
      value: e.value!,
    }))
    .reverse();

  const merkleChartData = entries
    .map((e) => {
      const ad = e.artifactData as Record<string, unknown> | null;
      return {
        date: e.timestamp,
        leafCount: typeof ad?.leafCount === "number" ? ad.leafCount : 0,
        totalBalance: typeof ad?.totalBalance === "number" ? ad.totalBalance : 0,
      };
    })
    .reverse();

  return (
    <Card className="shadow-sm border-slate-200">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-blue-600" />
            Data Store Charts
          </CardTitle>
          <div className="flex items-center gap-1">
            {DATE_RANGES.map((r) => (
              <Button
                key={r.value}
                variant={dateRange === r.value ? "default" : "ghost"}
                size="sm"
                className="h-7 px-2.5 text-xs"
                onClick={() => setDateRange(r.value)}
              >
                {r.label}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {streams.length > 1 ? (
          <Tabs
            value={activeStream}
            onValueChange={setActiveStream}
            className="space-y-4"
          >
            <TabsList className="h-auto flex-wrap">
              {streams.map((s) => (
                <TabsTrigger
                  key={s.id}
                  value={s.id}
                  className="text-xs gap-1.5"
                >
                  <ArtifactIcon type={s.artifactType.toLowerCase()} />
                  {s.name}
                </TabsTrigger>
              ))}
            </TabsList>
            {streams.map((s) => (
              <TabsContent key={s.id} value={s.id}>
                <StreamChartContent
                  stream={s}
                  isValueType={s.artifactType.toLowerCase() === "value"}
                  valueChartData={
                    s.id === activeStream ? valueChartData : []
                  }
                  merkleChartData={
                    s.id === activeStream ? merkleChartData : []
                  }
                  loading={loading && s.id === activeStream}
                />
              </TabsContent>
            ))}
          </Tabs>
        ) : (
          <StreamChartContent
            stream={currentStream}
            isValueType={isValueType}
            valueChartData={valueChartData}
            merkleChartData={merkleChartData}
            loading={loading}
          />
        )}
      </CardContent>
    </Card>
  );
});

function StreamChartContent({
  stream,
  isValueType,
  valueChartData,
  merkleChartData,
  loading,
}: {
  stream: StoreInfo;
  isValueType: boolean;
  valueChartData: Array<{ date: string; value: number }>;
  merkleChartData: Array<{
    date: string;
    leafCount: number;
    totalBalance: number;
  }>;
  loading: boolean;
}) {
  const artifactKey = stream.artifactType.toLowerCase();

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm">
        <Badge
          className={`text-xs ${ARTIFACT_BADGE[artifactKey] ?? "bg-slate-100 text-slate-800"}`}
        >
          {artifactKey === "value" ? "Value" : "Merkle"}
        </Badge>
        {stream.unit && (
          <span className="text-slate-400 text-xs">Unit: {stream.unit}</span>
        )}
      </div>
      {loading ? (
        <div className="h-[200px] flex items-center justify-center">
          <div className="animate-pulse text-sm text-slate-400">Loading...</div>
        </div>
      ) : isValueType ? (
        <ValueChart data={valueChartData} unit={stream.unit ?? ""} />
      ) : (
        <ValueChart
          data={merkleChartData
            .filter((d) => d.totalBalance > 0)
            .map((d) => ({ date: d.date, value: d.totalBalance }))}
          unit=""
        />
      )}
    </div>
  );
}
