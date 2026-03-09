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
 * GET /api/v1/reserves/{apiIdentifier}/streams/{streamSlug}/merkle/verify/{accountId}
 * Verify inclusion of an account in the latest merkle snapshot.
 * Returns the leaf data and proof information if the account is found.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ identifier: string; streamSlug: string; accountId: string }> }
) {
  const { identifier, streamSlug, accountId } = await params;

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

    // Get latest entry
    const latestEntry = await prisma.streamEntry.findFirst({
      where: { streamId: stream.id },
      orderBy: { timestamp: "desc" },
      select: { id: true, timestamp: true, artifactData: true },
    });

    if (!latestEntry) {
      await logApiCall(ctx.spaceId, ctx.apiKeyId, ctx.ipAddress, ctx.userAgent, 404, Date.now() - ctx.startedAt);
      return NextResponse.json({ error: "No entries available" }, { status: 404 });
    }

    // Find the leaf for this account
    const leaf = await prisma.streamEntryLeaf.findFirst({
      where: {
        entryId: latestEntry.id,
        leafId: accountId,
      },
    });

    await recordUsageIfKeyed(ctx.apiKeyId);

    if (!leaf) {
      await logApiCall(ctx.spaceId, ctx.apiKeyId, ctx.ipAddress, ctx.userAgent, 404, Date.now() - ctx.startedAt);
      return NextResponse.json({
        verified: false,
        accountId,
        message: "Account not found in latest merkle snapshot",
        entryId: latestEntry.id,
        timestamp: latestEntry.timestamp,
      });
    }

    await logApiCall(ctx.spaceId, ctx.apiKeyId, ctx.ipAddress, ctx.userAgent, 200, Date.now() - ctx.startedAt);

    const artifactData = latestEntry.artifactData as Record<string, unknown> | null;

    return NextResponse.json({
      verified: true,
      leafId: leaf.leafId,
      leafHash: leaf.leafHash,
      value: leaf.value,
      leafIndex: leaf.leafIndex,
      leafData: leaf.leafData,
      merkleRoot: artifactData?.merkleRoot ?? null,
      entryId: latestEntry.id,
      timestamp: latestEntry.timestamp,
    });
  } catch (error) {
    console.error("Error verifying merkle proof:", error);
    await logApiCall(ctx.spaceId, ctx.apiKeyId, ctx.ipAddress, ctx.userAgent, 500, Date.now() - ctx.startedAt);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
