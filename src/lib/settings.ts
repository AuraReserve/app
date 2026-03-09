/**
 * Settings Utilities
 * Helper functions for working with application settings
 */

import { prisma } from "@/lib/prisma";

/**
 * Get a setting value by key
 */
export async function getSetting(key: string): Promise<string | null> {
  const setting = await prisma.setting.findUnique({
    where: { key },
  });
  return setting?.value || null;
}

/**
 * Get a boolean setting value
 */
export async function getBooleanSetting(key: string, defaultValue: boolean = false): Promise<boolean> {
  const value = await getSetting(key);
  if (value === null) return defaultValue;
  return value === "true" || value === "1";
}

/**
 * Get a number setting value
 */
export async function getNumberSetting(key: string, defaultValue: number = 0): Promise<number> {
  const value = await getSetting(key);
  if (value === null) return defaultValue;
  const num = parseInt(value, 10);
  return isNaN(num) ? defaultValue : num;
}

/**
 * Set a setting value
 */
export async function setSetting(key: string, value: string, updatedBy?: string): Promise<void> {
  await prisma.setting.upsert({
    where: { key },
    update: {
      value,
      updatedBy,
    },
    create: {
      key,
      value,
      updatedBy,
    },
  });
}

/**
 * Get all settings as a key-value object
 */
export async function getAllSettings(): Promise<Record<string, string>> {
  const settings = await prisma.setting.findMany();
  return settings.reduce((acc, setting) => {
    acc[setting.key] = setting.value;
    return acc;
  }, {} as Record<string, string>);
}

/**
 * Check if signup is enabled
 */
export async function isSignupEnabled(): Promise<boolean> {
  return await getBooleanSetting("signup_enabled", true);
}

/**
 * Check if maintenance mode is active
 */
export async function isMaintenanceMode(): Promise<boolean> {
  return await getBooleanSetting("maintenance_mode", false);
}

// ── Cached registration settings ──────────────────────────────────

export interface RegistrationSettings {
  signupEnabled: boolean;
  allowSelfRegistration: boolean;
  requireEmailVerification: boolean;
}

let cachedSettings: RegistrationSettings | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60_000; // 1 minute

/**
 * Get registration-related settings from the database.
 * Results are cached for 1 minute to avoid hitting the DB on every request.
 */
export async function getRegistrationSettings(): Promise<RegistrationSettings> {
  const now = Date.now();
  if (cachedSettings && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedSettings;
  }

  const settings = await prisma.setting.findMany({
    where: {
      key: {
        in: ["signup_enabled", "allow_self_registration", "require_email_verification"],
      },
    },
  });

  const settingsMap = new Map(settings.map((s) => [s.key, s.value]));

  cachedSettings = {
    signupEnabled: settingsMap.get("signup_enabled") === "true",
    allowSelfRegistration: settingsMap.get("allow_self_registration") === "true",
    requireEmailVerification: settingsMap.get("require_email_verification") === "true",
  };
  cacheTimestamp = now;

  return cachedSettings;
}

/**
 * Clear the settings cache. Call after updating settings via the admin panel.
 */
export function clearSettingsCache(): void {
  cachedSettings = null;
  cacheTimestamp = 0;
}
