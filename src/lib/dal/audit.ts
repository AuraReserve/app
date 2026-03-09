/**
 * Audit Log Data Access Layer
 *
 * Centralized audit logging for all operations.
 */

import { prisma } from "@/lib/prisma";
import { AuditAction, ResourceType } from "@prisma/client";

export type AuditActionType = "create" | "update" | "delete" | "api_access" | "login" | "logout" | "archive" | "restore";
export type AuditResourceType =
  | "space"
  | "proof_of_reserve"
  | "api_key"
  | "user"
  | "space_member"
  | "merkle_tree"
  | "settings"
  | "data_stream"
  | "stream_entry"
  | "integration"
  | "group";

export interface CreateAuditLogInput {
  action: AuditActionType;
  resourceType: AuditResourceType;
  resourceId: string;
  userEmail: string;
  spaceId?: string | null;
  ipAddress: string;
  userAgent: string;
  details?: Record<string, unknown>;
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
}

export interface AuditLogRecord {
  id: string;
  action: AuditActionType;
  resourceType: AuditResourceType;
  resourceId: string;
  userEmail: string;
  spaceId: string | null;
  ipAddress: string;
  userAgent: string;
  details: Record<string, unknown>;
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  createdDate: Date;
}

function mapAuditLog(log: Awaited<ReturnType<typeof prisma.auditLog.findFirst>>): AuditLogRecord | null {
  if (!log) return null;

  return {
    id: log.id,
    action: log.action.toLowerCase() as AuditActionType,
    resourceType: log.resourceType.toLowerCase() as AuditResourceType,
    resourceId: log.resourceId,
    userEmail: log.userEmail,
    spaceId: log.spaceId,
    ipAddress: log.ipAddress,
    userAgent: log.userAgent,
    details: log.details as Record<string, unknown>,
    oldValues: log.oldValues as Record<string, unknown> | null,
    newValues: log.newValues as Record<string, unknown> | null,
    createdDate: log.createdDate,
  };
}

/**
 * Create an audit log entry
 */
export async function createAuditLog(input: CreateAuditLogInput): Promise<AuditLogRecord> {
  const actionEnum = input.action.toUpperCase() as keyof typeof AuditAction;
  const resourceTypeEnum = input.resourceType.toUpperCase() as keyof typeof ResourceType;

  const log = await prisma.auditLog.create({
    data: {
      action: actionEnum as AuditAction,
      resourceType: resourceTypeEnum as ResourceType,
      resourceId: input.resourceId,
      userEmail: input.userEmail,
      spaceId: input.spaceId ?? null,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      details: input.details ?? {},
      oldValues: input.oldValues ?? undefined,
      newValues: input.newValues ?? undefined,
    },
  });

  return mapAuditLog(log)!;
}

/**
 * Get audit logs with filtering
 */
export async function getAuditLogs(options: {
  spaceIds?: string[];
  resourceType?: AuditResourceType;
  action?: AuditActionType;
  userEmail?: string;
  limit?: number;
  offset?: number;
}): Promise<AuditLogRecord[]> {
  const where: Record<string, unknown> = {};

  if (options.spaceIds && options.spaceIds.length > 0) {
    where.spaceId = { in: options.spaceIds };
  }

  if (options.resourceType) {
    const resourceTypeEnum = options.resourceType.toUpperCase() as keyof typeof ResourceType;
    where.resourceType = ResourceType[resourceTypeEnum];
  }

  if (options.action) {
    const actionEnum = options.action.toUpperCase() as keyof typeof AuditAction;
    where.action = AuditAction[actionEnum];
  }

  if (options.userEmail) {
    where.userEmail = options.userEmail;
  }

  const logs = await prisma.auditLog.findMany({
    where,
    orderBy: { createdDate: "desc" },
    take: options.limit ?? 100,
    skip: options.offset ?? 0,
  });

  return logs.map((log) => mapAuditLog(log)!);
}

/**
 * Get audit logs for a specific space
 */
export async function getSpaceAuditLogs(
  spaceId: string,
  limit: number = 50
): Promise<AuditLogRecord[]> {
  return getAuditLogs({ spaceIds: [spaceId], limit });
}

/**
 * Get audit logs for a specific resource
 */
export async function getResourceAuditLogs(
  resourceType: AuditResourceType,
  resourceId: string,
  limit: number = 50
): Promise<AuditLogRecord[]> {
  const resourceTypeEnum = resourceType.toUpperCase() as keyof typeof ResourceType;

  const logs = await prisma.auditLog.findMany({
    where: {
      resourceType: ResourceType[resourceTypeEnum],
      resourceId,
    },
    orderBy: { createdDate: "desc" },
    take: limit,
  });

  return logs.map((log) => mapAuditLog(log)!);
}

