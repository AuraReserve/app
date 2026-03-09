import { prisma } from "@/lib/prisma";
import { spaceRoute, ApiSuccess } from "@/lib/api";

// GET /api/spaces/[spaceId]/analytics?range=7d|30d|90d|all
export const GET = spaceRoute(
  { label: "space analytics" },
  async ({ params, request }) => {
    const { spaceId } = params;
    const url = new URL(request.url);
    const range = url.searchParams.get("range") || "30d";

    const now = new Date();
    let since: Date | null = null;
    if (range === "7d") since = new Date(now.getTime() - 7 * 86400000);
    else if (range === "30d") since = new Date(now.getTime() - 30 * 86400000);
    else if (range === "90d") since = new Date(now.getTime() - 90 * 86400000);

    const dateFilter = since ? { gte: since } : undefined;

    // Run all queries in parallel
    const [
      apiCalls,
      apiCallAggregates,
      statusCodeGroups,
      apiKeyStats,
      integrationRuns,
      streamStats,
    ] = await Promise.all([
      // Raw API calls for time series + percentiles + recent list
      prisma.apiCall.findMany({
        where: { spaceId, createdDate: dateFilter },
        select: {
          id: true,
          statusCode: true,
          responseTimeMs: true,
          ipAddress: true,
          userAgent: true,
          createdDate: true,
          apiKeyId: true,
          apiKey: { select: { keyPrefix: true, name: true } },
        },
        orderBy: { createdDate: "desc" },
        take: 10000, // cap for safety
      }),

      // Aggregates
      prisma.apiCall.aggregate({
        where: { spaceId, createdDate: dateFilter },
        _count: true,
        _avg: { responseTimeMs: true },
      }),

      // Status code groups
      prisma.apiCall.groupBy({
        by: ["statusCode"],
        where: { spaceId, createdDate: dateFilter },
        _count: true,
        orderBy: { _count: { statusCode: "desc" } },
      }),

      // API key usage stats
      prisma.integrationApiKey.findMany({
        where: {
          spaceIntegration: { spaceId },
        },
        select: {
          id: true,
          name: true,
          keyPrefix: true,
          isActive: true,
          usageCount: true,
          lastUsed: true,
          createdDate: true,
        },
        orderBy: { usageCount: "desc" },
      }),

      // Integration run logs
      prisma.integrationRunLog.findMany({
        where: {
          spaceIntegration: { spaceId },
          createdDate: dateFilter,
        },
        select: {
          id: true,
          status: true,
          durationMs: true,
          createdDate: true,
          spaceIntegration: {
            select: {
              id: true,
              integration: { select: { key: true, displayName: true } },
              stream: { select: { name: true } },
            },
          },
        },
        orderBy: { createdDate: "desc" },
        take: 500,
      }),

      // Stream stats
      prisma.dataStream.findMany({
        where: { spaceId, isActive: true },
        select: {
          id: true,
          name: true,
          _count: { select: { entries: true } },
        },
      }),
    ]);

    // --- Compute response time percentiles ---
    const responseTimes = apiCalls
      .map((c) => c.responseTimeMs)
      .filter((t): t is number => t !== null)
      .sort((a, b) => a - b);

    const percentile = (arr: number[], p: number) => {
      if (arr.length === 0) return null;
      const idx = Math.ceil((p / 100) * arr.length) - 1;
      return arr[Math.max(0, idx)];
    };

    // --- Build time series (calls over time) ---
    const bucketMs = range === "7d" ? 3600000 : 86400000; // hourly for 7d, daily otherwise
    const bucketMap = new Map<number, { count: number; totalMs: number; errors: number }>();

    for (const call of apiCalls) {
      const ts = Math.floor(call.createdDate.getTime() / bucketMs) * bucketMs;
      const bucket = bucketMap.get(ts) || { count: 0, totalMs: 0, errors: 0 };
      bucket.count++;
      if (call.responseTimeMs) bucket.totalMs += call.responseTimeMs;
      if (call.statusCode >= 400) bucket.errors++;
      bucketMap.set(ts, bucket);
    }

    const callsOverTime = Array.from(bucketMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([ts, b]) => ({
        date: new Date(ts).toISOString(),
        count: b.count,
        avgResponseTimeMs: b.count > 0 ? Math.round(b.totalMs / b.count) : 0,
        errorCount: b.errors,
      }));

    // --- Per-key call stats from apiCalls ---
    const keyCallMap = new Map<string, { count: number; totalMs: number; errors: number }>();
    for (const call of apiCalls) {
      if (!call.apiKeyId) continue;
      const entry = keyCallMap.get(call.apiKeyId) || { count: 0, totalMs: 0, errors: 0 };
      entry.count++;
      if (call.responseTimeMs) entry.totalMs += call.responseTimeMs;
      if (call.statusCode >= 400) entry.errors++;
      keyCallMap.set(call.apiKeyId, entry);
    }

    const apiKeyUsage = apiKeyStats.map((key) => {
      const stats = keyCallMap.get(key.id);
      return {
        ...key,
        periodCalls: stats?.count ?? 0,
        avgResponseTimeMs: stats && stats.count > 0 ? Math.round(stats.totalMs / stats.count) : null,
        periodErrors: stats?.errors ?? 0,
      };
    });

    // --- Unique IPs ---
    const uniqueIps = new Set(apiCalls.map((c) => c.ipAddress)).size;

    // --- Status code breakdown ---
    const statusCodeBreakdown = statusCodeGroups.map((g) => ({
      statusCode: g.statusCode,
      count: g._count,
    }));

    // --- Integration health ---
    const integrationMap = new Map<string, {
      integrationId: string;
      integrationName: string;
      streamName: string | null;
      totalRuns: number;
      successCount: number;
      totalDurationMs: number;
      lastRunDate: Date | null;
      lastRunStatus: string | null;
    }>();

    for (const run of integrationRuns) {
      const key = run.spaceIntegration.id;
      const entry = integrationMap.get(key) || {
        integrationId: run.spaceIntegration.id,
        integrationName: run.spaceIntegration.integration.displayName,
        streamName: run.spaceIntegration.stream?.name ?? null,
        totalRuns: 0,
        successCount: 0,
        totalDurationMs: 0,
        lastRunDate: null,
        lastRunStatus: null,
      };
      entry.totalRuns++;
      if (run.status === "success") entry.successCount++;
      if (run.durationMs) entry.totalDurationMs += run.durationMs;
      if (!entry.lastRunDate || run.createdDate > entry.lastRunDate) {
        entry.lastRunDate = run.createdDate;
        entry.lastRunStatus = run.status;
      }
      integrationMap.set(key, entry);
    }

    const integrationHealth = Array.from(integrationMap.values()).map((e) => ({
      ...e,
      avgDurationMs: e.totalRuns > 0 ? Math.round(e.totalDurationMs / e.totalRuns) : null,
      successRate: e.totalRuns > 0 ? Math.round((e.successCount / e.totalRuns) * 100) : null,
    }));

    // --- Recent calls (last 50) ---
    const recentCalls = apiCalls.slice(0, 50).map((c) => ({
      id: c.id,
      statusCode: c.statusCode,
      responseTimeMs: c.responseTimeMs,
      ipAddress: c.ipAddress,
      userAgent: c.userAgent,
      apiKeyName: c.apiKey?.name ?? null,
      apiKeyPrefix: c.apiKey?.keyPrefix ?? null,
      createdDate: c.createdDate.toISOString(),
    }));

    const errorCount = apiCalls.filter((c) => c.statusCode >= 400).length;
    const totalCalls = apiCallAggregates._count;

    return ApiSuccess.ok({
      summary: {
        totalCalls,
        avgResponseTimeMs: Math.round(apiCallAggregates._avg.responseTimeMs ?? 0),
        errorRate: totalCalls > 0 ? Math.round((errorCount / totalCalls) * 1000) / 10 : 0,
        successRate: totalCalls > 0 ? Math.round(((totalCalls - errorCount) / totalCalls) * 1000) / 10 : 100,
        p50ResponseTimeMs: percentile(responseTimes, 50),
        p95ResponseTimeMs: percentile(responseTimes, 95),
        p99ResponseTimeMs: percentile(responseTimes, 99),
        uniqueIps,
        activeApiKeys: apiKeyStats.filter((k) => k.isActive).length,
        totalApiKeys: apiKeyStats.length,
        totalEntries: streamStats.reduce((sum, s) => sum + s._count.entries, 0),
        activeStreams: streamStats.length,
      },
      callsOverTime,
      statusCodeBreakdown,
      apiKeyUsage,
      integrationHealth,
      recentCalls,
      range,
    });
  }
);
