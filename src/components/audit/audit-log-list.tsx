"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Shield,
  Key,
  User,
  FileText,
  Clock,
  Building2,
  Users,
  GitBranch,
  Settings,
  LogIn,
  LogOut,
  Plus,
  Pencil,
  Trash2,
  Activity,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import type { AuditLog as AuditLogType } from "@/lib/entities/types";

/**
 * Get the icon for a resource type
 */
const getResourceIcon = (resourceType: string) => {
  switch (resourceType) {
    case "proof_of_reserve":
      return Shield;
    case "api_key":
      return Key;
    case "user":
      return User;
    case "space":
      return Building2;
    case "space_member":
      return Users;
    case "merkle_tree":
      return GitBranch;
    case "settings":
      return Settings;
    default:
      return FileText;
  }
};

/**
 * Get the icon for an action type
 */
const getActionIcon = (action: string) => {
  switch (action) {
    case "create":
      return Plus;
    case "update":
      return Pencil;
    case "delete":
      return Trash2;
    case "login":
      return LogIn;
    case "logout":
      return LogOut;
    case "api_access":
      return Activity;
    default:
      return FileText;
  }
};

/**
 * Get the color classes for an action type
 */
const getActionColor = (action: string) => {
  switch (action) {
    case "create":
      return "bg-green-100 text-green-800 border-green-200";
    case "update":
      return "bg-blue-100 text-blue-800 border-blue-200";
    case "delete":
      return "bg-red-100 text-red-800 border-red-200";
    case "login":
      return "bg-purple-100 text-purple-800 border-purple-200";
    case "logout":
      return "bg-slate-100 text-slate-800 border-slate-200";
    case "api_access":
      return "bg-orange-100 text-orange-800 border-orange-200";
    default:
      return "bg-gray-100 text-gray-800 border-gray-200";
  }
};

/**
 * Get the color classes for a resource type
 */
const getResourceColor = (resourceType: string) => {
  switch (resourceType) {
    case "proof_of_reserve":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "api_key":
      return "bg-amber-50 text-amber-700 border-amber-200";
    case "user":
      return "bg-violet-50 text-violet-700 border-violet-200";
    case "space":
      return "bg-blue-50 text-blue-700 border-blue-200";
    case "space_member":
      return "bg-indigo-50 text-indigo-700 border-indigo-200";
    case "merkle_tree":
      return "bg-teal-50 text-teal-700 border-teal-200";
    case "settings":
      return "bg-slate-50 text-slate-700 border-slate-200";
    default:
      return "bg-gray-50 text-gray-700 border-gray-200";
  }
};

/**
 * Format a resource type for display
 */
const formatResourceType = (resourceType: string) => {
  const labels: Record<string, string> = {
    proof_of_reserve: "Proof of Reserve",
    api_key: "API Key",
    user: "User",
    space: "Space",
    space_member: "Space Member",
    merkle_tree: "Merkle Tree",
    settings: "Settings",
  };
  return labels[resourceType] || resourceType.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
};

/**
 * Format an action for display
 */
const formatAction = (action: string) => {
  const labels: Record<string, string> = {
    create: "Created",
    update: "Updated",
    delete: "Deleted",
    login: "Login",
    logout: "Logout",
    api_access: "API Access",
  };
  return labels[action] || action.charAt(0).toUpperCase() + action.slice(1);
};

interface AuditLogListProps {
  auditLogs: AuditLogType[];
  isLoading: boolean;
  spaces?: { id: string; name: string }[];
  showSpaceName?: boolean;
  emptyMessage?: string;
  compact?: boolean;
}

