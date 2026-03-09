"use client";

import { Circle } from "lucide-react";
import { STATUS_DOT_COLORS } from "@/lib/artifact-types";

export function StatusDot({ status }: { status: string }) {
  const color = STATUS_DOT_COLORS[status.toLowerCase()] ?? "text-slate-300";
  return <Circle className={`w-2.5 h-2.5 fill-current ${color}`} />;
}
