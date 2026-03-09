"use client";

import {
  Gem,
  Coins,
  CircleDollarSign,
  Bitcoin,
  Diamond,
  BarChart3,
  Shield,
  Box,
  Droplets,
  Flame,
  Leaf,
  Mountain,
  Sparkles,
  Star,
  Zap,
  CircleDot,
  Hexagon,
  type LucideProps,
} from "lucide-react";
import type { FC } from "react";

const ICON_MAP: Record<string, FC<LucideProps>> = {
  gem: Gem,
  coins: Coins,
  "circle-dollar-sign": CircleDollarSign,
  bitcoin: Bitcoin,
  diamond: Diamond,
  "bar-chart-3": BarChart3,
  shield: Shield,
  cube: Box,
  droplets: Droplets,
  flame: Flame,
  leaf: Leaf,
  mountain: Mountain,
  sparkles: Sparkles,
  star: Star,
  zap: Zap,
  box: Box,
  "circle-dot": CircleDot,
  hexagon: Hexagon,
};

interface AssetTypeIconProps extends LucideProps {
  icon?: string | null;
}

export function AssetTypeIcon({ icon, ...props }: AssetTypeIconProps) {
  if (!icon) return null;
  const Icon = ICON_MAP[icon];
  if (!Icon) return null;
  return <Icon {...props} />;
}

export { ICON_MAP };
