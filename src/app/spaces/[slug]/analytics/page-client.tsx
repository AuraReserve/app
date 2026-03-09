"use client";

import React, { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  BarChart3,
  Database,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Activity,
  Globe,
  Key,
  Zap,
  TrendingUp,
  Server,
} from "lucide-react";
import Link from "next/link";
import { useSpace } from "@/hooks/useSpace";
import { useAsyncData } from "@/hooks/useAsyncData";
import { SpacePageSkeleton } from "@/components/spaces/space-page-shell";
import { StoreCharts } from "@/components/spaces/store-charts";
import type { StoreOverviewData } from "@/components/spaces/store-overview-card";
import { format } from "date-fns";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

interface AnalyticsPageProps {
  slug: string;
}

type TimeRange = "7d" | "30d" | "90d" | "all";

interface AnalyticsData {
  summary: {
    totalCalls: number;
    avgResponseTimeMs: number;
    errorRate: number;
    successRate: number;
    p50ResponseTimeMs: number | null;
    p95ResponseTimeMs: number | null;
    p99ResponseTimeMs: number | null;
    uniqueIps: number;
    activeApiKeys: number;
    totalApiKeys: number;
    totalEntries: number;
    activeStreams: number;
  };
  callsOverTime: Array<{
    date: string;
    count: number;
    avgResponseTimeMs: number;
    errorCount: number;
  }>;
  statusCodeBreakdown: Array<{
    statusCode: number;
    count: number;
  }>;
  apiKeyUsage: Array<{
    id: string;
    name: string;
    keyPrefix: string;
    isActive: boolean;
    usageCount: number;
    lastUsed: string | null;
    createdDate: string;
    periodCalls: number;
    avgResponseTimeMs: number | null;
    periodErrors: number;
  }>;
  integrationHealth: Array<{
    integrationId: string;
    integrationName: string;
    streamName: string | null;
    totalRuns: number;
    successCount: number;
    avgDurationMs: number | null;
    successRate: number | null;
    lastRunDate: string | null;
    lastRunStatus: string | null;
  }>;
  recentCalls: Array<{
    id: string;
    statusCode: number;
    responseTimeMs: number | null;
    ipAddress: string;
    userAgent: string;
    apiKeyName: string | null;
    apiKeyPrefix: string | null;
    createdDate: string;
  }>;
  range: string;
}

const STATUS_COLORS: Record<string, string> = {
  "2xx": "#22c55e",
  "3xx": "#3b82f6",
  "4xx": "#f59e0b",
  "5xx": "#ef4444",
};

function statusCategory(code: number): string {
  if (code < 300) return "2xx";
  if (code < 400) return "3xx";
  if (code < 500) return "4xx";
  return "5xx";
}

function formatMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "—";
  if (ms < 1) return "<1ms";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function StatusBadge({ code }: { code: number }) {
  const cat = statusCategory(code);
  const variant = cat === "2xx" ? "default" : cat === "4xx" ? "secondary" : "destructive";
  return (
    <Badge variant={variant} className="font-mono text-xs">
      {code}
    </Badge>
  );
}

