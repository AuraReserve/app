import { NextRequest, NextResponse } from 'next/server';
import { ServerEntities } from '@/lib/entities/server';
import { getSession, requireRole } from '@/lib/auth-utils';
import prisma from '@/lib/prisma';
import type { ApiCall as ApiCallType } from '@/lib/entities/types';

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

    // For owner and admin, return all api calls
    if (userRole === 'owner' || userRole === 'admin') {
      const apiCalls = Object.keys(filter).length > 0
        ? await ServerEntities.ApiCall.filter(filter as Partial<ApiCallType>, sort, limit)
        : await ServerEntities.ApiCall.list(sort, limit);

      return NextResponse.json(apiCalls);
    } else {
      // For members, get only api calls for spaces they have access to
      const spaceMembers = await prisma.spaceUser.findMany({
        where: { userId: session.user.id },
        select: { spaceId: true },
      });

      const accessibleSpaceIds = spaceMembers.map(sm => sm.spaceId);

      // Use Prisma directly to filter by space access
      const apiCalls = await prisma.apiCall.findMany({
        where: {
          spaceId: {
            in: accessibleSpaceIds,
          },
        },
        orderBy: sort === '-created_date' ? { createdDate: 'desc' } : { createdDate: 'asc' },
        take: limit,
      });

      return NextResponse.json(apiCalls);
    }
  } catch (error) {
    console.error('Error fetching api calls:', error);
    return NextResponse.json({ error: 'Failed to fetch api calls' }, { status: 500 });
  }
}

// POST/PATCH/DELETE are admin-only operations on internal logs
export async function POST(request: NextRequest) {
  try {
    // Require admin role - API calls are internal system logs
    try {
      await requireRole('admin');
    } catch {
      return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const data = await request.json();
    const apiCall = await ServerEntities.ApiCall.create(data);
    return NextResponse.json(apiCall);
  } catch (error) {
    console.error('Error creating api call:', error);
    return NextResponse.json({ error: 'Failed to create api call' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    // Require admin role - API calls are internal system logs
    try {
      await requireRole('admin');
    } catch {
      return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { id, ...data } = await request.json();
    const apiCall = await ServerEntities.ApiCall.update(id, data);

    if (!apiCall) {
      return NextResponse.json({ error: 'Api call not found' }, { status: 404 });
    }

    return NextResponse.json(apiCall);
  } catch (error) {
    console.error('Error updating api call:', error);
    return NextResponse.json({ error: 'Failed to update api call' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    // Require admin role - API calls are internal system logs
    try {
      await requireRole('admin');
    } catch {
      return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { id } = await request.json();
    const success = await ServerEntities.ApiCall.delete(id);

    if (!success) {
      return NextResponse.json({ error: 'Api call not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting api call:', error);
    return NextResponse.json({ error: 'Failed to delete api call' }, { status: 500 });
  }
}
