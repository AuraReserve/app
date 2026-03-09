"use server";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStoreBySlug } from "@/lib/dal";
import {
  resolvePublicApiContext,
  checkStreamAuth,
  recordUsageIfKeyed,
  logApiCall,
} from "@/lib/api/public-api-helpers";
import { isMerkleArtifactType } from "@/lib/artifact-types";

/**
 * GET /api/v1/reserves/{apiIdentifier}/streams/{streamSlug}/merkle
 * Merkle proof endpoints for merkle-type streams.
 * Returns latest merkle snapshot info: root hash, leaf count, total balance.
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

    // Auth check — same as stream detail and history endpoints
    const authError = await checkStreamAuth(ctx, stream.id);
    if (authError) return authError;

    if (!isMerkleArtifactType(stream.artifactType)) {
      await logApiCall(ctx.spaceId, ctx.apiKeyId, ctx.ipAddress, ctx.userAgent, 400, Date.now() - ctx.startedAt);
      return NextResponse.json(
        { error: "This stream does not use a merkle artifact type" },
        { status: 400 }
      );
    }

    // Get latest entry with leaf count
    const latestEntry = await prisma.streamEntry.findFirst({
      where: { streamId: stream.id },
      orderBy: { timestamp: "desc" },
      include: {
        _count: { select: { leaves: true } },
      },
    });

    if (!latestEntry) {
      await logApiCall(ctx.spaceId, ctx.apiKeyId, ctx.ipAddress, ctx.userAgent, 404, Date.now() - ctx.startedAt);
      return NextResponse.json({ error: "No entries available" }, { status: 404 });
    }

    await recordUsageIfKeyed(ctx.apiKeyId);
    await logApiCall(ctx.spaceId, ctx.apiKeyId, ctx.ipAddress, ctx.userAgent, 200, Date.now() - ctx.startedAt);

    const artifactData = latestEntry.artifactData as Record<string, unknown> | null;

    return NextResponse.json({
      spaceName: ctx.spaceName,
      stream: {
        slug: stream.slug,
        name: stream.name,
        artifactType: stream.artifactType,
      },
      merkle: {
        entryId: latestEntry.id,
        merkleRoot: artifactData?.merkleRoot ?? null,
        leafCount: latestEntry._count.leaves,
        totalBalance: artifactData?.totalBalance ?? latestEntry.value,
        timestamp: latestEntry.timestamp,
        verifyEndpoint: `/api/v1/reserves/${identifier}/streams/${streamSlug}/merkle/verify/{accountId}`,
      },
    });
  } catch (error) {
    console.error("Error getting merkle info:", error);
    await logApiCall(ctx.spaceId, ctx.apiKeyId, ctx.ipAddress, ctx.userAgent, 500, Date.now() - ctx.startedAt);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