export default function AnalyticsPage({ slug }: AnalyticsPageProps) {
  const { space, isLoading: spacesLoading } = useSpace(slug);
  const [range, setRange] = useState<TimeRange>("30d");

  const { data: analytics, isLoading: analyticsLoading } = useAsyncData<AnalyticsData>({
    fetchFn: async () => {
      if (!space?.id) return null;
      const res = await fetch(`/api/spaces/${space.id}/analytics?range=${range}`);
      if (!res.ok) return null;
      return res.json();
    },
    deps: [space?.id, range],
    autoLoad: !!space?.id,
  });

  const { data: streams } = useAsyncData<StoreOverviewData[]>({
    fetchFn: async () => {
      if (!space?.id) return [];
      const res = await fetch(`/api/spaces/${space.id}/stores`);
      if (!res.ok) return [];
      return res.json();
    },
    deps: [space?.id],
    autoLoad: !!space?.id,
  });

  // Group status codes into categories for pie chart
  const statusPieData = useMemo(() => {
    if (!analytics?.statusCodeBreakdown) return [];
    const groups: Record<string, number> = {};
    for (const { statusCode, count } of analytics.statusCodeBreakdown) {
      const cat = statusCategory(statusCode);
      groups[cat] = (groups[cat] || 0) + count;
    }
    return Object.entries(groups).map(([name, value]) => ({ name, value }));
  }, [analytics?.statusCodeBreakdown]);

  if (spacesLoading || !space) {
    return <SpacePageSkeleton />;
  }

  const s = analytics?.summary;
  const loading = analyticsLoading || !analytics;

  return (
    <div className="p-4 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href={`/spaces/${slug}`}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h1 className="text-2xl font-bold">Analytics</h1>
        </div>

        {/* Time range selector */}
        <div className="flex gap-1 bg-muted rounded-lg p-1">
          {(["7d", "30d", "90d", "all"] as TimeRange[]).map((r) => (
            <Button
              key={r}
              variant={range === r ? "default" : "ghost"}
              size="sm"
              className="text-xs px-3"
              onClick={() => setRange(r)}
            >
              {r === "all" ? "All" : r}
            </Button>
          ))}
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard
          icon={<BarChart3 className="h-4 w-4" />}
          label="Total API Calls"
          value={loading ? "—" : s!.totalCalls.toLocaleString()}
        />
        <StatCard
          icon={<Clock className="h-4 w-4" />}
          label="Avg Response"
          value={loading ? "—" : formatMs(s!.avgResponseTimeMs)}
        />
        <StatCard
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="Success Rate"
          value={loading ? "—" : `${s!.successRate}%`}
          valueColor={!loading && s!.successRate >= 99 ? "text-green-600" : !loading && s!.successRate < 95 ? "text-red-600" : undefined}
        />
        <StatCard
          icon={<AlertTriangle className="h-4 w-4" />}
          label="Error Rate"
          value={loading ? "—" : `${s!.errorRate}%`}
          valueColor={!loading && s!.errorRate > 5 ? "text-red-600" : !loading && s!.errorRate > 0 ? "text-amber-600" : undefined}
        />
        <StatCard
          icon={<Globe className="h-4 w-4" />}
          label="Unique IPs"
          value={loading ? "—" : s!.uniqueIps.toLocaleString()}
        />
        <StatCard
          icon={<Key className="h-4 w-4" />}
          label="Active Keys"
          value={loading ? "—" : `${s!.activeApiKeys} / ${s!.totalApiKeys}`}
        />
      </div>

      {/* Response Time Percentiles */}
      {!loading && s && (s.p50ResponseTimeMs !== null || s.p95ResponseTimeMs !== null) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <Zap className="h-4 w-4" />
              Response Time Percentiles
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-8">
              <PercentileBar label="p50 (median)" value={s.p50ResponseTimeMs} maxMs={s.p99ResponseTimeMs ?? s.p95ResponseTimeMs ?? 1000} />
              <PercentileBar label="p95" value={s.p95ResponseTimeMs} maxMs={s.p99ResponseTimeMs ?? 1000} />
              <PercentileBar label="p99" value={s.p99ResponseTimeMs} maxMs={s.p99ResponseTimeMs ?? 1000} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Charts Row: API Calls Over Time + Status Code Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* API Calls Over Time */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <Activity className="h-4 w-4" />
              API Calls Over Time
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading || !analytics?.callsOverTime?.length ? (
              <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm">
                {loading ? "Loading..." : "No API call data yet"}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={analytics.callsOverTime}>
                  <defs>
                    <linearGradient id="callsGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="errorsGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(d) => format(new Date(d), range === "7d" ? "MMM d HH:mm" : "MMM d")}
                    tick={{ fontSize: 11 }}
                    className="text-muted-foreground"
                  />
                  <YAxis tick={{ fontSize: 11 }} className="text-muted-foreground" />
                  <Tooltip
                    labelFormatter={(d) => format(new Date(d as string), "PPp")}
                    formatter={(value, name) => [
                      value as number,
                      name === "count" ? "Calls" : name === "errorCount" ? "Errors" : String(name),
                    ]}
                    contentStyle={{ borderRadius: "8px", fontSize: 12 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke="#3b82f6"
                    fill="url(#callsGrad)"
                    strokeWidth={2}
                    name="count"
                  />
                  <Area
                    type="monotone"
                    dataKey="errorCount"
                    stroke="#ef4444"
                    fill="url(#errorsGrad)"
                    strokeWidth={2}
                    name="errorCount"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Status Code Breakdown */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <Server className="h-4 w-4" />
              Status Codes
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading || !statusPieData.length ? (
              <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm">
                {loading ? "Loading..." : "No data"}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={statusPieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={2}
                    dataKey="value"
                    label={({ name, percent }) => `${name} (${((percent ?? 0) * 100).toFixed(0)}%)`}
                  >
                    {statusPieData.map((entry) => (
                      <Cell key={entry.name} fill={STATUS_COLORS[entry.name] || "#94a3b8"} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => [value as number, "Calls"]} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Response Time Over Time */}
      {!loading && analytics?.callsOverTime && analytics.callsOverTime.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Average Response Time Over Time
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={analytics.callsOverTime}>
                <defs>
                  <linearGradient id="rtGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(d) => format(new Date(d), range === "7d" ? "MMM d HH:mm" : "MMM d")}
                  tick={{ fontSize: 11 }}
                  className="text-muted-foreground"
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => formatMs(v)}
                  className="text-muted-foreground"
                />
                <Tooltip
                  labelFormatter={(d) => format(new Date(d as string), "PPp")}
                  formatter={(value) => [formatMs(value as number), "Avg Response Time"]}
                  contentStyle={{ borderRadius: "8px", fontSize: 12 }}
                />
                <Area
                  type="monotone"
                  dataKey="avgResponseTimeMs"
                  stroke="#8b5cf6"
                  fill="url(#rtGrad)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* API Key Usage Table */}
      {!loading && analytics?.apiKeyUsage && analytics.apiKeyUsage.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <Key className="h-4 w-4" />
              API Key Usage
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Key</th>
                    <th className="pb-2 pr-4 font-medium">Status</th>
                    <th className="pb-2 pr-4 font-medium text-right">Total Calls</th>
                    <th className="pb-2 pr-4 font-medium text-right">Period Calls</th>
                    <th className="pb-2 pr-4 font-medium text-right">Avg Response</th>
                    <th className="pb-2 pr-4 font-medium text-right">Errors</th>
                    <th className="pb-2 font-medium text-right">Last Used</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.apiKeyUsage.map((key) => (
                    <tr key={key.id} className="border-b border-muted/50 hover:bg-muted/30">
                      <td className="py-2.5 pr-4">
                        <div className="font-medium">{key.name}</div>
                        <div className="text-xs text-muted-foreground font-mono">{key.keyPrefix}...</div>
                      </td>
                      <td className="py-2.5 pr-4">
                        <Badge variant={key.isActive ? "default" : "secondary"} className="text-xs">
                          {key.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                      <td className="py-2.5 pr-4 text-right font-mono">{key.usageCount.toLocaleString()}</td>
                      <td className="py-2.5 pr-4 text-right font-mono">{key.periodCalls.toLocaleString()}</td>
                      <td className="py-2.5 pr-4 text-right font-mono">{formatMs(key.avgResponseTimeMs)}</td>
                      <td className="py-2.5 pr-4 text-right font-mono">
                        <span className={key.periodErrors > 0 ? "text-red-600" : ""}>
                          {key.periodErrors}
                        </span>
                      </td>
                      <td className="py-2.5 text-right text-muted-foreground text-xs">
                        {key.lastUsed ? format(new Date(key.lastUsed), "MMM d, HH:mm") : "Never"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Integration Health */}
      {!loading && analytics?.integrationHealth && analytics.integrationHealth.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Integration Health
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {analytics.integrationHealth.map((integration) => (
                <div
                  key={integration.integrationId}
                  className="rounded-lg border p-4 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-sm">{integration.integrationName}</div>
                      {integration.streamName && (
                        <div className="text-xs text-muted-foreground">{integration.streamName}</div>
                      )}
                    </div>
                    <Badge
                      variant={
                        integration.lastRunStatus === "success"
                          ? "default"
                          : integration.lastRunStatus === "error"
                            ? "destructive"
                            : "secondary"
                      }
                      className="text-xs"
                    >
                      {integration.lastRunStatus ?? "—"}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <div className="text-lg font-semibold">{integration.totalRuns}</div>
                      <div className="text-xs text-muted-foreground">Runs</div>
                    </div>
                    <div>
                      <div className={`text-lg font-semibold ${(integration.successRate ?? 0) >= 95 ? "text-green-600" : (integration.successRate ?? 0) < 80 ? "text-red-600" : "text-amber-600"}`}>
                        {integration.successRate !== null ? `${integration.successRate}%` : "—"}
                      </div>
                      <div className="text-xs text-muted-foreground">Success</div>
                    </div>
                    <div>
                      <div className="text-lg font-semibold">{formatMs(integration.avgDurationMs)}</div>
                      <div className="text-xs text-muted-foreground">Avg Time</div>
                    </div>
                  </div>
                  {integration.lastRunDate && (
                    <div className="text-xs text-muted-foreground">
                      Last run: {format(new Date(integration.lastRunDate), "MMM d, HH:mm")}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent API Calls Log */}
      {!loading && analytics?.recentCalls && analytics.recentCalls.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <Database className="h-4 w-4" />
              Recent API Calls
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Time</th>
                    <th className="pb-2 pr-4 font-medium">Status</th>
                    <th className="pb-2 pr-4 font-medium text-right">Response Time</th>
                    <th className="pb-2 pr-4 font-medium">API Key</th>
                    <th className="pb-2 pr-4 font-medium">IP Address</th>
                    <th className="pb-2 font-medium">User Agent</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.recentCalls.map((call) => (
                    <tr key={call.id} className="border-b border-muted/50 hover:bg-muted/30">
                      <td className="py-2 pr-4 text-xs text-muted-foreground whitespace-nowrap">
                        {format(new Date(call.createdDate), "MMM d, HH:mm:ss")}
                      </td>
                      <td className="py-2 pr-4">
                        <StatusBadge code={call.statusCode} />
                      </td>
                      <td className="py-2 pr-4 text-right font-mono text-xs">
                        {formatMs(call.responseTimeMs)}
                      </td>
                      <td className="py-2 pr-4 text-xs">
                        {call.apiKeyName ? (
                          <span title={`${call.apiKeyPrefix}...`}>{call.apiKeyName}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-2 pr-4 font-mono text-xs">{call.ipAddress}</td>
                      <td className="py-2 text-xs text-muted-foreground max-w-[200px] truncate">
                        {call.userAgent}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Data Stream Charts (existing) */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Data Stream History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <StoreCharts
            streams={(streams ?? []) as StoreOverviewData[]}
            spaceId={space.id}
          />
        </CardContent>
      </Card>
    </div>
  );
}

// --- Sub-components ---

function StatCard({
  icon,
  label,
  value,
  valueColor,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-1 pt-4 px-4">
        <CardTitle className="text-xs text-muted-foreground flex items-center gap-1.5">
          {icon}
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <div className={`text-xl font-bold ${valueColor || ""}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function PercentileBar({
  label,
  value,
  maxMs,
}: {
  label: string;
  value: number | null;
  maxMs: number;
}) {
  const pct = value !== null && maxMs > 0 ? Math.min(100, (value / maxMs) * 100) : 0;
  const color =
    value !== null && value < 200
      ? "bg-green-500"
      : value !== null && value < 500
        ? "bg-amber-500"
        : "bg-red-500";

  return (
    <div>
      <div className="flex justify-between items-baseline mb-1">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="font-mono font-semibold text-sm">{formatMs(value)}</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
