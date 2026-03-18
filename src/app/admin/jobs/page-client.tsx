"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { RefreshCw, Trash2, RotateCcw, AlertCircle, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";

interface JobCounts {
  active: number;
  waiting: number;
  completed: number;
  failed: number;
  delayed: number;
  paused?: number;
}

interface Job {
  id: string;
  name: string;
  data: unknown;
  attemptsMade: number;
  failedReason?: string;
  processedOn?: number;
  finishedOn?: number;
  timestamp: number;
}

interface Scheduler {
  key: string;
  pattern?: string;
  next?: number;
}

interface JobsData {
  counts: JobCounts;
  jobs: Job[];
  schedulers: Scheduler[];
}

type TabState = "failed" | "active" | "delayed" | "completed";

const STATE_LABELS: Record<TabState, string> = {
  failed: "Failed",
  active: "Active",
  delayed: "Scheduled",
  completed: "Completed",
};

const COUNT_CARDS: Array<{ key: keyof JobCounts; label: string; color: string }> = [
  { key: "active", label: "Active", color: "text-blue-600" },
  { key: "waiting", label: "Waiting", color: "text-yellow-600" },
  { key: "completed", label: "Completed", color: "text-green-600" },
  { key: "failed", label: "Failed", color: "text-red-600" },
  { key: "delayed", label: "Scheduled", color: "text-purple-600" },
];

