"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Lock } from "lucide-react";

export function SpacePageSkeleton() {
  return (
    <div className="p-6 bg-slate-50 min-h-screen">
      <div className="max-w-4xl mx-auto space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    </div>
  );
}

export function SpaceNotFound({ slug }: { slug: string }) {
  return (
    <div className="p-6 bg-slate-50 min-h-screen">
      <div className="max-w-4xl mx-auto space-y-6 text-center">
        <h1 className="text-2xl font-semibold text-slate-900">Space not found</h1>
        <p className="text-slate-600">
          We couldn&apos;t locate a space with slug &ldquo;{slug}&rdquo;.
        </p>
        <Link href="/spaces">
          <Button variant="ghost">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Spaces
          </Button>
        </Link>
      </div>
    </div>
  );
}

export function AccessRestricted({
  slug: _slug,
  spaceName,
  backHref,
  message,
}: {
  slug: string;
  spaceName?: string;
  backHref: string;
  message?: string;
}) {
  return (
    <div className="p-6 bg-slate-50 min-h-screen">
      <div className="max-w-4xl mx-auto space-y-6">
        <Link href={backHref}>
          <Button variant="ghost" className="w-fit">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to {spaceName ?? "Space"}
          </Button>
        </Link>
        <Card className="shadow-sm border-slate-200">
          <CardContent className="py-12 text-center space-y-4">
            <Lock className="w-12 h-12 mx-auto text-slate-400" />
            <h2 className="text-2xl font-semibold text-slate-900">Access Restricted</h2>
            <p className="text-slate-600 max-w-md mx-auto">
              {message ?? "Only space administrators can access this section. You have read-only access to this space."}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
