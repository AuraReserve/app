import { getSpaceStores, createStore, auditDataStoreOperation } from "@/lib/dal";
import { getArtifactTypeValues, normalizeArtifactType } from "@/lib/artifact-types";
import { spaceRoute, ApiError, ApiSuccess } from "@/lib/api";

// GET /api/spaces/[spaceId]/stores — list all stores for a space
export const GET = spaceRoute(
  { label: "list stores" },
  async ({ params }) => {
    const stores = await getSpaceStores(params.spaceId);
    return ApiSuccess.ok(stores);
  }
);

// POST /api/spaces/[spaceId]/stores — create a new store
export const POST = spaceRoute(
  { requiredAccess: "admin", label: "create store" },
  async ({ session, params, request }) => {
    const body = await request.json();
    const { name, slug, artifactType, assetType, unit, description } = body;

    if (!name || typeof name !== "string") {
      return ApiError.badRequest("name is required");
    }

    if (!slug || typeof slug !== "string") {
      return ApiError.badRequest("slug is required");
    }

    const normalizedArtifactType = normalizeArtifactType(artifactType);
    if (!normalizedArtifactType) {
      const valid = getArtifactTypeValues().join(", ");
      return ApiError.badRequest(`artifactType must be one of: ${valid}`);
    }

    try {
      const stream = await createStore(params.spaceId, {
        name: name.trim(),
        slug: slug.trim().toLowerCase(),
        artifactType: normalizedArtifactType,
        assetType: assetType || null,
        unit: unit || null,
        description: description || "",
        createdBy: session.user.id,
      });

      await auditDataStoreOperation("create", stream.id, params.spaceId, session.user.email, request, {
        newValues: { name: stream.name, slug: stream.slug, artifactType: stream.artifactType, assetType, unit },
      });

      return ApiSuccess.created(stream);
    } catch (error) {
      if (error instanceof Error && error.message.includes("Unique constraint")) {
        return ApiError.conflict("A stream with this slug already exists in this space");
      }
      throw error;
    }
  }
);