export default function JobsPageClient() {
  const [data, setData] = useState<JobsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabState>("failed");
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionInFlight, setActionInFlight] = useState<string | null>(null);

  const fetchData = useCallback(async (tab: TabState = activeTab) => {
    try {
      const res = await fetch(`/api/admin/jobs?state=${tab}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch {
      // silently ignore polling errors
    } finally {
      setIsLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    setIsLoading(true);
    fetchData(activeTab);
  }, [activeTab, fetchData]);

  useEffect(() => {
    const interval = setInterval(() => fetchData(activeTab), 10_000);
    return () => clearInterval(interval);
  }, [activeTab, fetchData]);

  const postAction = async (body: Record<string, unknown>, successMsg: string) => {
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await fetch("/api/admin/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Action failed");
      }
      setActionSuccess(successMsg);
      await fetchData(activeTab);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Action failed");
    }
  };

  const handleRetry = async (jobId: string) => {
    setActionInFlight(`retry-${jobId}`);
    await postAction({ action: "retry", jobId }, "Job queued for retry");
    setActionInFlight(null);
  };

  const handleRemove = async (jobId: string) => {
    setActionInFlight(`remove-${jobId}`);
    await postAction({ action: "remove", jobId }, "Job removed");
    setActionInFlight(null);
  };

  const handleClean = async () => {
    setActionInFlight("clean");
    await postAction({ action: "clean", olderThanDays: 7 }, "Completed jobs older than 7 days cleaned");
    setActionInFlight(null);
  };

  const formatTs = (ts?: number) => {
    if (!ts) return "—";
    return format(new Date(ts), "MMM d, HH:mm:ss");
  };

  const counts = data?.counts;

  return (
    <div className="p-6 bg-slate-50 min-h-screen">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Job Queue</h1>
            <p className="text-slate-500 text-sm mt-1">Monitor and manage background jobs</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setIsLoading(true); fetchData(activeTab); }}
              disabled={isLoading}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleClean}
              disabled={actionInFlight === "clean"}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Clean Completed
            </Button>
          </div>
        </div>

        {/* Alerts */}
        {actionError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{actionError}</AlertDescription>
          </Alert>
        )}
        {actionSuccess && (
          <Alert className="bg-green-50 border-green-200">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800">{actionSuccess}</AlertDescription>
          </Alert>
        )}

        {/* Count Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          {COUNT_CARDS.map(({ key, label, color }) => (
            <Card key={key}>
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                  {label}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <p className={`text-3xl font-bold ${color}`}>
                  {counts ? (counts[key] ?? 0) : "—"}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Scheduled Jobs (Schedulers) */}
        {data?.schedulers && data.schedulers.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Repeatable Schedulers</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-2 pr-4 font-medium text-slate-600">Key</th>
                      <th className="text-left py-2 pr-4 font-medium text-slate-600">Pattern</th>
                      <th className="text-left py-2 font-medium text-slate-600">Next Run</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.schedulers.map((s) => (
                      <tr key={s.key} className="border-b border-slate-100 last:border-0">
                        <td className="py-2 pr-4 font-mono text-xs text-slate-700">{s.key}</td>
                        <td className="py-2 pr-4 text-slate-600">{s.pattern ?? "—"}</td>
                        <td className="py-2 text-slate-600">{formatTs(s.next)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Jobs Table */}
        <Card>
          <CardHeader className="pb-0">
            {/* Tab Bar */}
            <div className="flex gap-1 border-b border-slate-200 -mx-6 px-6">
              {(Object.keys(STATE_LABELS) as TabState[]).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab
                      ? "border-blue-600 text-blue-600"
                      : "border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300"
                  }`}
                >
                  {STATE_LABELS[tab]}
                  {counts && tab === "failed" && counts.failed > 0 && (
                    <Badge variant="destructive" className="ml-2 text-xs px-1.5 py-0">
                      {counts.failed}
                    </Badge>
                  )}
                  {counts && tab === "active" && counts.active > 0 && (
                    <Badge className="ml-2 text-xs px-1.5 py-0 bg-blue-600">
                      {counts.active}
                    </Badge>
                  )}
                </button>
              ))}
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            {isLoading ? (
              <div className="text-center py-12">
                <p className="text-slate-500">Loading jobs...</p>
              </div>
            ) : !data?.jobs || data.jobs.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-slate-400">No {STATE_LABELS[activeTab].toLowerCase()} jobs</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-2 pr-4 font-medium text-slate-600">ID</th>
                      <th className="text-left py-2 pr-4 font-medium text-slate-600">Name</th>
                      <th className="text-left py-2 pr-4 font-medium text-slate-600">Attempts</th>
                      <th className="text-left py-2 pr-4 font-medium text-slate-600">Created</th>
                      <th className="text-left py-2 pr-4 font-medium text-slate-600">Processed</th>
                      {activeTab === "failed" && (
                        <th className="text-left py-2 pr-4 font-medium text-slate-600">Reason</th>
                      )}
                      {activeTab === "failed" && (
                        <th className="text-right py-2 font-medium text-slate-600">Actions</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {data.jobs.map((job) => (
                      <tr key={job.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                        <td className="py-2 pr-4 font-mono text-xs text-slate-500">{job.id}</td>
                        <td className="py-2 pr-4 font-medium text-slate-800">{job.name}</td>
                        <td className="py-2 pr-4 text-slate-600">{job.attemptsMade}</td>
                        <td className="py-2 pr-4 text-slate-500 whitespace-nowrap">{formatTs(job.timestamp)}</td>
                        <td className="py-2 pr-4 text-slate-500 whitespace-nowrap">{formatTs(job.processedOn)}</td>
                        {activeTab === "failed" && (
                          <td className="py-2 pr-4 text-red-600 text-xs max-w-xs truncate" title={job.failedReason}>
                            {job.failedReason ?? "—"}
                          </td>
                        )}
                        {activeTab === "failed" && (
                          <td className="py-2 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleRetry(job.id)}
                                disabled={actionInFlight === `retry-${job.id}`}
                              >
                                <RotateCcw className="w-3 h-3 mr-1" />
                                Retry
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-red-600 hover:text-red-700 hover:border-red-300"
                                onClick={() => handleRemove(job.id)}
                                disabled={actionInFlight === `remove-${job.id}`}
                              >
                                <Trash2 className="w-3 h-3 mr-1" />
                                Remove
                              </Button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
