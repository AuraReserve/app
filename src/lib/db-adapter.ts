/**
 * Database Adapter Utilities
 * Handles differences between PostgreSQL and SQLite data types
 */

import { Prisma } from '@prisma/client';

// Check if we're using SQLite based on DATABASE_URL
const isSQLite = () => {
  return process.env.DATABASE_URL?.startsWith('file:') ?? false;
};

/**
 * Parse JSON string to array for SQLite, passthrough for PostgreSQL
 */
export function parseArrayField<T = string>(value: T[] | string | null | undefined): T[] {
  if (value === null || value === undefined) {
    return [];
  }

  // If it's already an array, return it
  if (Array.isArray(value)) {
    return value;
  }

  // If it's a string (SQLite), parse it
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  return [];
}

/**
 * Parse JSON string to object for SQLite, passthrough for PostgreSQL
 */
export function parseJsonField<T = Record<string, unknown>>(value: Prisma.JsonValue | string | null | undefined): T {
  if (value === null || value === undefined) {
    return {} as T;
  }

  // If it's already an object, return it
  if (typeof value === 'object' && !Array.isArray(value)) {
    return value as T;
  }

  // If it's a string (SQLite), parse it
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return {} as T;
    }
  }

  return {} as T;
}

/**
 * Convert array to JSON string for SQLite, passthrough for PostgreSQL
 */
export function serializeArrayField<T = string>(value: T[]): T[] | string {
  if (!isSQLite()) {
    return value;
  }
  return JSON.stringify(value);
}

/**
 * Convert object to JSON string for SQLite, passthrough for PostgreSQL
 */
export function serializeJsonField<T = Record<string, unknown>>(value: T): T | string {
  if (!isSQLite()) {
    return value;
  }
  return JSON.stringify(value);
}

/**
 * Wrap Prisma query results to handle SQLite JSON fields
 */
export function adaptApiKey<T extends { allowedOrigins: string[] | string | null | undefined }>(apiKey: T) {
  return {
    ...apiKey,
    allowedOrigins: parseArrayField(apiKey.allowedOrigins),
  };
}

/**
 * Wrap Prisma query results to handle SQLite JSON fields
 */
export function adaptAuditLog<T extends { details: Prisma.JsonValue | string | null | undefined; oldValues: Prisma.JsonValue | string | null | undefined; newValues: Prisma.JsonValue | string | null | undefined }>(auditLog: T) {
  return {
    ...auditLog,
    details: parseJsonField(auditLog.details),
    oldValues: parseJsonField(auditLog.oldValues),
    newValues: parseJsonField(auditLog.newValues),
  };
}
