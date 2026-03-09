/**
 * Integration API Keys Data Access Layer
 *
 * All integration API key related database operations.
 * Keys are stored as SHA-256 hashes; plaintext is only returned at creation.
 */

import { prisma } from "@/lib/prisma";
import { generateApiKey, hashApiKey, getKeyPrefix } from "@/lib/api-key-utils";

/**
 * Validate an integration API key and return associated space integration info.
 * Hashes the plaintext key before DB lookup.
 * Includes spaceIntegration with integration and stream relations for auth resolution.
 */
export async function validateIntegrationApiKey(apiKey: string) {
  const keyHash = hashApiKey(apiKey);
  const key = await prisma.integrationApiKey.findFirst({
    where: {
      apiKey: keyHash,
      isActive: true,
    },
    select: {
      id: true,
      allowedOrigins: true,
      spaceIntegration: {
        include: {
          integration: true,
          stream: true,
        },
      },
    },
  });

  if (!key) {
    return {
      valid: false as const,
      keyId: null,
      spaceIntegration: null,
      allowedOrigins: [] as string[],
    };
  }

  return {
    valid: true as const,
    keyId: key.id,
    spaceIntegration: key.spaceIntegration,
    allowedOrigins: key.allowedOrigins,
  };
}

/**
 * Record integration API key usage (increment counter and update last used)
 */
export async function recordIntegrationApiKeyUsage(
  keyId: string
): Promise<void> {
  await prisma.integrationApiKey.update({
    where: { id: keyId },
    data: {
      usageCount: { increment: 1 },
      lastUsed: new Date(),
    },
  });
}

/**
 * Get all integration API keys for a SpaceIntegration
 */
export async function getIntegrationApiKeys(spaceIntegrationId: string) {
  return prisma.integrationApiKey.findMany({
    where: { spaceIntegrationId },
    orderBy: { createdDate: "desc" },
  });
}

/**
 * Create an integration API key.
 * Generates a crypto-secure key server-side, stores its SHA-256 hash,
 * and returns the record with `plaintextKey` (shown to user exactly once).
 */
export async function createIntegrationApiKey(input: {
  spaceIntegrationId: string;
  name: string;
  createdBy: string;
  allowedOrigins?: string[];
}) {
  const plaintext = generateApiKey();
  const keyHash = hashApiKey(plaintext);
  const prefix = getKeyPrefix(plaintext);

  const key = await prisma.integrationApiKey.create({
    data: {
      spaceIntegrationId: input.spaceIntegrationId,
      name: input.name,
      apiKey: keyHash,
      keyPrefix: prefix,
      createdBy: input.createdBy,
      allowedOrigins: input.allowedOrigins ?? [],
    },
  });

  return { ...key, plaintextKey: plaintext };
}

/**
 * Delete an integration API key
 */
export async function deleteIntegrationApiKey(id: string): Promise<boolean> {
  try {
    await prisma.integrationApiKey.delete({
      where: { id },
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Update an integration API key
 */
export async function updateIntegrationApiKey(
  id: string,
  input: {
    name?: string;
    isActive?: boolean;
    allowedOrigins?: string[];
  }
) {
  try {
    return await prisma.integrationApiKey.update({
      where: { id },
      data: input,
    });
  } catch {
    return null;
  }
}

/**
 * Record an API call
 */
export async function recordApiCall(input: {
  spaceId: string;
  apiKeyId: string | null;
  ipAddress: string;
  userAgent: string;
  statusCode: number;
  responseTimeMs?: number | null;
}): Promise<string> {
  const call = await prisma.apiCall.create({
    data: {
      spaceId: input.spaceId,
      apiKeyId: input.apiKeyId,
      ipAddress: input.ipAddress.slice(0, 255),
      userAgent: input.userAgent.slice(0, 500),
      statusCode: input.statusCode,
      responseTimeMs: input.responseTimeMs ?? null,
    },
  });

  return call.id;
}
