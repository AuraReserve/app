import { NextRequest, NextResponse } from 'next/server';
import { ServerEntities } from '@/lib/entities/server';
import { getSession, hasRole, isSpaceAdmin } from '@/lib/auth-utils';
import { canCreateSpaces } from '@/lib/permissions';
import prisma from '@/lib/prisma';
import type { Space as SpaceType } from '@/lib/entities/types';
import type { IntegrationDirection, IntegrationTrigger, IntegrationStatus, SpaceRole, ApiIdentifierSource, AuditAction, ResourceType } from '@prisma/client';
import { requireArtifactType } from '@/lib/artifact-types';

// Prisma v7 enum workaround (prisma/prisma#28894)
const DIRECTION_INPUT = "INPUT" as unknown as IntegrationDirection;
const DIRECTION_OUTPUT = "OUTPUT" as unknown as IntegrationDirection;
const STATUS_ACTIVE = "ACTIVE" as unknown as IntegrationStatus;
const ROLE_ADMIN = "ADMIN" as unknown as SpaceRole;
const API_ID_SOURCE_SLUG = "SLUG" as unknown as ApiIdentifierSource;
const API_ID_SOURCE_CUSTOM = "CUSTOM" as unknown as ApiIdentifierSource;
const ACTION_CREATE = "CREATE" as unknown as AuditAction;
const RESOURCE_SPACE = "SPACE" as unknown as ResourceType;

// ---------------------------------------------------------------------------
// Types for atomic space creation
// ---------------------------------------------------------------------------

interface StoreInput {
  sourceType: string;
  streamName: string;
  streamSlug: string;
  assetType: string;
  unit: string;
  artifactType: string;
  sourceConfig: Record<string, unknown>;
  trigger?: string;
  schedule?: string;
}

interface OutputInput {
  destType: string;
  streamRef: string; // streamSlug from client
  trigger: string;
  schedule: string;
  destConfig: Record<string, unknown>;
}

interface CreateSpacePayload extends Omit<SpaceType, 'id' | 'created_date'> {
  streams?: StoreInput[];
  outputs?: OutputInput[];
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

    // For owner and admin, return all spaces
    // For members, only return spaces they have access to
    const userRole = session.user.role;

    const shouldApplyLimit = typeof limit === 'number' ? limit : undefined;

    let spaces: SpaceType[];

    if (userRole === 'owner' || userRole === 'admin') {
      spaces = Object.keys(filter).length > 0
        ? await ServerEntities.Space.filter(filter as Partial<SpaceType>, sort, shouldApplyLimit)
        : await ServerEntities.Space.list(sort, shouldApplyLimit);
    } else {
      // For members, get only spaces they're assigned to
      const spaceMembers = await prisma.spaceUser.findMany({
        where: { userId: session.user.id },
        select: { spaceId: true },
      });

      const accessibleSpaceIds = spaceMembers.map((sm) => sm.spaceId);

      if (accessibleSpaceIds.length === 0) {
        return NextResponse.json([]);
      }

      // Fetch spaces with server entity helpers to ensure consistent formatting,
      // then filter down to the ones the member can access.
      const fetchedSpaces = Object.keys(filter).length > 0
        ? await ServerEntities.Space.filter(filter as Partial<SpaceType>, sort)
        : await ServerEntities.Space.list(sort);

      const filteredSpaces = fetchedSpaces.filter((space) =>
        accessibleSpaceIds.includes(space.id)
      );

      spaces =
        typeof shouldApplyLimit === 'number'
          ? filteredSpaces.slice(0, shouldApplyLimit)
          : filteredSpaces;
    }

    // Enrich spaces with distinct asset types from their data streams
    const spaceIds = spaces.map((s) => s.id);
    if (spaceIds.length > 0) {
      const streams = await prisma.dataStream.findMany({
        where: { spaceId: { in: spaceIds }, isActive: true },
        select: { spaceId: true, assetType: true },
      });

      const assetTypesBySpace = new Map<string, string[]>();
      for (const stream of streams) {
        if (!stream.assetType) continue;
        const existing = assetTypesBySpace.get(stream.spaceId);
        if (existing) {
          if (!existing.includes(stream.assetType)) existing.push(stream.assetType);
        } else {
          assetTypesBySpace.set(stream.spaceId, [stream.assetType]);
        }
      }

      for (const space of spaces) {
        (space as SpaceType & { asset_types?: string[] }).asset_types =
          assetTypesBySpace.get(space.id) ?? [];
      }
    }

