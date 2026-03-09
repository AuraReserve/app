"use client";

import React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, Shield, Key, User, ArrowRight, Database } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import Link from "next/link";
import { PAGINATION_LIMITS } from "@/constants/pagination";
import type { AuditLog as AuditLogType } from "@/lib/entities/types";

const getActivityIcon = (action: string, resourceType: string) => {
  if (resourceType === 'data_stream' || resourceType === 'stream_entry') return Database;
  if (resourceType === 'api_key') return Key;
  if (action === 'login') return User;
  return Shield;
};

const getActivityColor = (action: string) => {
  switch (action) {
    case 'create': return 'bg-green-100 text-green-800';
    case 'update': return 'bg-blue-100 text-blue-800';
    case 'delete': return 'bg-red-100 text-red-800';
    case 'login': return 'bg-purple-100 text-purple-800';
    default: return 'bg-gray-100 text-gray-800';
  }
};

interface RecentActivityProps {
  auditLogs: AuditLogType[];
  isLoading: boolean;
  spaces?: { id: string; name: string }[];
}

export default function RecentActivity({ auditLogs, isLoading, spaces = [] }: RecentActivityProps) {
  const getSpaceName = (spaceId?: string) => {
    if (!spaceId) return null;
    const space = spaces.find(s => s.id === spaceId);
    return space?.name || 'Unknown Space';
  };

  if (isLoading) {
    return (
      <Card className="shadow-sm border-slate-200">
        <CardHeader>
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent className="space-y-4">
          {Array(5).fill(0).map((_, i) => (
            <div key={i} className="flex items-start gap-3">
              <Skeleton className="w-8 h-8 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  const activities = auditLogs.slice(0, PAGINATION_LIMITS.DASHBOARD_AUDIT_LOGS);

  return (
    <Card className="shadow-sm border-slate-200">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Recent Activity
          </CardTitle>
          <Link href="/audit-logs">
            <Button variant="ghost" size="sm" className="text-xs">
              View all
              <ArrowRight className="w-3 h-3 ml-1" />
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {activities.length === 0 ? (
          <div className="text-center py-8">
            <Clock className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500">No recent activity</p>
          </div>
        ) : (
          <div className="space-y-4">
            {activities.map((activity) => {
              const IconComponent = getActivityIcon(activity.action, activity.resource_type);
              const spaceName = getSpaceName(activity.space_id);

              return (
                <div key={activity.id} className="flex items-start gap-3" data-testid="recent-activity-item">
                  <div className="p-2 bg-slate-100 rounded-full">
                    <IconComponent className="w-4 h-4 text-slate-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-2 mb-1 flex-wrap">
                      <Badge className={`text-xs ${getActivityColor(activity.action)}`}>
                        {activity.action}
                      </Badge>
                      <span className="text-sm font-medium text-slate-900">
                        {activity.resource_type?.replace('_', ' ')}
                      </span>
                      {spaceName && (
                        <Badge variant="outline" className="text-xs bg-slate-50">
                          {spaceName}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-slate-600 mb-1">
                      Action performed by {activity.user_email?.split('@')[0]}
                    </p>
                    <p className="text-xs text-slate-400">
                      {format(new Date(activity.created_date), "MMM d, h:mm a")}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