/**
 * Helper to extract request info for audit logging
 */
export function extractRequestInfo(request: Request): {
  ipAddress: string;
  userAgent: string;
} {
  const ipHeader = request.headers.get("x-forwarded-for");
  const userAgent = request.headers.get("user-agent") || "unknown";

  // Get the first IP if there are multiple (proxy chain)
  let ipAddress = "unknown";
  if (ipHeader) {
    const ips = ipHeader.split(",").map((ip) => ip.trim());
    ipAddress = ips[0] || "unknown";
  }

  // Sanitize: limit length to prevent database issues
  return {
    ipAddress: ipAddress.slice(0, 255),
    userAgent: userAgent.slice(0, 500),
  };
}

/**
 * Helper to create audit log for space operations
 */
export async function auditSpaceOperation(
  action: AuditActionType,
  spaceId: string,
  userEmail: string,
  request: Request,
  options?: {
    oldValues?: Record<string, unknown> | null;
    newValues?: Record<string, unknown> | null;
    details?: Record<string, unknown>;
  }
): Promise<void> {
  const { ipAddress, userAgent } = extractRequestInfo(request);

  await createAuditLog({
    action,
    resourceType: "space",
    resourceId: spaceId,
    userEmail,
    spaceId,
    ipAddress,
    userAgent,
    oldValues: options?.oldValues,
    newValues: options?.newValues,
    details: options?.details ?? {},
  });
}

/**
 * Helper to create audit log for space member operations
 */
export async function auditSpaceMemberOperation(
  action: AuditActionType,
  memberId: string,
  spaceId: string,
  userEmail: string,
  request: Request,
  options?: {
    oldValues?: Record<string, unknown> | null;
    newValues?: Record<string, unknown> | null;
    details?: Record<string, unknown>;
  }
): Promise<void> {
  const { ipAddress, userAgent } = extractRequestInfo(request);

  await createAuditLog({
    action,
    resourceType: "space_member",
    resourceId: memberId,
    userEmail,
    spaceId,
    ipAddress,
    userAgent,
    oldValues: options?.oldValues,
    newValues: options?.newValues,
    details: options?.details ?? {},
  });
}

/**
 * Helper to create audit log for user operations
 */
export async function auditUserOperation(
  action: AuditActionType,
  userId: string,
  userEmail: string,
  request: Request,
  options?: {
    oldValues?: Record<string, unknown> | null;
    newValues?: Record<string, unknown> | null;
    details?: Record<string, unknown>;
  }
): Promise<void> {
  const { ipAddress, userAgent } = extractRequestInfo(request);

  await createAuditLog({
    action,
    resourceType: "user",
    resourceId: userId,
    userEmail,
    spaceId: null, // User operations are platform-level
    ipAddress,
    userAgent,
    oldValues: options?.oldValues,
    newValues: options?.newValues,
    details: options?.details ?? {},
  });
}

/**
 * Helper to create audit log for merkle tree operations
 */
export async function auditMerkleTreeOperation(
  action: AuditActionType,
  treeId: string,
  spaceId: string,
  userEmail: string,
  request: Request,
  options?: {
    oldValues?: Record<string, unknown> | null;
    newValues?: Record<string, unknown> | null;
    details?: Record<string, unknown>;
  }
): Promise<void> {
  const { ipAddress, userAgent } = extractRequestInfo(request);

  await createAuditLog({
    action,
    resourceType: "merkle_tree",
    resourceId: treeId,
    userEmail,
    spaceId,
    ipAddress,
    userAgent,
    oldValues: options?.oldValues,
    newValues: options?.newValues,
    details: options?.details ?? {},
  });
}

/**
 * Helper to create audit log for settings operations
 */
export async function auditSettingsOperation(
  action: AuditActionType,
  settingKey: string,
  userEmail: string,
  request: Request,
  options?: {
    oldValues?: Record<string, unknown> | null;
    newValues?: Record<string, unknown> | null;
    details?: Record<string, unknown>;
  }
): Promise<void> {
  const { ipAddress, userAgent } = extractRequestInfo(request);

  await createAuditLog({
    action,
    resourceType: "settings",
    resourceId: settingKey,
    userEmail,
    spaceId: null, // Settings are platform-level
    ipAddress,
    userAgent,
    oldValues: options?.oldValues,
    newValues: options?.newValues,
    details: options?.details ?? {},
  });
}

/**
 * Helper to create audit log for proof of reserve operations
 */
export async function auditProofOfReserveOperation(
  action: AuditActionType,
  reserveId: string,
  spaceId: string,
  userEmail: string,
  request: Request,
  options?: {
    oldValues?: Record<string, unknown> | null;
    newValues?: Record<string, unknown> | null;
    details?: Record<string, unknown>;
  }
): Promise<void> {
  const { ipAddress, userAgent } = extractRequestInfo(request);

  await createAuditLog({
    action,
    resourceType: "proof_of_reserve",
    resourceId: reserveId,
    userEmail,
    spaceId,
    ipAddress,
    userAgent,
    oldValues: options?.oldValues,
    newValues: options?.newValues,
    details: options?.details ?? {},
  });
}

