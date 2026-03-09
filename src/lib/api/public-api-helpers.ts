/**
 * Shared helpers for public API v1 endpoints.
 * Handles API key extraction, validation, IP/UA sanitization, and call logging.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { IntegrationStatus } from "@prisma/client";
import {
  getActiveSpaceByApiIdentifier,
  validateIntegrationApiKey,
  recordIntegrationApiKeyUsage,
  recordApiCall,
} from "@/lib/dal";

type NextRequestWithOptionalIp = NextRequest & { ip?: string | null };

export function extractApiKey(request: NextRequest): string | null {
  const headerKey = request.headers.get("x-api-key");
  if (headerKey) return headerKey.trim();
  const authorization = request.headers.get("authorization");
  if (authorization && authorization.toLowerCase().startsWith("bearer ")) {
    return authorization.slice(7).trim();
  }
  return null;
}

export function sanitizeIp(ip: string | null | undefined): string {
  if (!ip) return "unknown";
  return ip.split(",")[0].trim().slice(0, 255);
}

export function sanitizeUserAgent(ua: string | null | undefined): string {
  if (!ua) return "unknown";
  return ua.slice(0, 512);
}

export async function logApiCall(
  spaceId: string | null,
  apiKeyId: string | null,
  ipAddress: string,
  userAgent: string,
  statusCode: number,
  responseTimeMs: number | null
) {
  if (!spaceId) return;
  try {
    await recordApiCall({ spaceId, apiKeyId, ipAddress, userAgent, statusCode, responseTimeMs });
  } catch (logError) {
    console.error("Failed to record API call:", logError);
  }
}

export interface PublicApiContext {
  spaceId: string;
  spaceName: string;
  apiKeyId: string | null;
  ipAddress: string;
  userAgent: string;
  startedAt: number;
  spaceIntegration: {
    id: string;
    spaceId: string;
    streamId: string | null;
    integration: { key: string };
  } | null;
}

/**
 * Resolve a space from the API identifier, validate optional API key, and prepare context.
 * Returns null if the space is not found.
 */
export async function resolvePublicApiContext(
  request: NextRequest,
  identifier: string
): Promise<PublicApiContext | null> {
  const fallbackIp = (request as NextRequestWithOptionalIp).ip ?? null;
  const ipHeader = request.headers.get("x-forwarded-for");
  const ipAddress = sanitizeIp(ipHeader ?? fallbackIp);
  const userAgent = sanitizeUserAgent(request.headers.get("user-agent"));
  const startedAt = Date.now();

  const space = await getActiveSpaceByApiIdentifier(identifier);
  if (!space) {
    await logApiCall(null, null, ipAddress, userAgent, 404, Date.now() - startedAt);
    return null;
  }

  let apiKeyId: string | null = null;
  let spaceIntegration: PublicApiContext["spaceIntegration"] = null;

  const providedKey = extractApiKey(request);
  if (providedKey) {
    const keyValidation = await validateIntegrationApiKey(providedKey);
    if (keyValidation.valid && keyValidation.spaceIntegration?.spaceId === space.id) {
      apiKeyId = keyValidation.keyId;
      spaceIntegration = {
        id: keyValidation.spaceIntegration.id,
        spaceId: keyValidation.spaceIntegration.spaceId,
        streamId: keyValidation.spaceIntegration.streamId,
        integration: { key: keyValidation.spaceIntegration.integration.key },
      };
    }
  }

  return {
    spaceId: space.id,
    spaceName: space.name,
    apiKeyId,
    ipAddress,
    userAgent,
    startedAt,
    spaceIntegration,
  };
}

/**
 * Record API key usage if an API key was provided.
 */
export async function recordUsageIfKeyed(apiKeyId: string | null) {
  if (apiKeyId) await recordIntegrationApiKeyUsage(apiKeyId);
}

/**
 * Check if the request is authorized to access a specific stream.
 * Returns null if authorized, or a NextResponse with an error if not.
 *
 * Authorization logic:
 * 1. If an API key was provided, it must be for `api-serve` (matching this stream)
 *    or `api-serve-all`.
 * 2. Without a key, a public `api-serve` or `api-serve-all` integration must exist.
 */
export async function checkStreamAuth(
  ctx: PublicApiContext,
  streamId: string
): Promise<NextResponse | null> {
  if (ctx.apiKeyId && ctx.spaceIntegration) {
    const intKey = ctx.spaceIntegration.integration.key;
    if (intKey === "api-serve-all") return null;
    if (intKey === "api-serve" && ctx.spaceIntegration.streamId === streamId) return null;
    await logApiCall(ctx.spaceId, ctx.apiKeyId, ctx.ipAddress, ctx.userAgent, 401, Date.now() - ctx.startedAt);
    return NextResponse.json({ error: "API key not authorized for this stream" }, { status: 401 });
  }

  // No valid key — check for public api-serve integration for this stream
  const publicServe = await prisma.spaceIntegration.findFirst({
    where: {
      spaceId: ctx.spaceId,
      streamId,
      status: "ACTIVE" as unknown as IntegrationStatus,
      integration: { key: "api-serve" },
    },
  });

  if (publicServe) {
    const config = publicServe.config as Record<string, unknown>;
    if (config?.isPublic) return null;
  }

  // Check for public api-serve-all integration
  const publicAll = await prisma.spaceIntegration.findFirst({
    where: {
      spaceId: ctx.spaceId,
      status: "ACTIVE" as unknown as IntegrationStatus,
      integration: { key: "api-serve-all" },
    },
  });

  if (publicAll) {
    const config = publicAll.config as Record<string, unknown>;
    if (config?.isPublic) return null;
  }

  await logApiCall(ctx.spaceId, null, ctx.ipAddress, ctx.userAgent, 401, Date.now() - ctx.startedAt);
  return NextResponse.json({ error: "Authentication required" }, { status: 401 });
}
