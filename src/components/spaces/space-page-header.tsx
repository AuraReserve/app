"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SpacePageHeaderProps {
  slug: string;
  spaceName: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
  maxWidth?: string;
}

export function SpacePageHeader({
  slug,
  spaceName,
  title,
  description,
  action,
}: SpacePageHeaderProps) {
  return (
    <>
      <Link href={`/spaces/${slug}`}>
        <Button variant="ghost" className="w-fit">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to {spaceName}
        </Button>
      </Link>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{title}</h1>
          {description && (
            <p className="text-muted-foreground mt-1">{description}</p>
          )}
        </div>
        {action}
      </div>
    </>
  );
}
