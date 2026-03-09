/**
 * Server-Side Entity Operations
 * These functions use Prisma directly and can only run on the server
 */

import type {
  Space as SpaceType,
  ApiCall as ApiCallType,
  AuditLog as AuditLogType,
  User as UserType,
  AssetType as AssetTypeType,
} from "./types";
import prisma from "../prisma";
import type { Prisma } from "@prisma/client";

type UnknownRecord = Record<string, unknown>;

function normalizeSlug(value: string): string {
  const base = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
  return base || 'space';
}

// Helper to convert field names from snake_case to camelCase
function toPrismaField(field: string): string {
  return field.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

// Helper to convert data to Prisma format
function toPrismaData<T extends UnknownRecord>(data: T): UnknownRecord {
  const prismaData: UnknownRecord = {};

  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;

    // Skip null foreign keys to avoid constraint violations
    if (value === null && (key === 'invited_by' || key === 'created_by')) continue;

    const prismaKey = toPrismaField(key);

    // Handle special conversions
    if (key === 'asset_type' && typeof value === 'string') {
      prismaData[prismaKey] = value.toLowerCase();
    } else if (key === 'slug' && typeof value === 'string') {
      prismaData[prismaKey] = normalizeSlug(value);
    } else if (key === 'api_identifier_source' && typeof value === 'string') {
      prismaData[prismaKey] = value.toUpperCase();
    } else if (key === 'role' && typeof value === 'string') {
      prismaData[prismaKey] = value.toUpperCase();
    } else if (key === 'auth_provider' && typeof value === 'string') {
      prismaData[prismaKey] = value.toUpperCase();
    } else if (key === 'action' && typeof value === 'string') {
      prismaData[prismaKey] = value.toUpperCase();
    } else if (key === 'resource_type' && typeof value === 'string') {
      prismaData[prismaKey] = value.toUpperCase().replace('_', '_');
    } else if (key === 'archived_at' && typeof value === 'string') {
      prismaData[prismaKey] = new Date(value);
    } else if (key.endsWith('_date') && typeof value === 'string') {
      prismaData[prismaKey] = new Date(value);
    } else {
      prismaData[prismaKey] = value;
    }
  }

  return prismaData;
}

// Helper to build where clause
function buildWhere<T extends UnknownRecord>(criteria: T): UnknownRecord {
  const where: UnknownRecord = {};

  for (const [key, value] of Object.entries(criteria)) {
    const prismaKey = toPrismaField(key);

    // Handle enum conversions to uppercase (matching toPrismaData behavior)
    if (
      (key === 'action' ||
        key === 'resource_type' ||
        key === 'role' ||
        key === 'auth_provider' ||
        key === 'api_identifier_source') &&
      typeof value === 'string'
    ) {
      where[prismaKey] = value.toUpperCase();
    } else {
      where[prismaKey] = value;
    }
  }

  return where;
}

// Helper to convert field names from camelCase to snake_case
function toSnakeCase(field: string): string {
  return field.replace(/([A-Z])/g, '_$1').toLowerCase();
}

// Helper to convert Prisma result back to API format (snake_case)
function fromPrismaData<T>(data: UnknownRecord): T {
  const result: UnknownRecord = {};

  for (const [key, value] of Object.entries(data)) {
    const snakeKey = toSnakeCase(key);

    // Handle enum conversions back to lowercase
    if (
      (snakeKey === 'role' ||
        snakeKey === 'auth_provider' ||
        snakeKey === 'api_identifier_source' ||
        snakeKey === 'action' ||
        snakeKey === 'resource_type') &&
      typeof value === 'string'
    ) {
      result[snakeKey] = value.toLowerCase();
    } else if (value instanceof Date) {
      result[snakeKey] = value.toISOString();
    } else {
      result[snakeKey] = value;
    }
  }

  return result as T;
}

// Helper to convert array of Prisma results
function fromPrismaArray<T>(data: UnknownRecord[]): T[] {
  return data.map((item) => fromPrismaData<T>(item));
}

// Helper to build order by clause
function buildOrderBy(sort?: string): Record<string, Prisma.SortOrder> {
  const orderBy: Record<string, Prisma.SortOrder> = {};

  if (sort) {
    const descending = sort.startsWith('-');
    const field = descending ? sort.substring(1) : sort;
    const prismaField = toPrismaField(field);
    orderBy[prismaField] = descending ? "desc" : "asc";
  } else {
    orderBy.createdDate = "desc";
  }

  return orderBy;
}

// ── User-scoping helpers (defense-in-depth) ──────────────────────────
// Automatically limits list/filter queries to the requesting user's
// accessible resources. Admin/owner sees everything; non-admin sees
// only their spaces. Falls back to no scoping when there is no request
// context (e.g. seed scripts, background jobs).

