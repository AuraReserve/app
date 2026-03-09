import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { requireSpaceAdmin } from "@/lib/auth-utils";
import {
  getIntegrationApiKeys,
  createIntegrationApiKey,
  deleteIntegrationApiKey,
} from "@/lib/dal";
import { auditApiKeyOperation } from "@/lib/dal/audit";

type RouteContext = {
  params: Promise<{ spaceId: string; integrationId: string }>;
};

/**
 * GET - List all API keys for a SpaceIntegration
 */
export async function GET(_request: NextRequest, { params }: RouteContext) {
  const { spaceId, integrationId } = await params;
  await requireSpaceAdmin(spaceId);

  const keys = await getIntegrationApiKeys(integrationId);
  return NextResponse.json(keys);
}

/**
 * POST - Create a new API key for a SpaceIntegration
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const { spaceId, integrationId } = await params;
  const user = await requireSpaceAdmin(spaceId);
  const body = await request.json();

  const key = await createIntegrationApiKey({
    spaceIntegrationId: integrationId,
    name: body.name,
    createdBy: user.id,
    allowedOrigins: body.allowedOrigins,
  });

  after(async () => {
    await auditApiKeyOperation("create", key.id, spaceId, user.email, request, {
      newValues: {
        name: key.name,
        keyPrefix: key.keyPrefix,
        spaceIntegrationId: integrationId,
        allowedOrigins: body.allowedOrigins,
      },
    });
  });

  // Return plaintext key in response (one-time only)
  return NextResponse.json(
    {
      id: key.id,
      name: key.name,
      keyPrefix: key.keyPrefix,
      isActive: key.isActive,
      usageCount: key.usageCount,
      createdDate: key.createdDate,
      plaintextKey: key.plaintextKey,
    },
    { status: 201 }
  );
}

/**
 * DELETE - Revoke an API key
 */
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const { spaceId } = await params;
  const user = await requireSpaceAdmin(spaceId);
  const body = await request.json();

  const deleted = await deleteIntegrationApiKey(body.id);
  if (!deleted) {
    return NextResponse.json({ error: "Key not found" }, { status: 404 });
  }

  after(async () => {
    await auditApiKeyOperation("delete", body.id, spaceId, user.email, request, {
      oldValues: { id: body.id },
    });
  });

  return NextResponse.json({ success: true });
}
