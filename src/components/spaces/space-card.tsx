"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Settings, ArrowRight } from "lucide-react";
import { formatDate } from "@/lib/formatters";
import { getAssetTypeClass, formatAssetTypeLabel } from "@/lib/asset-types";

interface SpaceCardProps {
  space: {
    id: string;
    name: string;
    slug: string;
    description?: string;
    created_date: string;
    is_active: boolean;
    asset_types?: string[];
  };
}


export function SpaceCard({ space }: SpaceCardProps) {
  const router = useRouter();

  return (
    <div
      role="link"
      tabIndex={0}
      className="block h-full cursor-pointer"
      onClick={() => router.push(`/spaces/${space.slug}`)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          router.push(`/spaces/${space.slug}`);
        }
      }}
    >
      <Card
        className={`
          group relative overflow-hidden cursor-pointer
          border-border bg-white h-full flex flex-col
          transition-all duration-300 ease-out
          hover:shadow-xl hover:shadow-slate-200/50 hover:-translate-y-1
          ${!space.is_active ? 'opacity-70' : ''}
        `}
      >
        {/* Top accent bar */}
        <div
          className={`
            absolute top-0 left-0 right-0 h-1
            bg-gradient-to-r from-slate-700 to-slate-900
            transform origin-left scale-x-0 group-hover:scale-x-100
            transition-transform duration-300 ease-out
          `}
        />

        {/* Decorative gradient */}
        <div
          className={`
            absolute -top-16 -right-16 w-32 h-32 rounded-full
            bg-slate-50 opacity-50
            group-hover:scale-150 transition-transform duration-500 ease-out
          `}
        />

        <CardHeader className="relative pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <CardTitle className="text-lg font-semibold text-foreground truncate mb-2 group-hover:text-slate-900">
                {space.name}
              </CardTitle>
              {!space.is_active && (
                <Badge variant="secondary" className="text-xs">
                  Inactive
                </Badge>
              )}
            </div>
          </div>
          {space.asset_types && space.asset_types.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {space.asset_types.map((type) => (
                <Badge
                  key={type}
                  variant="outline"
                  className={`text-xs font-medium border ${getAssetTypeClass(type)}`}
                >
                  {formatAssetTypeLabel(type)}
                </Badge>
              ))}
            </div>
          )}
        </CardHeader>

        <CardContent className="relative flex flex-col flex-1">
          {/* Description */}
          {space.description && (
            <p className="text-muted-foreground text-sm mb-4 line-clamp-2">
              {space.description}
            </p>
          )}

          {/* Metadata */}
          <div className="space-y-2 text-sm flex-1">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Created</span>
              <span className="font-medium text-foreground">
                {formatDate(space.created_date)}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 mt-5 pt-4 border-t border-border">
            <Button
              variant="default"
              className="flex-1 h-10"
              asChild
            >
              <span className="inline-flex items-center whitespace-nowrap">
                Open Space
                <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-0.5 transition-transform" />
              </span>
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-10 w-10 border-border hover:bg-slate-50"
              aria-label={`Open settings for ${space.name}`}
              asChild
            >
              <Link
                href={`/spaces/${space.slug}/settings`}
                onClick={(event) => event.stopPropagation()}
              >
                <Settings className="w-4 h-4" />
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
