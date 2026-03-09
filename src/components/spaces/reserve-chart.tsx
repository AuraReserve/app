"use client";

import React, { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, BarChart3 } from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import { generateMonthlyTicks } from "@/lib/chart-utils";
import {
  CHART_COLORS,
  timeXAxisProps,
  compactYAxisProps,
  ChartTooltip,
} from "@/components/charts/chart-primitives";

interface ReserveChartProps {
  data: Array<{ date: string; reserve: number }>;
  unit: string;
  title?: string;
  className?: string;
  height?: number;
}

export function ReserveChart({
  data,
  unit,
  title = "Reserve History",
  className = "",
  height = 280,
}: ReserveChartProps) {
  // Calculate trend
  const trend = data.length >= 2
    ? ((data[data.length - 1].reserve - data[0].reserve) / data[0].reserve) * 100
    : 0;

  const isPositiveTrend = trend >= 0;

  // Convert dates to timestamps for proper time-scale spacing
  const timeData = useMemo(
    () => data.map((d) => ({ ...d, ts: new Date(d.date).getTime() })),
    [data]
  );

  const ticks = useMemo(() => {
    if (timeData.length < 2) return [];
    return generateMonthlyTicks(timeData[0].ts, timeData[timeData.length - 1].ts);
  }, [timeData]);

  return (
    <Card className={`card-elevated overflow-hidden h-full ${className}`}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <div className="p-2 rounded-lg bg-emerald-50">
              <TrendingUp className="w-4 h-4 text-emerald-600" />
            </div>
            {title}
          </CardTitle>

          {data.length >= 2 && (
            <div
              className={`
                flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold
                ${isPositiveTrend
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-rose-50 text-rose-700'
                }
              `}
            >
              <TrendingUp
                className={`w-3.5 h-3.5 ${!isPositiveTrend ? 'rotate-180' : ''}`}
              />
              {isPositiveTrend ? '+' : ''}{trend.toFixed(1)}%
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="pt-4" style={{ height: `${height}px` }}>
        {data.length > 1 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={timeData}
              margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id="reserveGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(160 84% 39%)" stopOpacity={0.3} />
                  <stop offset="50%" stopColor="hsl(160 84% 39%)" stopOpacity={0.1} />
                  <stop offset="100%" stopColor="hsl(160 84% 39%)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="strokeGradient" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="hsl(160 84% 39%)" />
                  <stop offset="100%" stopColor="hsl(160 84% 50%)" />
                </linearGradient>
              </defs>

              <CartesianGrid
                strokeDasharray="3 3"
                stroke={CHART_COLORS.grid}
                vertical={false}
              />

              <XAxis
                {...timeXAxisProps(ticks)}
                stroke={CHART_COLORS.tick}
                tick={{ fontSize: 11, fill: CHART_COLORS.tick }}
                axisLine={{ stroke: CHART_COLORS.grid }}
                dy={10}
              />

              <YAxis
                {...compactYAxisProps(70)}
                stroke={CHART_COLORS.tick}
                tick={{ fontSize: 11, fill: CHART_COLORS.tick }}
              />

              <Tooltip
                content={({ active, payload }) => (
                  <ChartTooltip
                    active={active}
                    payload={payload}
                    unit={unit}
                    dateFormat="EEEE, MMMM d, yyyy"
                  />
                )}
                cursor={{
                  stroke: CHART_COLORS.emerald,
                  strokeWidth: 1,
                  strokeDasharray: '4 4',
                }}
              />

              <Area
                type="monotone"
                dataKey="reserve"
                stroke="url(#strokeGradient)"
                strokeWidth={2.5}
                fill="url(#reserveGradient)"
                dot={false}
                activeDot={{
                  r: 6,
                  fill: 'white',
                  stroke: 'hsl(160 84% 39%)',
                  strokeWidth: 2,
                }}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center px-4">
            <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
              <BarChart3 className="w-8 h-8 text-muted-foreground/50" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">
              Not enough data for chart
            </p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Add more reserve entries to see trends
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
