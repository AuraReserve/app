"use server";

import { NextRequest, NextResponse } from "next/server";
import { getStoreBySlug, getEntries } from "@/lib/dal";
import {
  resolvePublicApiContext,
  checkStreamAuth,
  recordUsageIfKeyed,
  logApiCall,
} from "@/lib/api/public-api-helpers";

/**
 * GET /api/v1/reserves/{apiIdentifier}/streams/{streamSlug}/history
 * Paginated entry history for a stream.
 * Query params: limit (default 50, max 100), offset (default 0), from, to (ISO dates).
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

    const url = request.nextUrl;
    const limit = Math.min(Number(url.searchParams.get("limit")) || 50, 100);
    const offset = Math.max(Number(url.searchParams.get("offset")) || 0, 0);
    const fromParam = url.searchParams.get("from");
    const toParam = url.searchParams.get("to");

    const result = await getEntries(stream.id, {
      limit,
      offset,
      from: fromParam ? new Date(fromParam) : undefined,
      to: toParam ? new Date(toParam) : undefined,
    });

    await recordUsageIfKeyed(ctx.apiKeyId);
    await logApiCall(ctx.spaceId, ctx.apiKeyId, ctx.ipAddress, ctx.userAgent, 200, Date.now() - ctx.startedAt);

    return NextResponse.json({
      spaceName: ctx.spaceName,
      stream: {
        slug: stream.slug,
        name: stream.name,
        artifactType: stream.artifactType,
      },
      entries: result.entries.map((e) => ({
        id: e.id,
        value: e.value,
        timestamp: e.timestamp,
        ripcord: e.ripcord,
        ripcordDetails: e.ripcordDetails,
        artifactData: e.artifactData,
        notes: e.notes,
        supportingDocuments: e.supportingDocuments,
      })),
      pagination: {
        total: result.total,
        limit: result.limit,
        offset: result.offset,
        hasMore: result.offset + result.limit < result.total,
      },
    });
  } catch (error) {
    console.error("Error getting stream history:", error);
    await logApiCall(ctx.spaceId, ctx.apiKeyId, ctx.ipAddress, ctx.userAgent, 500, Date.now() - ctx.startedAt);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