export default function AuditLogList({
  auditLogs,
  isLoading,
  spaces = [],
  showSpaceName = true,
  emptyMessage = "No audit logs found",
  compact = false,
}: AuditLogListProps) {
  // Helper function to get space name by ID
  const getSpaceName = (spaceId?: string) => {
    if (!spaceId) return null;
    const space = spaces.find((s) => s.id === spaceId);
    return space?.name || "Unknown Space";
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array(compact ? 5 : 10)
          .fill(0)
          .map((_, i) => (
            <Card key={i} className="shadow-sm border-slate-200">
              <CardContent className={compact ? "p-3" : "p-4"}>
                <div className="flex items-start gap-3">
                  <Skeleton className="w-10 h-10 rounded-full flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-5 w-16" />
                      <Skeleton className="h-5 w-24" />
                      <Skeleton className="h-5 w-32" />
                    </div>
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-3 w-40" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
      </div>
    );
  }

  if (auditLogs.length === 0) {
    return (
      <Card className="shadow-sm border-slate-200">
        <CardContent className="p-12">
          <div className="text-center">
            <Clock className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500 text-lg">{emptyMessage}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {auditLogs.map((log) => {
        const ResourceIcon = getResourceIcon(log.resource_type);
        const ActionIcon = getActionIcon(log.action);
        const spaceName = getSpaceName(log.space_id);

        return (
          <Card
            key={log.id}
            className="shadow-sm border-slate-200 hover:border-slate-300 transition-colors"
          >
            <CardContent className={compact ? "p-3" : "p-4"}>
              <div className="flex items-start gap-3">
                {/* Resource Icon */}
                <div className={`p-2.5 rounded-full flex-shrink-0 ${getResourceColor(log.resource_type).replace("border-", "bg-").split(" ")[0]}`}>
                  <ResourceIcon className={`w-5 h-5 ${getResourceColor(log.resource_type).split(" ")[1]}`} />
                </div>

                <div className="flex-1 min-w-0">
                  {/* Header Row */}
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    {/* Action Badge */}
                    <Badge className={`text-xs font-medium flex items-center gap-1 ${getActionColor(log.action)}`}>
                      <ActionIcon className="w-3 h-3" />
                      {formatAction(log.action)}
                    </Badge>

                    {/* Resource Type */}
                    <Badge variant="outline" className={`text-xs ${getResourceColor(log.resource_type)}`}>
                      {formatResourceType(log.resource_type)}
                    </Badge>

                    {/* Space Name */}
                    {showSpaceName && spaceName && (
                      <Badge
                        variant="outline"
                        className="text-xs bg-blue-50 text-blue-700 border-blue-200"
                      >
                        <Building2 className="w-3 h-3 mr-1" />
                        {spaceName}
                      </Badge>
                    )}
                  </div>

                  {/* Details */}
                  <div className="space-y-1">
                    <p className="text-sm text-slate-700">
                      <span className="font-medium">User:</span>{" "}
                      <span className="text-slate-600">{log.user_email}</span>
                    </p>

                    {/* Show relevant details */}
                    {log.details &&
                      typeof log.details === "object" &&
                      Object.keys(log.details).length > 0 && (
                        <div className="text-sm text-slate-600">
                          <span className="font-medium text-slate-700">Details:</span>{" "}
                          {Object.entries(log.details)
                            .filter(([key]) => !["action"].includes(key))
                            .slice(0, 3)
                            .map(([key, value], idx, arr) => (
                              <span key={key}>
                                {key.replace(/_/g, " ")}: {String(value)}
                                {idx < arr.length - 1 ? ", " : ""}
                              </span>
                            ))}
                        </div>
                      )}

                    {/* Changes Section */}
                    {(log.old_values || log.new_values) &&
                      ((log.old_values && Object.keys(log.old_values).length > 0) ||
                        (log.new_values && Object.keys(log.new_values).length > 0)) && (
                        <details className="text-xs text-slate-500 mt-2">
                          <summary className="cursor-pointer hover:text-slate-700 font-medium">
                            View changes
                          </summary>
                          <div className="mt-2 p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
                            {log.old_values && Object.keys(log.old_values).length > 0 && (
                              <div>
                                <span className="font-semibold text-red-600">Before:</span>
                                <pre className="text-xs mt-1 whitespace-pre-wrap text-slate-600 bg-red-50 p-2 rounded">
                                  {JSON.stringify(log.old_values, null, 2)}
                                </pre>
                              </div>
                            )}
                            {log.new_values && Object.keys(log.new_values).length > 0 && (
                              <div>
                                <span className="font-semibold text-green-600">After:</span>
                                <pre className="text-xs mt-1 whitespace-pre-wrap text-slate-600 bg-green-50 p-2 rounded">
                                  {JSON.stringify(log.new_values, null, 2)}
                                </pre>
                              </div>
                            )}
                          </div>
                        </details>
                      )}
                  </div>

                  {/* Footer */}
                  <div className="flex items-center gap-3 mt-2 text-xs text-slate-400">
                    <span className="flex items-center gap-1" title="When this action was logged in the system">
                      <Clock className="w-3 h-3" />
                      Logged: {format(new Date(log.created_date), "MMM d, yyyy 'at' h:mm a")}
                    </span>
                    <span>•</span>
                    <span title={log.ip_address}>IP: {log.ip_address}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
