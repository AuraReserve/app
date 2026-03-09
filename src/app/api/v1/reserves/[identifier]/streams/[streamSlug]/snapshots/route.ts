"use server";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStoreBySlug } from "@/lib/dal";
import { isMerkleArtifactType } from "@/lib/artifact-types";
import { getSnapshots } from "@/lib/dal/stream-entries";

/**
 * GET /api/v1/reserves/{identifier}/streams/{streamSlug}/snapshots
 * List available merkle snapshots for the verification page dropdown.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ identifier: string; streamSlug: string }> }
) {
  const { identifier, streamSlug } = await params;

  try {
    const space = await prisma.space.findFirst({
      where: { apiIdentifier: identifier, isActive: true },
      select: { id: true, verificationPublic: true },
    });

    if (!space) {
      return NextResponse.json({ error: "Space not found" }, { status: 404 });
    }

    if (!space.verificationPublic) {
      return NextResponse.json(
        { error: "Verification is not available for this reserve" },
        { status: 403 },
      );
    }

    const stream = await getStoreBySlug(space.id, streamSlug);
    if (!stream) {
      return NextResponse.json({ error: "Stream not found" }, { status: 404 });
    }

    if (!isMerkleArtifactType(stream.artifactType)) {
      return NextResponse.json(
        { error: "This stream does not use a merkle artifact type" },
        { status: 400 },
      );
    }

    const snapshots = await getSnapshots(stream.id);

    return NextResponse.json({
      spaceName: space.id,
      streamSlug,
      snapshots: snapshots.map((s) => ({
        id: s.id,
        timestamp: s.timestamp,
        merkleRoot: s.merkleRoot,
        leafCount: s.leafCount,
      })),
    });
  } catch (error) {
    console.error("Error listing snapshots:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