    return NextResponse.json(spaces);
  } catch (error) {
    console.error('Error fetching spaces:', error);
    return NextResponse.json({ error: 'Failed to fetch spaces' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Require creator role or higher to create spaces
    if (!canCreateSpaces(session.user.role)) {
      return NextResponse.json({ error: 'Forbidden: Creator role required to create spaces' }, { status: 403 });
    }

    const body: CreateSpacePayload = await request.json();

    // Separate stream/output configs from space data
    const { streams, outputs, ...spaceData } = body;

    // Create everything atomically in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // 1. Create space
      const space = await tx.space.create({
        data: {
          name: spaceData.name,
          description: spaceData.description ?? '',
          slug: spaceData.slug,
          apiIdentifier: spaceData.api_identifier ?? spaceData.slug,
          apiIdentifierSource: spaceData.api_identifier_source === 'custom' ? API_ID_SOURCE_CUSTOM : API_ID_SOURCE_SLUG,
          isActive: spaceData.is_active ?? true,
          createdBy: spaceData.created_by,
        },
      });

      // 2. Add creator as SpaceAdmin
      await tx.spaceUser.create({
        data: {
          userId: session.user.id,
          spaceId: space.id,
          role: ROLE_ADMIN,
        },
      });

      // 3. Create DataStreams from input configs
      const streamRecords: Array<{ id: string; slug: string }> = [];
      if (streams && streams.length > 0) {
        for (const stream of streams) {
          const created = await tx.dataStream.create({
            data: {
              spaceId: space.id,
              name: stream.streamName,
              slug: stream.streamSlug,
              artifactType: requireArtifactType(stream.artifactType),
              assetType: stream.assetType || null,
              unit: stream.unit || null,
              valueField: stream.unit || null,
              createdBy: session.user.id,
            },
          });
          streamRecords.push({ id: created.id, slug: created.slug });

          // 4. Create SpaceIntegration for input source
          const integration = await tx.integration.findUnique({
            where: { key: stream.sourceType },
          });
          if (integration) {
            const inputTrigger = stream.trigger
              ? (stream.trigger.toUpperCase() as unknown as IntegrationTrigger)
              : integration.defaultTrigger ?? null;

            await tx.spaceIntegration.create({
              data: {
                spaceId: space.id,
                integrationId: integration.id,
                streamId: created.id,
                direction: DIRECTION_INPUT,
                status: STATUS_ACTIVE,
                config: (stream.sourceConfig ?? {}) as never,
                trigger: inputTrigger,
                schedule: stream.schedule || integration.defaultSchedule || null,
              },
            });
          }
        }
      }

      // 5. Create SpaceIntegrations for output destinations
      if (outputs && outputs.length > 0) {
        for (const output of outputs) {
          const integration = await tx.integration.findUnique({
            where: { key: output.destType },
          });
          if (!integration) continue;

          // Find the specific stream this output links to
          if (!output.streamRef) {
            // No stream specified — skip (will be configured later)
            continue;
          }
          const targetStream = streamRecords.find((s) => s.slug === output.streamRef);
          if (!targetStream) continue;

          await tx.spaceIntegration.create({
            data: {
              spaceId: space.id,
              integrationId: integration.id,
              streamId: targetStream.id,
              direction: DIRECTION_OUTPUT,
              status: STATUS_ACTIVE,
              config: (output.destConfig ?? {}) as never,
              trigger: output.trigger ? (output.trigger.toUpperCase() as unknown as IntegrationTrigger) : null,
              schedule: output.schedule || null,
            },
          });
        }
      }

      // 6. Audit log
      if (session.user.email) {
        await tx.auditLog.create({
          data: {
            action: ACTION_CREATE,
            resourceType: RESOURCE_SPACE,
            resourceId: space.id,
            spaceId: space.id,
            userEmail: session.user.email,
            ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
            userAgent: request.headers.get('user-agent') || 'unknown',
            details: {
              space_name: space.name,
              streams_count: streams?.length ?? 0,
              outputs_count: outputs?.length ?? 0,
            },
            newValues: {
              name: space.name,
              description: space.description,
            },
          },
        });
      }

      return space;
    });

    // Sync any cron-scheduled input integrations to BullMQ
    if (streams && streams.length > 0) {
      try {
        const { syncRepeatableJob } = await import("@/lib/queue/sync");
        const cronInputs = await prisma.spaceIntegration.findMany({
          where: { spaceId: result.id, direction: DIRECTION_INPUT, trigger: "CRON" as unknown as IntegrationTrigger },
          select: { id: true },
        });
        for (const si of cronInputs) {
          await syncRepeatableJob(si.id);
        }
      } catch (err) {
        console.warn("[Queue] Failed to sync repeatable jobs after space creation:", err);
      }
    }

    // Return the created space (format to match entity system conventions)
    const [space] = await ServerEntities.Space.filter({ id: result.id });
    return NextResponse.json(space);
  } catch (error) {
    console.error('Error creating space:', error);

    // Surface actionable error messages
    const message = error instanceof Error ? error.message : 'Failed to create space';

    // Prisma unique constraint violation
    if (
      typeof (error as { code?: string }).code === 'string' &&
      (error as { code: string }).code === 'P2002'
    ) {
      const target = (error as { meta?: { target?: string[] } }).meta?.target;
      if (target?.includes('slug')) {
        return NextResponse.json({ error: 'A space with this slug already exists' }, { status: 409 });
      }
      if (target?.includes('api_identifier')) {
        return NextResponse.json({ error: 'A space with this API identifier already exists' }, { status: 409 });
      }
      return NextResponse.json({ error: 'A space with these details already exists' }, { status: 409 });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id, ...data }: { id: string } & Partial<SpaceType> = await request.json();

    // Verify user is admin of the space
    const canManage = await isSpaceAdmin(id);
    if (!canManage) {
      return NextResponse.json({ error: 'Forbidden: Space admin access required' }, { status: 403 });
    }

    // Get old values for audit log
    const oldSpace = await prisma.space.findUnique({ where: { id } });

    const space = await ServerEntities.Space.update(id, data);

    if (!space) {
      return NextResponse.json({ error: 'Space not found' }, { status: 404 });
    }

    // Create audit log for space update with space_id
    if (session.user.email) {
      try {
        await ServerEntities.AuditLog.create({
          action: 'update',
          resource_type: 'space',
          resource_id: space.id,
          space_id: space.id,
          user_email: session.user.email,
          ip_address: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
          user_agent: request.headers.get('user-agent') || 'unknown',
          details: {
            space_name: space.name,
            fields_updated: Object.keys(data),
          },
          old_values: oldSpace ? {
            name: oldSpace.name,
            description: oldSpace.description,
            isActive: oldSpace.isActive,
          } : undefined,
          new_values: {
            name: space.name,
            description: space.description,
            is_active: space.is_active,
          },
        });
      } catch (auditError) {
        console.error('Error creating audit log for space update:', auditError);
      }
    }

    return NextResponse.json(space);
  } catch (error) {
    console.error('Error updating space:', error);
    return NextResponse.json({ error: 'Failed to update space' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Require platform admin role to delete spaces
    if (!hasRole(session.user.role, 'admin')) {
      return NextResponse.json({ error: 'Forbidden: Platform admin access required to delete spaces' }, { status: 403 });
    }

    const { id }: { id: string } = await request.json();

    // Get space details for audit log before deletion
    const space = await prisma.space.findUnique({ where: { id } });

    const success = await ServerEntities.Space.delete(id);

    if (!success) {
      return NextResponse.json({ error: 'Space not found' }, { status: 404 });
    }

    // Create audit log for space deletion with space_id
    if (space && session.user.email) {
      try {
        await ServerEntities.AuditLog.create({
          action: 'delete',
          resource_type: 'space',
          resource_id: id,
          space_id: id,
          user_email: session.user.email,
          ip_address: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
          user_agent: request.headers.get('user-agent') || 'unknown',
          details: {
            space_name: space.name,
          },
          old_values: {
            name: space.name,
            description: space.description,
          },
        });
      } catch (auditError) {
        console.error('Error creating audit log for space deletion:', auditError);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting space:', error);
    return NextResponse.json({ error: 'Failed to delete space' }, { status: 500 });
  }
}
