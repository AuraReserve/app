/**
 * Prisma Client Singleton
 * Ensures a single Prisma Client instance is used throughout the application
 * Prevents multiple instances in development with hot reloading
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { parseJsonField } from './db-adapter';

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createPrismaClient> | undefined;
  prismaBase: PrismaClient | undefined;
  adapter: PrismaPg | undefined;
};

// Shared adapter for all Prisma clients
function getAdapter() {
  if (!globalForPrisma.adapter) {
    globalForPrisma.adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  }
  return globalForPrisma.adapter;
}

// Base Prisma client without extensions (for Better Auth)
function createBasePrismaClient() {
  return new PrismaClient({
    adapter: getAdapter(),
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });
}

function createPrismaClient() {
  const client = new PrismaClient({
    adapter: getAdapter(),
//    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

  // Extend Prisma client with computed fields that match our application types
  return client.$extends({
    result: {
      user: {
        full_name: {
          needs: { fullName: true },
          compute(user) { return user.fullName; }
        },
        auth_provider: {
          needs: { authProvider: true },
          compute(user) { return user.authProvider.toLowerCase() as 'credentials' | 'google' | 'azure'; }
        },
        provider_id: {
          needs: { providerId: true },
          compute(user) { return user.providerId; }
        },
        email_verified: {
          needs: { emailVerified: true },
          compute(user) { return user.emailVerified; }
        },
        is_active: {
          needs: { isActive: true },
          compute(user) { return user.isActive; }
        },
        last_login: {
          needs: { lastLogin: true },
          compute(user) { return user.lastLogin?.toISOString() ?? null; }
        },
        invited_by: {
          needs: { invitedBy: true },
          compute(user) { return user.invitedBy; }
        },
        created_date: {
          needs: { createdDate: true },
          compute(user) { return user.createdDate.toISOString(); }
        }
      },
      space: {
        api_identifier: {
          needs: { apiIdentifier: true },
          compute(space) { return space.apiIdentifier; }
        },
        api_identifier_source: {
          needs: { apiIdentifierSource: true },
          compute(space) { return space.apiIdentifierSource.toLowerCase() as 'slug' | 'custom'; }
        },
        is_active: {
          needs: { isActive: true },
          compute(space) { return space.isActive; }
        },
        created_by: {
          needs: { createdBy: true },
          compute(space) { return space.createdBy; }
        },
        created_date: {
          needs: { createdDate: true },
          compute(space) { return space.createdDate.toISOString(); }
        }
      },
      assetType: {
        created_date: {
          needs: { createdDate: true },
          compute(assetType) { return assetType.createdDate.toISOString(); }
        }
      },
      apiCall: {
        space_id: {
          needs: { spaceId: true },
          compute(apiCall) { return apiCall.spaceId; }
        },
        api_key_id: {
          needs: { apiKeyId: true },
          compute(apiCall) { return apiCall.apiKeyId; }
        },
        ip_address: {
          needs: { ipAddress: true },
          compute(apiCall) { return apiCall.ipAddress; }
        },
        user_agent: {
          needs: { userAgent: true },
          compute(apiCall) { return apiCall.userAgent; }
        },
        status_code: {
          needs: { statusCode: true },
          compute(apiCall) { return apiCall.statusCode; }
        },
        response_time_ms: {
          needs: { responseTimeMs: true },
          compute(apiCall) { return apiCall.responseTimeMs ?? null; }
        },
        created_date: {
          needs: { createdDate: true },
          compute(apiCall) { return apiCall.createdDate.toISOString(); }
        }
      },
      auditLog: {
        action: {
          needs: { action: true },
          compute(log) { return log.action.toLowerCase() as 'create' | 'update' | 'delete' | 'api_access' | 'login' | 'logout'; }
        },
        resource_type: {
          needs: { resourceType: true },
          compute(log) { return log.resourceType.toLowerCase() as 'space' | 'proof_of_reserve' | 'api_key' | 'user'; }
        },
        resource_id: {
          needs: { resourceId: true },
          compute(log) { return log.resourceId; }
        },
        user_email: {
          needs: { userEmail: true },
          compute(log) { return log.userEmail; }
        },
        ip_address: {
          needs: { ipAddress: true },
          compute(log) { return log.ipAddress; }
        },
        user_agent: {
          needs: { userAgent: true },
          compute(log) { return log.userAgent; }
        },
        details: {
          needs: { details: true },
          compute(log) { return parseJsonField<Record<string, unknown>>(log.details); }
        },
        old_values: {
          needs: { oldValues: true },
          compute(log) { return log.oldValues ? parseJsonField<Record<string, unknown>>(log.oldValues) : undefined; }
        },
        new_values: {
          needs: { newValues: true },
          compute(log) { return log.newValues ? parseJsonField<Record<string, unknown>>(log.newValues) : undefined; }
        },
        created_date: {
          needs: { createdDate: true },
          compute(log) { return log.createdDate.toISOString(); }
        }
      }
    }
  });
}

// Base client for Better Auth (without extensions)
export const prismaBase = globalForPrisma.prismaBase ?? createBasePrismaClient();

// Extended client for application use
export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
  globalForPrisma.prismaBase = prismaBase;
}

export default prisma;
