import { getStore, createEntry, createEntryWithLeaves, getEntries, auditStoreEntryOperation } from "@/lib/dal";
import { validateEntryForArtifactType, validateMerkleLeafData } from "@/lib/dal/artifact-validation";
import { isMerkleArtifactType } from "@/lib/artifact-types";
import { getBuilder } from "@/lib/merkle";
import { spaceRoute, ApiError, ApiSuccess } from "@/lib/api";

// GET /api/spaces/[spaceId]/stores/[streamId]/entries — list entries (paginated)
export const GET = spaceRoute<{ streamId: string }>(
  { label: "list entries" },
  async ({ params, request }) => {
    const stream = await getStore(params.streamId);
    if (!stream || stream.spaceId !== params.spaceId) {
      return ApiError.notFound("Stream");
    }

    const url = new URL(request.url);
    const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "50", 10) || 50, 1), 200);
    const offset = Math.max(parseInt(url.searchParams.get("offset") || "0", 10) || 0, 0);
    const from = url.searchParams.get("from") ? new Date(url.searchParams.get("from")!) : undefined;
    const to = url.searchParams.get("to") ? new Date(url.searchParams.get("to")!) : undefined;

    const result = await getEntries(params.streamId, { limit, offset, from, to });
    return ApiSuccess.ok(result);
  }
);

// POST /api/spaces/[spaceId]/stores/[streamId]/entries — create entry (manual input)
export const POST = spaceRoute<{ streamId: string }>(
  { requiredAccess: "auditor", label: "create entry" },
  async ({ session, params, request }) => {
    const stream = await getStore(params.streamId);
    if (!stream || stream.spaceId !== params.spaceId) {
      return ApiError.notFound("Stream");
    }

    const body = await request.json();

    // Accept "data" as alias for "artifactData" (preferred in API)
    if (body.data !== undefined && body.artifactData === undefined) {
      body.artifactData = body.data;
    }

    // When artifactData is a leaf array for merkle types, build the tree server-side
    const isMerkle = isMerkleArtifactType(stream.artifactType);
    if (isMerkle && Array.isArray(body.artifactData)) {
      // Use stream's configured valueField, or accept override from request body
      const valueField = stream.valueField || body.valueField;
      if (!valueField || typeof valueField !== "string") {
        return ApiError.validationError([
          "No value field configured for this stream. Please provide a 'valueField' — the name of the numeric field inside each leaf's data object (e.g. \"balance\", \"weight_oz\", \"amount\").",
        ]);
      }

      const leafValidation = validateMerkleLeafData(body.artifactData, valueField);
      if (!leafValidation.valid) {
        return ApiError.validationError([leafValidation.error!]);
      }

      const builder = getBuilder(stream.artifactType);
      const tree = builder.build(body.artifactData, { valueField });

      const entryData = {
        artifactType: stream.artifactType,
        value: tree.totalBalance,
        artifactData: {
          merkleRoot: tree.merkleRoot,
          leafCount: tree.leafCount,
          totalBalance: tree.totalBalance,
          ...("treeData" in tree ? { treeData: tree.treeData } : {}),
          ...("treeDepth" in tree ? { treeDepth: tree.treeDepth, defaultLeaf: tree.defaultLeaf, nodeStore: tree.nodeStore } : {}),
        },
        submittedBy: session.user.id,
        isAutomated: false,
        timestamp: body.timestamp ? new Date(body.timestamp) : new Date(),
        ripcord: body.ripcord ?? false,
        ripcordDetails: body.ripcordDetails ?? [],
        notes: body.notes ?? "",
        supportingDocuments: body.supportingDocuments ?? [],
        metadata: body.metadata ?? {},
      };

      const leaves = tree.leaves.map((leaf, i) => ({
        leafId: leaf.id,
        leafHash: leaf.hash,
        value: leaf.value,
        leafData: leaf.data as unknown as import("@prisma/client").Prisma.InputJsonValue,
        leafIndex: i,
      }));

      const entry = await createEntryWithLeaves(params.streamId, entryData, leaves);

      await auditStoreEntryOperation("create", entry.id, params.spaceId, session.user.email, request, {
        newValues: {
          streamId: params.streamId,
          artifactType: stream.artifactType,
          value: tree.totalBalance,
          leafCount: tree.leafCount,
          merkleRoot: tree.merkleRoot,
          ripcord: entryData.ripcord,
        },
      });

      return ApiSuccess.created(entry);
    }

    // Standard path: pre-computed artifactData or VALUE type
    const entryData = {
      artifactType: stream.artifactType,
      value: body.value ?? null,
      artifactData: body.artifactData ?? null,
      submittedBy: session.user.id,
      isAutomated: false,
      timestamp: body.timestamp ? new Date(body.timestamp) : new Date(),
      ripcord: body.ripcord ?? false,
      ripcordDetails: body.ripcordDetails ?? [],
      notes: body.notes ?? "",
      supportingDocuments: body.supportingDocuments ?? [],
      metadata: body.metadata ?? {},
    };

    // Validate data shape for this artifact type
    const validation = validateEntryForArtifactType(stream.artifactType, entryData);
    if (!validation.valid) {
      return ApiError.validationError(validation.errors);
    }

    const entry = await createEntry(params.streamId, entryData);

    await auditStoreEntryOperation("create", entry.id, params.spaceId, session.user.email, request, {
      newValues: { streamId: params.streamId, artifactType: stream.artifactType, value: entryData.value, ripcord: entryData.ripcord },
    });

    return ApiSuccess.created(entry);
  }
);