/**
 * Helper to create audit log for API key operations
 */
export async function auditApiKeyOperation(
  action: AuditActionType,
  apiKeyId: string,
  spaceId: string,
  userEmail: string,
  request: Request,
  options?: {
    oldValues?: Record<string, unknown> | null;
    newValues?: Record<string, unknown> | null;
    details?: Record<string, unknown>;
  }
): Promise<void> {
  const { ipAddress, userAgent } = extractRequestInfo(request);

  await createAuditLog({
    action,
    resourceType: "api_key",
    resourceId: apiKeyId,
    userEmail,
    spaceId,
    ipAddress,
    userAgent,
    oldValues: options?.oldValues,
    newValues: options?.newValues,
    details: options?.details ?? {},
  });
}

/**
 * Helper to create audit log for data store operations
 */
export async function auditDataStoreOperation(
  action: AuditActionType,
  streamId: string,
  spaceId: string,
  userEmail: string,
  request: Request,
  options?: {
    oldValues?: Record<string, unknown> | null;
    newValues?: Record<string, unknown> | null;
    details?: Record<string, unknown>;
  }
): Promise<void> {
  const { ipAddress, userAgent } = extractRequestInfo(request);

  await createAuditLog({
    action,
    resourceType: "data_stream",
    resourceId: streamId,
    userEmail,
    spaceId,
    ipAddress,
    userAgent,
    oldValues: options?.oldValues,
    newValues: options?.newValues,
    details: options?.details ?? {},
  });
}

/**
 * Helper to create audit log for store entry operations
 */
export async function auditStoreEntryOperation(
  action: AuditActionType,
  entryId: string,
  spaceId: string,
  userEmail: string,
  request: Request,
  options?: {
    oldValues?: Record<string, unknown> | null;
    newValues?: Record<string, unknown> | null;
    details?: Record<string, unknown>;
  }
): Promise<void> {
  const { ipAddress, userAgent } = extractRequestInfo(request);

  await createAuditLog({
    action,
    resourceType: "stream_entry",
    resourceId: entryId,
    userEmail,
    spaceId,
    ipAddress,
    userAgent,
    oldValues: options?.oldValues,
    newValues: options?.newValues,
    details: options?.details ?? {},
  });
}

/**
 * Helper to create audit log for integration operations
 * (activation, source/destination configuration)
 */
export async function auditIntegrationOperation(
  action: AuditActionType,
  integrationId: string,
  spaceId: string,
  userEmail: string,
  request: Request,
  options?: {
    oldValues?: Record<string, unknown> | null;
    newValues?: Record<string, unknown> | null;
    details?: Record<string, unknown>;
  }
): Promise<void> {
  const { ipAddress, userAgent } = extractRequestInfo(request);

  await createAuditLog({
    action,
    resourceType: "integration",
    resourceId: integrationId,
    userEmail,
    spaceId,
    ipAddress,
    userAgent,
    oldValues: options?.oldValues,
    newValues: options?.newValues,
    details: options?.details ?? {},
  });
}

/**
 * Helper to create audit log for group operations
 */
export async function auditGroupOperation(
  action: AuditActionType,
  groupId: string,
  spaceId: string,
  userEmail: string,
  request: Request,
  options?: {
    oldValues?: Record<string, unknown> | null;
    newValues?: Record<string, unknown> | null;
    details?: Record<string, unknown>;
  }
): Promise<void> {
  const { ipAddress, userAgent } = extractRequestInfo(request);

  await createAuditLog({
    action,
    resourceType: "group",
    resourceId: groupId,
    userEmail,
    spaceId,
    ipAddress,
    userAgent,
    oldValues: options?.oldValues,
    newValues: options?.newValues,
    details: options?.details ?? {},
  });
}

/**
 * Helper to create audit log for auth events (login/logout).
 * Does not require a Request object — accepts IP/UA directly
 * since Better Auth hooks don't expose the original request.
 */
export async function auditAuthEvent(
  action: "login" | "logout",
  userId: string,
  userEmail: string,
  options?: {
    ipAddress?: string;
    userAgent?: string;
    details?: Record<string, unknown>;
  }
): Promise<void> {
  await createAuditLog({
    action,
    resourceType: "user",
    resourceId: userId,
    userEmail,
    spaceId: null,
    ipAddress: options?.ipAddress ?? "unknown",
    userAgent: options?.userAgent ?? "unknown",
    details: options?.details ?? {},
  });
}
