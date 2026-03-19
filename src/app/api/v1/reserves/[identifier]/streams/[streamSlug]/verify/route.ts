"use server";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStoreBySlug } from "@/lib/dal";
import { isMerkleArtifactType, artifactTypeToLower } from "@/lib/artifact-types";
import { getBuilder } from "@/lib/merkle";
import { hashLeaf } from "@/lib/merkle/hash";

/**
 * POST /api/v1/reserves/{identifier}/streams/{streamSlug}/verify
 * Public verification endpoint — cryptographically verifies leaf inclusion
 * in a merkle snapshot by hashing the provided data and checking the proof.
 *
 * Body: { data: Record<string, unknown>, rootHash?: string | null }
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
    if (!body || typeof body.data !== "object" || body.data === null || Array.isArray(body.data)) {
      return NextResponse.json(
        { error: '"data" is required and must be a JSON object' },
        { status: 400 },
      );
    }

    const { data, rootHash } = body as {
      data: Record<string, unknown>;
      rootHash?: string | null;
    };

    // Hash the user-provided data
    const computedLeafHash = hashLeaf(data);

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

    // Look up the leaf by its hash
    const leaf = await prisma.streamEntryLeaf.findFirst({
      where: { entryId: entry.id, leafHash: computedLeafHash },
    });

    if (!leaf) {
      return NextResponse.json({
        verified: false,
        snapshot: {
          rootHash: entryMerkleRoot,
          timestamp: entry.timestamp,
          leafCount: artifactData?.leafCount ?? null,
          totalBalance: artifactData?.totalBalance ?? null,
        },
        computedLeafHash,
        leaf: null,
        proof: null,
      });
    }

    // Generate and verify the Merkle proof
    let proof: { path: string[]; directions: ("left" | "right")[] } | null = null;
    let proofValid = false;

    if (artifactData && leaf.leafIndex !== null && entryMerkleRoot) {
      try {
        const builder = getBuilder(artifactTypeToLower(stream.artifactType));
        const leafIdentifier = artifactData.nodeStore ? leaf.leafId : leaf.leafIndex;
        const generated = builder.generateProof(artifactData as Record<string, unknown>, leafIdentifier);
        if (generated) {
          proof = generated;
          proofValid = builder.verifyProof(computedLeafHash, generated, entryMerkleRoot);
        }
      } catch {
        // Builder not found or proof generation failed
      }
    }

    return NextResponse.json({
      verified: proofValid,
      snapshot: {
        rootHash: entryMerkleRoot,
        timestamp: entry.timestamp,
        leafCount: artifactData?.leafCount ?? null,
        totalBalance: artifactData?.totalBalance ?? null,
      },
      computedLeafHash,
      leaf: {
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
