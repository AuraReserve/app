"use client";

import { format } from "date-fns";

/**
 * Shared recharts axis and tooltip configuration used across
 * ReserveChart and StoreCharts to eliminate duplicated config.
 */

export const CHART_COLORS = {
  grid: "hsl(220 13% 91%)",
  tick: "hsl(220 9% 46%)",
  emerald: "hsl(160 84% 39%)",
  emeraldLight: "hsl(160 84% 50%)",
  blue: "hsl(217 91% 60%)",
  green: "hsl(142 71% 45%)",
} as const;

export const timeXAxisProps = (ticks: number[]) =>
  ({
    dataKey: "ts",
    type: "number" as const,
    scale: "time" as const,
    domain: ["dataMin", "dataMax"] as [string, string],
    ticks,
    tickFormatter: (tick: number) => format(new Date(tick), "MMM yyyy"),
    tick: { fontSize: 10, fill: CHART_COLORS.tick },
    tickLine: false,
    axisLine: false,
  }) as const;

export function formatYTick(tick: number): string {
  if (tick >= 1_000_000) return `${(tick / 1_000_000).toFixed(1)}M`;
  if (tick >= 1_000) return `${(tick / 1_000).toFixed(1)}K`;
  return tick.toLocaleString();
}

export const compactYAxisProps = (width = 55) =>
  ({
    width,
    tickFormatter: formatYTick,
    tick: { fontSize: 10, fill: CHART_COLORS.tick },
    tickLine: false,
    axisLine: false,
  }) as const;

export function ChartTooltip({
  active,
  payload,
  unit,
  label,
  dateFormat = "MMM d, yyyy",
}: {
  active?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: ReadonlyArray<Record<string, any>>;
  unit?: string;
  label?: string;
  dateFormat?: string;
}) {
  if (!active || !payload?.[0]) return null;
  const ts = payload[0].payload?.ts as number;
  return (
    <div className="bg-white/95 backdrop-blur-sm p-2 rounded-lg border shadow-lg text-xs">
      <p className="text-slate-400">{format(new Date(ts), dateFormat)}</p>
      <p className="font-bold">
        {label && `${label}: `}
        {(payload[0].value as number).toLocaleString()}
        {unit && ` ${unit}`}
      </p>
    </div>
  );
}
