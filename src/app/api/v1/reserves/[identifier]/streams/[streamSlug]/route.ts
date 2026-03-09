"use server";

import { NextRequest, NextResponse } from "next/server";
import { getStoreBySlug } from "@/lib/dal";
import {
  resolvePublicApiContext,
  checkStreamAuth,
  recordUsageIfKeyed,
  logApiCall,
} from "@/lib/api/public-api-helpers";

/**
 * GET /api/v1/reserves/{apiIdentifier}/streams/{streamSlug}
 * Stream detail with latest entry.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ identifier: string; streamSlug: string }> }
) {
  const { identifier, streamSlug } = await params;

  const ctx = await resolvePublicApiContext(request, identifier);
  if (!ctx) {
    return NextResponse.json({ error: "Space not found" }, { status: 404 });
  }

  try {
    const stream = await getStoreBySlug(ctx.spaceId, streamSlug);
    if (!stream) {
      await logApiCall(ctx.spaceId, ctx.apiKeyId, ctx.ipAddress, ctx.userAgent, 404, Date.now() - ctx.startedAt);
      return NextResponse.json({ error: "Stream not found" }, { status: 404 });
    }

    // Auth check
    const authError = await checkStreamAuth(ctx, stream.id);
    if (authError) return authError;

    await recordUsageIfKeyed(ctx.apiKeyId);
    await logApiCall(ctx.spaceId, ctx.apiKeyId, ctx.ipAddress, ctx.userAgent, 200, Date.now() - ctx.startedAt);

    const latestEntry = stream.entries[0] ?? null;

    return NextResponse.json({
      spaceName: ctx.spaceName,
      stream: {
        slug: stream.slug,
        name: stream.name,
        artifactType: stream.artifactType,
        assetType: stream.assetType,
        unit: stream.unit,
        description: stream.description,
        isActive: stream.isActive,
        latestEntry: latestEntry
          ? {
              id: latestEntry.id,
              value: latestEntry.value,
              timestamp: latestEntry.timestamp,
              ripcord: latestEntry.ripcord,
              ripcordDetails: latestEntry.ripcordDetails,
              artifactData: latestEntry.artifactData,
              notes: latestEntry.notes,
              supportingDocuments: latestEntry.supportingDocuments,
            }
          : null,
      },
    });
  } catch (error) {
    console.error("Error getting stream:", error);
    await logApiCall(ctx.spaceId, ctx.apiKeyId, ctx.ipAddress, ctx.userAgent, 500, Date.now() - ctx.startedAt);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
