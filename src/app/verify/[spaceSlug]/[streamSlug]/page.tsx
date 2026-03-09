import { prisma } from "@/lib/prisma";
import { getStoreBySlug } from "@/lib/dal";
import { isMerkleArtifactType } from "@/lib/artifact-types";
import { getSnapshots } from "@/lib/dal/stream-entries";
import { VerificationPageClient } from "@/components/verification/verification-page-client";

interface VerifyPageProps {
  params: Promise<{ spaceSlug: string; streamSlug: string }>;
}

export default async function VerifyPage({ params }: VerifyPageProps) {
  const { spaceSlug, streamSlug } = await params;

  // Resolve space by slug (not apiIdentifier — this is a user-facing URL)
  const space = await prisma.space.findUnique({
    where: { slug: spaceSlug },
    select: {
      id: true,
      name: true,
      slug: true,
      apiIdentifier: true,
      isActive: true,
      verificationPublic: true,
    },
  });

  if (!space || !space.isActive) {
    return (
      <div className="text-center py-16">
        <h1 className="text-2xl font-semibold text-slate-900 mb-2">Reserve Not Found</h1>
        <p className="text-slate-500">The reserve you are looking for does not exist or has been deactivated.</p>
      </div>
    );
  }

  if (!space.verificationPublic) {
    return (
      <div className="text-center py-16">
        <h1 className="text-2xl font-semibold text-slate-900 mb-2">Verification Unavailable</h1>
        <p className="text-slate-500">Verification is not available for this reserve.</p>
      </div>
    );
  }

  // Resolve stream
  const stream = await getStoreBySlug(space.id, streamSlug);

  if (!stream) {
    return (
      <div className="text-center py-16">
        <h1 className="text-2xl font-semibold text-slate-900 mb-2">Stream Not Found</h1>
        <p className="text-slate-500">The data stream &quot;{streamSlug}&quot; was not found in this reserve.</p>
      </div>
    );
  }

  if (!isMerkleArtifactType(stream.artifactType)) {
    return (
      <div className="text-center py-16">
        <h1 className="text-2xl font-semibold text-slate-900 mb-2">Not a Merkle Stream</h1>
        <p className="text-slate-500">This data stream does not use a Merkle tree artifact type.</p>
      </div>
    );
  }

  // Fetch available snapshots
  const snapshots = await getSnapshots(stream.id);

  return (
    <VerificationPageClient
      spaceName={space.name}
      spaceApiIdentifier={space.apiIdentifier}
      streamName={stream.name}
      streamSlug={stream.slug}
      artifactType={stream.artifactType}
      snapshots={snapshots.map((s) => ({
        id: s.id,
        timestamp: s.timestamp.toISOString(),
        merkleRoot: s.merkleRoot,
        leafCount: s.leafCount,
      }))}
    />
  );
}
