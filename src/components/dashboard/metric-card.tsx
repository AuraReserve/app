"use client";

import React, { memo } from "react";
import { LucideIcon, TrendingUp, TrendingDown, Minus } from "lucide-react";

const colorVariants = {
  gold: {
    gradient: "from-amber-500 to-yellow-500",
    bg: "bg-gradient-to-br from-amber-50 to-yellow-50",
    border: "border-amber-200/50",
    icon: "text-amber-600",
    iconBg: "bg-amber-100",
    accent: "text-amber-600",
    glow: "shadow-amber-500/10",
  },
  emerald: {
    gradient: "from-emerald-500 to-teal-500",
    bg: "bg-gradient-to-br from-emerald-50 to-teal-50",
    border: "border-emerald-200/50",
    icon: "text-emerald-600",
    iconBg: "bg-emerald-100",
    accent: "text-emerald-600",
    glow: "shadow-emerald-500/10",
  },
  navy: {
    gradient: "from-slate-700 to-slate-900",
    bg: "bg-gradient-to-br from-slate-50 to-slate-100",
    border: "border-slate-200/50",
    icon: "text-slate-700",
    iconBg: "bg-slate-100",
    accent: "text-slate-600",
    glow: "shadow-slate-500/10",
  },
  violet: {
    gradient: "from-violet-500 to-purple-500",
    bg: "bg-gradient-to-br from-violet-50 to-purple-50",
    border: "border-violet-200/50",
    icon: "text-violet-600",
    iconBg: "bg-violet-100",
    accent: "text-violet-600",
    glow: "shadow-violet-500/10",
  },
  rose: {
    gradient: "from-rose-500 to-red-500",
    bg: "bg-gradient-to-br from-rose-50 to-red-50",
    border: "border-rose-200/50",
    icon: "text-rose-600",
    iconBg: "bg-rose-100",
    accent: "text-rose-600",
    glow: "shadow-rose-500/10",
  },
};

interface MetricCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: string;
  color?: keyof typeof colorVariants;
  size?: "default" | "large";
  highlighted?: boolean;
  className?: string;
}

function MetricCard({
  title,
  value,
  icon: Icon,
  trend,
  color = "navy",
  size = "default",
  highlighted = false,
  className = "",
}: MetricCardProps) {
  const colors = colorVariants[color];

  // Determine trend direction for icon
  const getTrendIcon = () => {
    if (!trend) return null;
    if (trend.includes("+") || trend.toLowerCase().includes("new")) {
      return <TrendingUp className="w-3.5 h-3.5" />;
    }
    if (trend.includes("-")) {
      return <TrendingDown className="w-3.5 h-3.5" />;
    }
    return <Minus className="w-3.5 h-3.5" />;
  };

  const isLarge = size === "large";

  return (
    <div
      className={`
        group relative overflow-hidden rounded-xl border bg-white
        ${colors.border} ${colors.glow}
        transition-all duration-300 ease-out
        hover:shadow-lg hover:-translate-y-0.5
        ${highlighted ? "ring-2 ring-amber-400/50 animate-pulse-glow" : ""}
        ${className}
      `}
    >
      {/* Subtle gradient overlay */}
      <div
        className={`
          absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300
          ${colors.bg}
        `}
      />

      {/* Decorative gradient accent */}
      <div
        className={`
          absolute -top-12 -right-12 w-32 h-32 rounded-full opacity-[0.08]
          bg-gradient-to-br ${colors.gradient}
          group-hover:scale-150 transition-transform duration-500 ease-out
        `}
      />

      {/* Content */}
      <div className={`relative ${isLarge ? "p-8" : "p-6"}`}>
        {/* Icon */}
        <div
          className={`
            inline-flex items-center justify-center rounded-xl
            ${colors.iconBg} ${isLarge ? "p-4" : "p-3"}
            transition-transform duration-300 group-hover:scale-105
          `}
        >
          <Icon className={`${colors.icon} ${isLarge ? "w-7 h-7" : "w-5 h-5"}`} />
        </div>

        {/* Metrics */}
        <div className={`${isLarge ? "mt-6" : "mt-4"} space-y-1`}>
          <p className="text-sm font-medium text-muted-foreground tracking-wide">
            {title}
          </p>
          <p
            className={`
              font-bold text-foreground tracking-tight
              ${isLarge ? "text-5xl" : "text-3xl"}
            `}
          >
            {typeof value === "number" ? value.toLocaleString() : value}
          </p>

          {/* Trend indicator */}
          {trend && (
            <div
              className={`
                inline-flex items-center gap-1.5 mt-2 px-2.5 py-1 rounded-full
                text-xs font-semibold ${colors.accent}
                bg-gradient-to-r ${colors.bg}
              `}
            >
              {getTrendIcon()}
              <span>{trend}</span>
            </div>
          )}
        </div>
      </div>

      {/* Bottom accent line */}
      <div
        className={`
          absolute bottom-0 left-0 right-0 h-1
          bg-gradient-to-r ${colors.gradient}
          transform scale-x-0 group-hover:scale-x-100
          transition-transform duration-300 ease-out origin-left
        `}
      />
    </div>
  );
}

export default memo(MetricCard);
