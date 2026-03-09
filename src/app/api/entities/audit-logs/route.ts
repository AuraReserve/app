import { NextRequest, NextResponse } from 'next/server';
import { ServerEntities } from '@/lib/entities/server';
import { getSession, requireRole } from '@/lib/auth-utils';
import prisma from '@/lib/prisma';
import type { Prisma, AuditAction, ResourceType } from '@prisma/client';
import type { AuditLog as AuditLogType } from '@/lib/entities/types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeAuditLog(log: AuditLogType | Record<string, unknown>): AuditLogType {
  const recordLog = log as Record<string, unknown>;

  const actionRaw = typeof recordLog.action === 'string' ? recordLog.action : undefined;
  const resourceTypeRaw =
    typeof recordLog.resource_type === 'string'
      ? recordLog.resource_type
      : typeof recordLog.resourceType === 'string'
        ? recordLog.resourceType
        : 'space';

  const createdDateRaw = recordLog.created_date ?? recordLog.createdDate;
  const resourceIdRaw = recordLog.resource_id ?? recordLog.resourceId;
  const userEmailRaw = recordLog.user_email ?? recordLog.userEmail;
  const spaceIdRaw = recordLog.space_id ?? recordLog.spaceId;
  const ipAddressRaw = recordLog.ip_address ?? recordLog.ipAddress;
  const userAgentRaw = recordLog.user_agent ?? recordLog.userAgent;
  const detailsRaw = recordLog.details;
  const oldValuesRaw = recordLog.old_values ?? recordLog.oldValues;
  const newValuesRaw = recordLog.new_values ?? recordLog.newValues;

  let createdDate: string;
  if (createdDateRaw instanceof Date) {
    createdDate = createdDateRaw.toISOString();
  } else if (typeof createdDateRaw === 'string') {
    createdDate = createdDateRaw;
  } else {
    createdDate = new Date().toISOString();
  }

  return {
    id: typeof recordLog.id === 'string' ? recordLog.id : String(recordLog.id ?? ''),
    action: (actionRaw ? actionRaw.toLowerCase() : 'create') as AuditLogType['action'],
    resource_type: String(resourceTypeRaw).toLowerCase() as AuditLogType['resource_type'],
    resource_id: typeof resourceIdRaw === 'string' ? resourceIdRaw : String(resourceIdRaw ?? ''),
    user_email: typeof userEmailRaw === 'string' ? userEmailRaw : String(userEmailRaw ?? ''),
    space_id: typeof spaceIdRaw === 'string' ? spaceIdRaw : undefined,
    ip_address: typeof ipAddressRaw === 'string' ? ipAddressRaw : String(ipAddressRaw ?? ''),
    user_agent: typeof userAgentRaw === 'string' ? userAgentRaw : String(userAgentRaw ?? ''),
    details: isRecord(detailsRaw) ? detailsRaw : {},
    old_values: isRecord(oldValuesRaw) ? oldValuesRaw : undefined,
    new_values: isRecord(newValuesRaw) ? newValuesRaw : undefined,
    created_date: createdDate,
  };
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const sort = searchParams.get('sort') || undefined;
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : undefined;

    const filter: Record<string, string> = {};
    for (const [key, value] of searchParams.entries()) {
      if (!['sort', 'limit'].includes(key)) {
        filter[key] = value;
      }
    }

    const userRole = session.user.role;

    // For owner and admin, return all audit logs
    if (userRole === 'owner' || userRole === 'admin') {
      const auditLogsRaw = Object.keys(filter).length > 0
        ? await ServerEntities.AuditLog.filter(filter as Partial<AuditLogType>, sort, limit)
        : await ServerEntities.AuditLog.list(sort, limit);

      const auditLogs = auditLogsRaw.map(normalizeAuditLog);
      return NextResponse.json(auditLogs);
    } else {
      // For members, get only audit logs for spaces they have access to
      const spaceMembers = await prisma.spaceUser.findMany({
        where: { userId: session.user.id },
        select: { spaceId: true },
      });

      const accessibleSpaceIds = spaceMembers.map(sm => sm.spaceId);

      // Build where clause with space access AND additional filters
      // Only show audit logs that have a space_id AND the user has access to that space
      // Exclude audit logs with null space_id (platform-level actions)
      const where: Prisma.AuditLogWhereInput = {
        spaceId: {
          not: null,
          in: accessibleSpaceIds,
        },
      };

      // Apply additional filters from query params
      if (filter.action) {
        where.action = filter.action.toUpperCase() as AuditAction;
      }
      if (filter.resource_type) {
        where.resourceType = filter.resource_type.toUpperCase() as ResourceType;
      }
      if (filter.space_id) {
        // If filtering by specific space, ensure user has access to it
        if (accessibleSpaceIds.includes(filter.space_id)) {
          where.spaceId = filter.space_id;
        } else {
          // User doesn't have access to this space, return empty
          return NextResponse.json([]);
        }
      }

      const auditLogsRaw = await prisma.auditLog.findMany({
        where,
        orderBy: sort === '-created_date' ? { createdDate: 'desc' } : { createdDate: 'asc' },
        take: limit,
      });

      const auditLogs = auditLogsRaw.map(normalizeAuditLog);
      return NextResponse.json(auditLogs);
    }
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    return NextResponse.json({ error: 'Failed to fetch audit logs' }, { status: 500 });
  }
}

// Audit logs should be immutable for security - only owner can manually create/modify/delete
export async function POST(request: NextRequest) {
  try {
    // Require owner role - audit logs are security-sensitive
    try {
      await requireRole('owner');
    } catch {
      return NextResponse.json({ error: 'Forbidden: Owner access required for audit log creation' }, { status: 403 });
    }

    const data = await request.json();
    const auditLog = await ServerEntities.AuditLog.create(data);
    return NextResponse.json(auditLog);
  } catch (error) {
    console.error('Error creating audit log:', error);
    return NextResponse.json({ error: 'Failed to create audit log' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    // Require owner role - audit logs should be immutable
    try {
      await requireRole('owner');
    } catch {
      return NextResponse.json({ error: 'Forbidden: Owner access required - audit logs are immutable' }, { status: 403 });
    }

    const { id, ...data } = await request.json();
    const auditLog = await ServerEntities.AuditLog.update(id, data);

    if (!auditLog) {
      return NextResponse.json({ error: 'Audit log not found' }, { status: 404 });
    }

    return NextResponse.json(auditLog);
  } catch (error) {
    console.error('Error updating audit log:', error);
    return NextResponse.json({ error: 'Failed to update audit log' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    // Require owner role - audit logs should be immutable
    try {
      await requireRole('owner');
    } catch {
      return NextResponse.json({ error: 'Forbidden: Owner access required - audit logs are immutable' }, { status: 403 });
    }

    const { id } = await request.json();
    const success = await ServerEntities.AuditLog.delete(id);

    if (!success) {
      return NextResponse.json({ error: 'Audit log not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting audit log:', error);
    return NextResponse.json({ error: 'Failed to delete audit log' }, { status: 500 });
  }
}
