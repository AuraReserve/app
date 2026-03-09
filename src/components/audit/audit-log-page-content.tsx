"use client";

import { useState, useEffect } from "react";
import { AuditLog, Space } from "@/lib/entities";
import type {
  AuditLog as AuditLogType,
  Space as SpaceType,
} from "@/lib/entities/types";
import { Filter, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import AuditLogList from "@/components/audit/audit-log-list";

interface AuditLogPageContentProps {
  /** If set, scopes logs to this space (by slug). */
  spaceSlug?: string;
  /** Whether to show the space name column in results. */
  showSpaceName: boolean;
  /** Default empty state message. */
  emptyMessage?: string;
}

export function AuditLogPageContent({
  spaceSlug,
  showSpaceName,
  emptyMessage = "No audit logs found",
}: AuditLogPageContentProps) {
  const [auditLogs, setAuditLogs] = useState<AuditLogType[]>([]);
  const [spaces, setSpaces] = useState<SpaceType[]>([]);
  const [space, setSpace] = useState<SpaceType | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [resourceFilter, setResourceFilter] = useState<string>("all");
  const [spaceFilter, setSpaceFilter] = useState<string>("all");
  const [limit, setLimit] = useState(50);

  const isGlobal = !spaceSlug;

  useEffect(() => {
    let isMounted = true;

    const fetchData = async () => {
      setIsLoading(true);
      try {
        // For space-scoped, resolve slug to space first
        let resolvedSpaceId: string | undefined;
        if (spaceSlug) {
          const spacesData = await Space.filter({ slug: spaceSlug });
          if (spacesData.length === 0) {
            if (isMounted) setAuditLogs([]);
            return;
          }
          if (isMounted) setSpace(spacesData[0]);
          resolvedSpaceId = spacesData[0].id;
        }

        const filterCriteria: Partial<AuditLogType> = {};
        if (resolvedSpaceId) filterCriteria.space_id = resolvedSpaceId;
        if (actionFilter !== "all") filterCriteria.action = actionFilter as AuditLogType["action"];
        if (resourceFilter !== "all") filterCriteria.resource_type = resourceFilter as AuditLogType["resource_type"];
        if (isGlobal && spaceFilter !== "all") filterCriteria.space_id = spaceFilter;

        const logsPromise =
          Object.keys(filterCriteria).length > 0
            ? AuditLog.filter(filterCriteria, "-created_date", limit)
            : AuditLog.list("-created_date", limit);

        const promises: [Promise<AuditLogType[]>, Promise<SpaceType[]>?] = [logsPromise];
        if (isGlobal) promises.push(Space.list("-created_date"));

        const [logsData, spacesData] = await Promise.all(promises);
        if (!isMounted) return;

        setAuditLogs(logsData);
        if (spacesData) setSpaces(spacesData);
      } catch (error) {
        if (isMounted) console.error("Error loading audit logs:", error);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    fetchData();
    return () => { isMounted = false; };
  }, [spaceSlug, isGlobal, limit, actionFilter, resourceFilter, spaceFilter]);

  const hasActiveFilters =
    actionFilter !== "all" ||
    resourceFilter !== "all" ||
    (isGlobal && spaceFilter !== "all");

  const clearFilters = () => {
    setActionFilter("all");
    setResourceFilter("all");
    if (isGlobal) setSpaceFilter("all");
  };

  const spacesList = spaceSlug && space
    ? [{ id: space.id, name: space.name }]
    : spaces.map((s) => ({ id: s.id, name: s.name }));

  return (
    <>
      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="w-5 h-5 text-slate-600" />
          <h2 className="text-lg font-semibold text-slate-900">Filters</h2>
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              className="ml-auto text-xs"
            >
              <X className="w-3 h-3 mr-1" />
              Clear all
            </Button>
          )}
        </div>

        <div className={`grid grid-cols-1 gap-4 ${isGlobal ? "md:grid-cols-3 lg:grid-cols-4" : "md:grid-cols-3"}`}>
          <div>
            <label className="text-sm font-medium text-slate-700 mb-2 block">Action</label>
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger><SelectValue placeholder="All actions" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All actions</SelectItem>
                <SelectItem value="create">Create</SelectItem>
                <SelectItem value="update">Update</SelectItem>
                <SelectItem value="delete">Delete</SelectItem>
                <SelectItem value="login">Login</SelectItem>
                <SelectItem value="api_access">API Access</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700 mb-2 block">Resource Type</label>
            <Select value={resourceFilter} onValueChange={setResourceFilter}>
              <SelectTrigger><SelectValue placeholder="All resources" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All resources</SelectItem>
                <SelectItem value="space">Space</SelectItem>
                <SelectItem value="proof_of_reserve">Proof of Reserve</SelectItem>
                <SelectItem value="api_key">API Key</SelectItem>
                <SelectItem value="user">User</SelectItem>
                <SelectItem value="space_member">Space Member</SelectItem>
                <SelectItem value="merkle_tree">Merkle Tree</SelectItem>
                <SelectItem value="settings">Settings</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isGlobal && (
            <div>
              <label className="text-sm font-medium text-slate-700 mb-2 block">Space</label>
              <Select value={spaceFilter} onValueChange={setSpaceFilter}>
                <SelectTrigger><SelectValue placeholder="All spaces" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All spaces</SelectItem>
                  {spaces.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <label className="text-sm font-medium text-slate-700 mb-2 block">Show</label>
            <Select value={limit.toString()} onValueChange={(val) => setLimit(parseInt(val))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="25">Last 25 entries</SelectItem>
                <SelectItem value="50">Last 50 entries</SelectItem>
                <SelectItem value="100">Last 100 entries</SelectItem>
                <SelectItem value="200">Last 200 entries</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {hasActiveFilters && (
          <div className="mt-4 pt-4 border-t border-slate-200">
            <p className="text-sm text-slate-600">
              Showing <span className="font-semibold text-slate-900">{auditLogs.length}</span> filtered audit logs
            </p>
          </div>
        )}
      </div>

      {/* Audit Logs List */}
      <AuditLogList
        auditLogs={auditLogs}
        isLoading={isLoading}
        spaces={spacesList}
        showSpaceName={showSpaceName}
        emptyMessage={hasActiveFilters ? "No audit logs match your filters" : emptyMessage}
      />
    </>
  );
}
