"use server";

import { NextRequest, NextResponse } from "next/server";
import { getLatestEntriesForSpace } from "@/lib/dal";
import {
  resolvePublicApiContext,
  recordUsageIfKeyed,
  logApiCall,
} from "@/lib/api/public-api-helpers";
import prisma from "@/lib/prisma";
import type { IntegrationStatus } from "@prisma/client";

/**
 * GET /api/v1/reserves/{apiIdentifier}/streams
 * List all active streams with their latest entries.
 * Requires an api-serve-all integration key, or a public api-serve-all integration.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ identifier: string }> }
) {
  const { identifier } = await params;

  const ctx = await resolvePublicApiContext(request, identifier);
  if (!ctx) {
    return NextResponse.json({ error: "Space not found" }, { status: 404 });
  }

  // Auth check: require api-serve-all integration key or public api-serve-all
  if (ctx.apiKeyId && ctx.spaceIntegration) {
    // Key provided — must be for api-serve-all
    if (ctx.spaceIntegration.integration.key !== "api-serve-all") {
      await logApiCall(ctx.spaceId, ctx.apiKeyId, ctx.ipAddress, ctx.userAgent, 401, Date.now() - ctx.startedAt);
      return NextResponse.json({ error: "API key not authorized for this endpoint" }, { status: 401 });
    }
  } else {
    // No valid key — check for public api-serve-all integration
    const publicAllStreams = await prisma.spaceIntegration.findFirst({
      where: {
        spaceId: ctx.spaceId,
        status: "ACTIVE" as unknown as IntegrationStatus,
        integration: { key: "api-serve-all" },
      },
    });

    if (!publicAllStreams) {
      await logApiCall(ctx.spaceId, null, ctx.ipAddress, ctx.userAgent, 404, Date.now() - ctx.startedAt);
      return NextResponse.json({ error: "All-streams endpoint not configured" }, { status: 404 });
    }

    const config = publicAllStreams.config as Record<string, unknown>;
    if (!config?.isPublic) {
      await logApiCall(ctx.spaceId, null, ctx.ipAddress, ctx.userAgent, 401, Date.now() - ctx.startedAt);
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
  }

  try {
    const streams = await getLatestEntriesForSpace(ctx.spaceId);

    await recordUsageIfKeyed(ctx.apiKeyId);
    await logApiCall(ctx.spaceId, ctx.apiKeyId, ctx.ipAddress, ctx.userAgent, 200, Date.now() - ctx.startedAt);

    return NextResponse.json({
      spaceName: ctx.spaceName,
      streams: streams.map((s) => ({
        slug: s.streamSlug,
        name: s.streamName,
        artifactType: s.artifactType,
        assetType: s.assetType,
        unit: s.unit,
        latestEntry: s.latestEntry
          ? {
              value: s.latestEntry.value,
              timestamp: s.latestEntry.timestamp,
              ripcord: s.latestEntry.ripcord,
              ripcordDetails: s.latestEntry.ripcordDetails,
              artifactData: s.latestEntry.artifactData,
            }
          : null,
      })),
    });
  } catch (error) {
    console.error("Error listing streams:", error);
    await logApiCall(ctx.spaceId, ctx.apiKeyId, ctx.ipAddress, ctx.userAgent, 500, Date.now() - ctx.startedAt);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
