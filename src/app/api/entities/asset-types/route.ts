import { NextRequest, NextResponse } from 'next/server';
import { ServerEntities } from '@/lib/entities/server';
import { getSession, requireRole } from '@/lib/auth-utils';

const MAX_LIMIT = 100;

export async function GET(request: NextRequest) {
  try {
    // Asset types can be read by any authenticated user
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const sort = searchParams.get('sort') || undefined;
    const rawLimit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : undefined;
    const limit = rawLimit ? Math.min(rawLimit, MAX_LIMIT) : undefined;

    const filter: Record<string, string> = {};
    for (const [key, value] of searchParams.entries()) {
      if (!['sort', 'limit'].includes(key)) {
        filter[key] = value;
      }
    }

    const assetTypes = Object.keys(filter).length > 0
      ? await ServerEntities.AssetType.filter(filter, sort, limit)
      : await ServerEntities.AssetType.list(sort, limit);

    return NextResponse.json(assetTypes);
  } catch (error) {
    console.error('Error fetching asset types:', error);
    return NextResponse.json({ error: 'Failed to fetch asset types' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    // Only platform admins can create asset types
    await requireRole('admin');

    const data = await request.json();
    const assetType = await ServerEntities.AssetType.create(data);
    return NextResponse.json(assetType);
  } catch (error) {
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Error creating asset type:', error);
    return NextResponse.json({ error: 'Failed to create asset type' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    // Only platform admins can update asset types
    await requireRole('admin');

    const { id, ...data } = await request.json();
    const assetType = await ServerEntities.AssetType.update(id, data);

    if (!assetType) {
      return NextResponse.json({ error: 'Asset type not found' }, { status: 404 });
    }

    return NextResponse.json(assetType);
  } catch (error) {
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Error updating asset type:', error);
    return NextResponse.json({ error: 'Failed to update asset type' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    // Only platform admins can delete asset types
    await requireRole('admin');

    const { id } = await request.json();
    const success = await ServerEntities.AssetType.delete(id);

    if (!success) {
      return NextResponse.json({ error: 'Asset type cannot be deleted' }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Error deleting asset type:', error);
    return NextResponse.json({ error: 'Failed to delete asset type' }, { status: 500 });
  }
}
