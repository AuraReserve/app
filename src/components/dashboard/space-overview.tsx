"use client";

import React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Building2, Plus, ExternalLink } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { Space as SpaceType } from "@/lib/entities/types";
import { getAssetTypeClass, formatAssetTypeLabel } from "@/lib/asset-types";
import { formatDate } from "@/lib/formatters";
import { PAGINATION_LIMITS } from "@/constants/pagination";

interface SpaceOverviewProps {
  spaces: SpaceType[];
  isLoading: boolean;
}

export default function SpaceOverview({ spaces, isLoading }: SpaceOverviewProps) {
  if (isLoading) {
    return (
      <Card className="shadow-sm border-slate-200">
        <CardHeader>
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent className="space-y-4">
          {Array(3).fill(0).map((_, i) => (
            <div key={i} className="flex justify-between items-center p-4 border border-slate-200 rounded-lg">
              <div className="space-y-2">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-24" />
              </div>
              <Skeleton className="h-6 w-16" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-sm border-slate-200">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-slate-900">
          <Building2 className="w-5 h-5" />
          Your Spaces
        </CardTitle>
        <Link href="/spaces">
          <Button size="sm" className="bg-white text-black border border-slate-300 hover:bg-slate-50">
            <Plus className="w-4 h-4 mr-2" />
            Create Space
          </Button>
        </Link>
      </CardHeader>
      <CardContent>
        {spaces.length === 0 ? (
          <div className="text-center py-12">
            <Building2 className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-slate-900 mb-2">No spaces yet</h3>
            <p className="text-slate-500 mb-6">Create your first space to start tracking reserves</p>
            <Link href="/spaces">
              <Button>
                Create First Space
              </Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {spaces.slice(0, PAGINATION_LIMITS.OVERVIEW_SPACES).map((space) => (
              <Link
                key={space.id}
                href={`/spaces/${space.slug}`}
                className="flex justify-between items-center p-4 border border-slate-200 rounded-lg hover:border-slate-300 transition-colors group"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-semibold text-slate-900 group-hover:text-blue-600">
                      {space.name}
                    </h3>
                    {!space.is_active && (
                      <Badge variant="secondary" className="text-xs">Inactive</Badge>
                    )}
                    {(space as SpaceType & { asset_types?: string[] }).asset_types?.map((type) => (
                      <Badge
                        key={type}
                        variant="outline"
                        className={`text-xs font-medium border ${getAssetTypeClass(type)}`}
                      >
                        {formatAssetTypeLabel(type)}
                      </Badge>
                    ))}
                  </div>
                  <p className="text-sm text-slate-600 mb-2">{space.description}</p>
                  <p className="text-xs text-slate-400">
                    Created {formatDate(space.created_date)}
                  </p>
                </div>
                <ExternalLink className="w-4 h-4 text-slate-400 group-hover:text-blue-600" />
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
