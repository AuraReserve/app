/**
 * Asset Type Utilities
 *
 * Centralized utilities for handling asset type formatting, colors, labels, and icons.
 * This eliminates duplication across multiple pages and components.
 */

/**
 * Available icons for asset types (lucide-react icon names)
 */
export const ASSET_TYPE_ICONS = [
  { value: "gem", label: "Gem" },
  { value: "coins", label: "Coins" },
  { value: "circle-dollar-sign", label: "Dollar" },
  { value: "bitcoin", label: "Bitcoin" },
  { value: "diamond", label: "Diamond" },
  { value: "bar-chart-3", label: "Bar Chart" },
  { value: "shield", label: "Shield" },
  { value: "cube", label: "Cube" },
  { value: "droplets", label: "Droplets" },
  { value: "flame", label: "Flame" },
  { value: "leaf", label: "Leaf" },
  { value: "mountain", label: "Mountain" },
  { value: "sparkles", label: "Sparkles" },
  { value: "star", label: "Star" },
  { value: "zap", label: "Zap" },
  { value: "box", label: "Box" },
  { value: "circle-dot", label: "Circle Dot" },
  { value: "hexagon", label: "Hexagon" },
] as const;

export type AssetTypeIconValue = typeof ASSET_TYPE_ICONS[number]["value"];

/**
 * Asset type color mappings for badge styling
 */
export const assetTypeColors: Record<string, string> = {
  gold: "bg-yellow-100 text-yellow-800 border-yellow-200",
  silver: "bg-slate-100 text-slate-800 border-slate-200",
  gemstones: "bg-emerald-100 text-emerald-800 border-emerald-200",
  platinum: "bg-zinc-100 text-zinc-800 border-zinc-200",
  palladium: "bg-gray-100 text-gray-800 border-gray-200",
  diamonds: "bg-blue-100 text-blue-800 border-blue-200",
  crypto: "bg-orange-100 text-orange-800 border-orange-200",
  other: "bg-purple-100 text-purple-800 border-purple-200"
};

/**
 * Get Tailwind CSS classes for an asset type badge
 *
 * @param assetType - The asset type identifier
 * @returns Tailwind CSS classes for the badge
 */
export function getAssetTypeClass(assetType?: string | null): string {
  if (!assetType) return "bg-slate-100 text-slate-800 border-slate-200";
  return assetTypeColors[assetType] ?? "bg-slate-100 text-slate-800 border-slate-200";
}

/**
 * Format asset type identifier into human-readable label
 *
 * Converts snake_case, kebab-case, or space-separated strings into Title Case.
 *
 * @example
 * formatAssetTypeLabel('gold') // 'Gold'
 * formatAssetTypeLabel('gemstones') // 'Gemstones'
 * formatAssetTypeLabel('precious_metals') // 'Precious Metals'
 *
 * @param assetType - The asset type identifier
 * @returns Formatted human-readable label
 */
export function formatAssetTypeLabel(assetType?: string | null): string {
  if (!assetType) return "Unknown";
  return assetType
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