interface UserContext {
  userId: string;
  role: string | null;
}

async function getUserContext(): Promise<UserContext | null> {
  try {
    const { getSession } = await import("@/lib/auth-utils");
    const session = await getSession();
    if (!session?.user?.id) return null;
    return { userId: session.user.id, role: session.user.role ?? null };
  } catch {
    return null;
  }
}

function isAdminOrOwner(role: string | null): boolean {
  return role === "owner" || role === "admin";
}

/** IDs of spaces the user has ANY membership in */
async function getUserSpaceIds(userId: string): Promise<string[]> {
  const memberships = await prisma.spaceUser.findMany({
    where: { userId },
    select: { spaceId: true },
  });
  return memberships.map((m) => m.spaceId);
}

// Server-side entity operations
export const ServerEntities = {
  User: {
    async list(sort?: string, limit?: number): Promise<UserType[]> {
      const users = await prisma.user.findMany({
        orderBy: buildOrderBy(sort) as Prisma.UserOrderByWithRelationInput,
        take: limit,
      });
      return users as unknown as UserType[];
    },

    async filter(criteria: Partial<UserType>, sort?: string, limit?: number): Promise<UserType[]> {
      const users = await prisma.user.findMany({
        where: buildWhere(criteria) as Prisma.UserWhereInput,
        orderBy: buildOrderBy(sort) as Prisma.UserOrderByWithRelationInput,
        take: limit,
      });
      return users as unknown as UserType[];
    },

    async create(data: Omit<UserType, 'id' | 'created_date'>): Promise<UserType> {
      const user = await prisma.user.create({
        data: toPrismaData(data) as Prisma.UserCreateInput,
      });
      return user as unknown as UserType;
    },

    async update(id: string, data: Partial<UserType>): Promise<UserType | null> {
      try {
        const user = await prisma.user.update({
          where: { id },
          data: toPrismaData(data) as Prisma.UserUpdateInput,
        });
        return user as unknown as UserType;
      } catch {
        return null;
      }
    },

    async delete(id: string): Promise<boolean> {
      try {
        await prisma.user.delete({ where: { id } });
        return true;
      } catch {
        return false;
      }
    },

    async me(): Promise<UserType> {
      const { getSession } = await import('@/lib/auth-utils');
      const session = await getSession();

      if (!session?.user?.id) {
        throw new Error('Unauthorized');
      }

      const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: {
          id: true,
          email: true,
          name: true,
          fullName: true,
          company: true,
          role: true,
          authProvider: true,
          providerId: true,
          image: true,
          emailVerified: true,
          isActive: true,
          lastLogin: true,
          invitedBy: true,
          createdDate: true,
        },
      });

      if (!user) {
        throw new Error('User not found');
      }

      return {
        id: user.id,
        email: user.email,
        full_name: user.fullName || user.name,
        company: user.company ?? undefined,
        role: user.role ? (user.role.toLowerCase() as UserType["role"]) : null,
        auth_provider: user.authProvider.toLowerCase() as UserType["auth_provider"],
        provider_id: user.providerId ?? undefined,
        image: user.image ?? undefined,
        email_verified: user.emailVerified,
        is_active: user.isActive,
        last_login: user.lastLogin ? user.lastLogin.toISOString() : null,
        invited_by: user.invitedBy ?? null,
        created_date: user.createdDate.toISOString(),
      };
    },
  },

  Space: {
    async list(sort?: string, limit?: number): Promise<SpaceType[]> {
      const ctx = await getUserContext();
      let where: Prisma.SpaceWhereInput | undefined;
      if (ctx && !isAdminOrOwner(ctx.role)) {
        const spaceIds = await getUserSpaceIds(ctx.userId);
        where = { id: { in: spaceIds } };
      }

      const spaces = await prisma.space.findMany({
        where,
        orderBy: buildOrderBy(sort) as Prisma.SpaceOrderByWithRelationInput,
        take: limit,
      });
      return fromPrismaArray<SpaceType>(spaces as unknown as UnknownRecord[]);
    },

    async filter(criteria: Partial<SpaceType>, sort?: string, limit?: number): Promise<SpaceType[]> {
      const ctx = await getUserContext();
      const criteriaWhere = buildWhere(criteria) as Prisma.SpaceWhereInput;
      let where: Prisma.SpaceWhereInput = criteriaWhere;

      if (ctx && !isAdminOrOwner(ctx.role)) {
        const spaceIds = await getUserSpaceIds(ctx.userId);
        where = { AND: [criteriaWhere, { id: { in: spaceIds } }] };
      }

      const spaces = await prisma.space.findMany({
        where,
        orderBy: buildOrderBy(sort) as Prisma.SpaceOrderByWithRelationInput,
        take: limit,
      });
      return fromPrismaArray<SpaceType>(spaces as unknown as UnknownRecord[]);
    },

    async create(data: Omit<SpaceType, 'id' | 'created_date'>): Promise<SpaceType> {
      const prismaData = toPrismaData(data) as Record<string, unknown>;

      if (!("apiIdentifier" in prismaData)) {
        prismaData.apiIdentifier = data.slug ?? normalizeSlug(data.slug ?? data.name ?? "space");
      }

      if (!("apiIdentifierSource" in prismaData)) {
        prismaData.apiIdentifierSource = "slug";
      }

      const space = await prisma.space.create({
        data: prismaData as Prisma.SpaceCreateInput,
      });
      return fromPrismaData<SpaceType>(space as unknown as UnknownRecord);
    },

    async update(id: string, data: Partial<SpaceType>): Promise<SpaceType | null> {
      try {
        const prismaData = toPrismaData(data) as Record<string, unknown>;

        const apiIdentifierSource = typeof prismaData.apiIdentifierSource === "string" ? prismaData.apiIdentifierSource : null;
        const needsCurrentSpace = (
          ("slug" in prismaData && !("apiIdentifier" in prismaData)) ||
          (apiIdentifierSource === "slug" && !("apiIdentifier" in prismaData))
        );

        let currentSpace: { apiIdentifierSource: string; slug: string } | null = null;
        if (needsCurrentSpace) {
          currentSpace = await prisma.space.findUnique({
            where: { id },
            select: { apiIdentifierSource: true, slug: true },
          });
        }

        if (
          typeof prismaData.slug === "string" &&
          !("apiIdentifier" in prismaData) &&
          currentSpace?.apiIdentifierSource === "slug"
        ) {
          prismaData.apiIdentifier = prismaData.slug;
        }

        if (
          apiIdentifierSource === "slug" &&
          !("apiIdentifier" in prismaData) &&
          currentSpace?.slug
        ) {
          prismaData.apiIdentifier = currentSpace.slug;
        }

        const space = await prisma.space.update({
          where: { id },
          data: prismaData as Prisma.SpaceUpdateInput,
        });
        return fromPrismaData<SpaceType>(space as unknown as UnknownRecord);
      } catch {
        return null;
      }
    },

    async delete(id: string): Promise<boolean> {
      try {
        await prisma.space.delete({ where: { id } });
        return true;
      } catch {
        return false;
      }
    },
  },

  AssetType: {
    async list(sort?: string, limit?: number): Promise<AssetTypeType[]> {
      const assetTypes = await prisma.assetType.findMany({
        orderBy: buildOrderBy(sort) as Prisma.AssetTypeOrderByWithRelationInput,
        take: limit,
      });
      return assetTypes.map(at => ({
        ...at,
        id: at.value,
        created_date: at.createdDate.toISOString(),
        usage_count: 0,
      })) as unknown as AssetTypeType[];
    },

    async filter(criteria: Partial<AssetTypeType>, sort?: string, limit?: number): Promise<AssetTypeType[]> {
      const assetTypes = await prisma.assetType.findMany({
        where: buildWhere(criteria) as Prisma.AssetTypeWhereInput,
        orderBy: buildOrderBy(sort) as Prisma.AssetTypeOrderByWithRelationInput,
        take: limit,
      });
      return assetTypes.map(at => ({
        ...at,
        id: at.value,
        created_date: at.createdDate.toISOString(),
        usage_count: 0,
      })) as unknown as AssetTypeType[];
    },

    async create(data: Pick<AssetTypeType, 'value' | 'label' | 'description' | 'icon'>): Promise<AssetTypeType> {
      const assetType = await prisma.assetType.create({
        data: toPrismaData(data) as Prisma.AssetTypeCreateInput,
      });
      return {
        ...assetType,
        id: assetType.value,
        created_date: assetType.createdDate.toISOString(),
        usage_count: 0,
      } as unknown as AssetTypeType;
    },

    async update(value: string, data: Partial<Pick<AssetTypeType, 'value' | 'label' | 'description' | 'icon'>>): Promise<AssetTypeType | null> {
      try {
        const assetType = await prisma.assetType.update({
          where: { value },
          data: toPrismaData(data) as Prisma.AssetTypeUpdateInput,
        });
        return {
          ...assetType,
          id: assetType.value,
          created_date: assetType.createdDate.toISOString(),
          usage_count: 0,
        } as unknown as AssetTypeType;
      } catch {
        return null;
      }
    },

    async delete(value: string): Promise<boolean> {
      try {
        await prisma.assetType.delete({ where: { value } });
        return true;
      } catch {
        return false;
      }
    },
  },

  ApiCall: {
    async list(sort?: string, limit?: number): Promise<ApiCallType[]> {
      const ctx = await getUserContext();
      let where: Prisma.ApiCallWhereInput | undefined;
      if (ctx && !isAdminOrOwner(ctx.role)) {
        const spaceIds = await getUserSpaceIds(ctx.userId);
        where = { spaceId: { in: spaceIds } };
      }

      const apiCalls = await prisma.apiCall.findMany({
        where,
        orderBy: buildOrderBy(sort) as Prisma.ApiCallOrderByWithRelationInput,
        take: limit,
      });
      return apiCalls as unknown as ApiCallType[];
    },

    async filter(criteria: Partial<ApiCallType>, sort?: string, limit?: number): Promise<ApiCallType[]> {
      const ctx = await getUserContext();
      const criteriaWhere = buildWhere(criteria) as Prisma.ApiCallWhereInput;
      let where: Prisma.ApiCallWhereInput = criteriaWhere;

      if (ctx && !isAdminOrOwner(ctx.role)) {
        const spaceIds = await getUserSpaceIds(ctx.userId);
        where = { AND: [criteriaWhere, { spaceId: { in: spaceIds } }] };
      }

      const apiCalls = await prisma.apiCall.findMany({
        where,
        orderBy: buildOrderBy(sort) as Prisma.ApiCallOrderByWithRelationInput,
        take: limit,
      });
      return apiCalls as unknown as ApiCallType[];
    },

    async create(data: Omit<ApiCallType, 'id' | 'created_date'>): Promise<ApiCallType> {
      const apiCall = await prisma.apiCall.create({
        data: toPrismaData(data) as Prisma.ApiCallCreateInput,
      });
      return apiCall as unknown as ApiCallType;
    },

    async update(id: string, data: Partial<ApiCallType>): Promise<ApiCallType | null> {
      try {
        const apiCall = await prisma.apiCall.update({
          where: { id },
          data: toPrismaData(data) as Prisma.ApiCallUpdateInput,
        });
        return apiCall as unknown as ApiCallType;
      } catch {
        return null;
      }
    },

    async delete(id: string): Promise<boolean> {
      try {
        await prisma.apiCall.delete({ where: { id } });
        return true;
      } catch {
        return false;
      }
    },
  },

  AuditLog: {
    async list(sort?: string, limit?: number): Promise<AuditLogType[]> {
      const ctx = await getUserContext();
      let where: Prisma.AuditLogWhereInput | undefined;
      if (ctx && !isAdminOrOwner(ctx.role)) {
        const spaceIds = await getUserSpaceIds(ctx.userId);
        // Non-admins only see space-scoped logs (exclude platform-level logs with null spaceId)
        where = { spaceId: { not: null, in: spaceIds } };
      }

      const auditLogs = await prisma.auditLog.findMany({
        where,
        orderBy: buildOrderBy(sort) as Prisma.AuditLogOrderByWithRelationInput,
        take: limit,
      });
      return auditLogs as unknown as AuditLogType[];
    },

    async filter(criteria: Partial<AuditLogType>, sort?: string, limit?: number): Promise<AuditLogType[]> {
      const ctx = await getUserContext();
      const criteriaWhere = buildWhere(criteria) as Prisma.AuditLogWhereInput;
      let where: Prisma.AuditLogWhereInput = criteriaWhere;

      if (ctx && !isAdminOrOwner(ctx.role)) {
        const spaceIds = await getUserSpaceIds(ctx.userId);
        where = { AND: [criteriaWhere, { spaceId: { not: null, in: spaceIds } }] };
      }

      const auditLogs = await prisma.auditLog.findMany({
        where,
        orderBy: buildOrderBy(sort) as Prisma.AuditLogOrderByWithRelationInput,
        take: limit,
      });
      return auditLogs as unknown as AuditLogType[];
    },

    async create(data: Omit<AuditLogType, 'id' | 'created_date'>): Promise<AuditLogType> {
      const auditLog = await prisma.auditLog.create({
        data: toPrismaData(data) as Prisma.AuditLogCreateInput,
      });
      return auditLog as unknown as AuditLogType;
    },

    async update(id: string, data: Partial<AuditLogType>): Promise<AuditLogType | null> {
      try {
        const auditLog = await prisma.auditLog.update({
          where: { id },
          data: toPrismaData(data) as Prisma.AuditLogUpdateInput,
        });
        return auditLog as unknown as AuditLogType;
      } catch {
        return null;
      }
    },

    async delete(id: string): Promise<boolean> {
      try {
        await prisma.auditLog.delete({ where: { id } });
        return true;
      } catch {
        return false;
      }
    },
  },
};
