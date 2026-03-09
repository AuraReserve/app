"use client";

import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface EmptyStateCardProps {
  icon: LucideIcon;
  message: string;
}

export function EmptyStateCard({ icon: Icon, message }: EmptyStateCardProps) {
  return (
    <Card>
      <CardContent className="py-12 text-center">
        <Icon className="w-12 h-12 mx-auto text-slate-300 mb-4" />
        <p className="text-sm text-muted-foreground">{message}</p>
      </CardContent>
    </Card>
  );
}
