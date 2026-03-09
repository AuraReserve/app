"use server";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStoreBySlug } from "@/lib/dal";
import { isMerkleArtifactType, artifactTypeToLower } from "@/lib/artifact-types";
import { getBuilder } from "@/lib/merkle";

/**
 * POST /api/v1/reserves/{identifier}/streams/{streamSlug}/verify
 * Public verification endpoint — verifies leaf inclusion in a merkle snapshot.
 *
 * Body: { leafId: string, rootHash?: string | null, expectedData?: Record<string, unknown> }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ identifier: string; streamSlug: string }> }
) {
  const { identifier, streamSlug } = await params;

  try {
    // Resolve space by API identifier
    const space = await prisma.space.findFirst({
      where: { apiIdentifier: identifier, isActive: true },
      select: { id: true, name: true, verificationPublic: true },
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

    // Resolve stream
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

    // Parse body
    const body = await request.json().catch(() => null);
    if (!body || typeof body.leafId !== "string" || !body.leafId.trim()) {
      return NextResponse.json(
        { error: "leafId is required" },
        { status: 400 },
      );
    }

    const { leafId, rootHash, expectedData } = body as {
      leafId: string;
      rootHash?: string | null;
      expectedData?: Record<string, unknown> | null;
    };

    // Find the target entry (by root hash or latest)
    let entry: { id: string; timestamp: Date; artifactData: unknown } | null = null;

    if (rootHash && typeof rootHash === "string") {
      entry = await prisma.streamEntry.findFirst({
        where: {
          streamId: stream.id,
          artifactData: { path: ["merkleRoot"], equals: rootHash },
        },
        orderBy: { timestamp: "desc" },
        select: { id: true, timestamp: true, artifactData: true },
      });
    } else {
      entry = await prisma.streamEntry.findFirst({
        where: { streamId: stream.id },
        orderBy: { timestamp: "desc" },
        select: { id: true, timestamp: true, artifactData: true },
      });
    }

    if (!entry) {
      return NextResponse.json(
        { error: rootHash ? "No snapshot found with that root hash" : "No entries available" },
        { status: 404 },
      );
    }

    const artifactData = entry.artifactData as Record<string, unknown> | null;
    const entryMerkleRoot = (artifactData?.merkleRoot as string) ?? null;

    // Find the leaf
    const leaf = await prisma.streamEntryLeaf.findFirst({
      where: { entryId: entry.id, leafId },
    });

    if (!leaf) {
      return NextResponse.json({
        verified: false,
        dataMatch: null,
        snapshot: {
          rootHash: entryMerkleRoot,
          timestamp: entry.timestamp,
          leafCount: artifactData?.leafCount ?? null,
          totalBalance: artifactData?.totalBalance ?? null,
        },
        leaf: null,
        proof: null,
      });
    }

    // Check data match if expectedData provided
    let dataMatch: boolean | null = null;
    if (expectedData && typeof expectedData === "object") {
      const leafData = leaf.leafData as Record<string, unknown> | null;
      if (leafData) {
        dataMatch = Object.entries(expectedData).every(
          ([key, value]) => {
            const leafValue = leafData[key];
            if (typeof value === "number" && typeof leafValue === "number") {
              return Math.abs(value - leafValue) < 1e-10;
            }
            return leafValue === value;
          }
        );
      } else {
        dataMatch = false;
      }
    }

    // Generate proof if tree data available
    let proof: { path: string[]; directions: ("left" | "right")[] } | null = null;
    if (artifactData && leaf.leafIndex !== null) {
      try {
        const builder = getBuilder(artifactTypeToLower(stream.artifactType));
        const leafIdentifier = artifactData.nodeStore ? leaf.leafId : leaf.leafIndex;
        const generated = builder.generateProof(artifactData as Record<string, unknown>, leafIdentifier);
        if (generated) {
          proof = generated;
        }
      } catch {
        // Builder not found or proof generation failed
      }
    }

    return NextResponse.json({
      verified: true,
      dataMatch,
      snapshot: {
        rootHash: entryMerkleRoot,
        timestamp: entry.timestamp,
        leafCount: artifactData?.leafCount ?? null,
        totalBalance: artifactData?.totalBalance ?? null,
      },
      leaf: {
        leafId: leaf.leafId,
        leafHash: leaf.leafHash,
        leafIndex: leaf.leafIndex,
        leafData: leaf.leafData,
        value: leaf.value,
      },
      proof,
    });
  } catch (error) {
    console.error("Error in verification:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
