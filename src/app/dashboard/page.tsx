"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Space,
  ApiCall,
  AuditLog,
} from "@/lib/entities";
import type {
  Space as SpaceType,
  ApiCall as ApiCallType,
  AuditLog as AuditLogType,
} from "@/lib/entities/types";
import { Building2, Shield, Activity, Sparkles, Database } from "lucide-react";

import MetricCard from "@/components/dashboard/metric-card";
import RecentActivity from "@/components/dashboard/recent-activity";
import SpaceOverview from "@/components/dashboard/space-overview";
import { PAGINATION_LIMITS } from "@/constants/pagination";
import { useCurrentUser } from "@/hooks/useCurrentUser";

export default function Dashboard() {
  const [spaces, setSpaces] = useState<SpaceType[]>([]);
  const [apiCalls, setApiCalls] = useState<ApiCallType[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogType[]>([]);
  const [totalReserveEntries, setTotalReserveEntries] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const { user: currentUser } = useCurrentUser();

  const loadDashboardData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [spacesData, callsData, logsData, statsData] = await Promise.all([
        Space.list('-created_date', PAGINATION_LIMITS.DASHBOARD_SPACES),
        ApiCall.list('-created_date', PAGINATION_LIMITS.DASHBOARD_API_CALLS),
        AuditLog.list('-created_date', PAGINATION_LIMITS.DASHBOARD_AUDIT_LOGS),
        fetch('/api/dashboard/stats', { credentials: 'include' }).then(r => r.ok ? r.json() : { totalReserveEntries: 0 }),
      ]);

      setSpaces(spacesData);
      setApiCalls(callsData);
      setAuditLogs(logsData);
      setTotalReserveEntries(statsData.totalReserveEntries);
    } catch (error) {
      console.error("Error loading dashboard data:", error);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  // Memoize computed metrics to avoid recalculation on each render
  const metrics = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const apiCallsToday = apiCalls.filter(call => call.created_date?.startsWith(today)).length;
    const apiCallsYesterday = apiCalls.filter(call => call.created_date?.startsWith(yesterdayStr)).length;
    const activeSpaces = spaces.filter(space => space.is_active).length;
    const spacesThisWeek = spaces.filter(space => new Date(space.created_date) >= weekAgo).length;
    const recentActivityCount = auditLogs.length;

    // Calculate API calls trend
    let apiCallsTrend: string;
    if (apiCallsYesterday === 0) {
      apiCallsTrend = apiCallsToday > 0 ? "New activity" : "No calls yet";
    } else {
      const change = Math.round((apiCallsToday - apiCallsYesterday) / apiCallsYesterday * 100);
      if (change > 0) apiCallsTrend = `+${change}% from yesterday`;
      else if (change < 0) apiCallsTrend = `${change}% from yesterday`;
      else apiCallsTrend = "Same as yesterday";
    }

    // Calculate spaces trend
    const spacesTrend = spacesThisWeek === 0 ? "No new spaces" : `+${spacesThisWeek} this week`;

    return {
      recentActivityCount,
      apiCallsToday,
      activeSpaces,
      apiCallsTrend,
      spacesTrend,
    };
  }, [auditLogs, apiCalls, spaces]);

  // Memoize greeting based on time (only changes when hour changes)
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  }, []);

  // Memoize space data for RecentActivity to prevent unnecessary re-renders
  const spaceIdNameMap = useMemo(
    () => spaces.map(s => ({ id: s.id, name: s.name })),
    [spaces]
  );

  return (
    <div className="min-h-screen bg-gradient-radial">
      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* Hero Header */}
        <div className="opacity-0 animate-fade-up" style={{ animationFillMode: 'forwards' }}>
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                <Sparkles className="w-4 h-4 text-amber-500" />
                <span>Dashboard Overview</span>
              </div>
              <h1 className="text-4xl font-bold text-foreground tracking-tight">
                {greeting},{" "}
                <span className="bg-gradient-to-r from-amber-600 to-yellow-500 bg-clip-text text-transparent">
                  {currentUser?.name?.split(" ")[0] || currentUser?.email?.split("@")[0] || "User"}
                </span>
              </h1>
              <p className="text-muted-foreground mt-2 text-lg">
                Here's what's happening with your audited reserves
              </p>
            </div>

            {/* Quick status indicator */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 border border-emerald-200 rounded-full">
                <span className="relative flex h-2 w-2">
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="text-sm font-medium text-emerald-700">All systems healthy</span>
              </div>
            </div>
          </div>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          <div className="opacity-0 animate-fade-up stagger-1" style={{ animationFillMode: 'forwards' }}>
            <MetricCard
              title="Active Spaces"
              value={metrics.activeSpaces}
              icon={Building2}
              trend={metrics.spacesTrend}
              color="navy"
            />
          </div>
          <div className="opacity-0 animate-fade-up stagger-2" style={{ animationFillMode: 'forwards' }}>
            <MetricCard
              title="Total Reserve Entries"
              value={totalReserveEntries}
              icon={Database}
              trend="Across all spaces"
              color="gold"
            />
          </div>
          <div className="opacity-0 animate-fade-up stagger-3" style={{ animationFillMode: 'forwards' }}>
            <MetricCard
              title="Recent Activity"
              value={metrics.recentActivityCount}
              icon={Activity}
              trend="Audit log entries"
              color="emerald"
            />
          </div>
          <div className="opacity-0 animate-fade-up stagger-4" style={{ animationFillMode: 'forwards' }}>
            <MetricCard
              title="API Calls Today"
              value={metrics.apiCallsToday}
              icon={Shield}
              trend={metrics.apiCallsTrend}
              color="violet"
            />
          </div>
        </div>

        {/* Main Content Grid */}
        <div className="grid lg:grid-cols-3 gap-6">
          <div
            className="lg:col-span-2 opacity-0 animate-fade-up stagger-5"
            style={{ animationFillMode: 'forwards' }}
          >
            <SpaceOverview spaces={spaces} isLoading={isLoading} />
          </div>

          <div
            className="opacity-0 animate-fade-up stagger-6"
            style={{ animationFillMode: 'forwards' }}
          >
            <RecentActivity
              auditLogs={auditLogs}
              isLoading={isLoading}
              spaces={spaceIdNameMap}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
