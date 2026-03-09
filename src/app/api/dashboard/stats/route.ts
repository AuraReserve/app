import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth-utils';
import prisma from '@/lib/prisma';

export async function GET() {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userRole = session.user.role;
    let totalReserveEntries: number;

    if (userRole === 'owner' || userRole === 'admin') {
      totalReserveEntries = await prisma.streamEntry.count();
    } else {
      // For regular users, count only entries in spaces they have access to
      const spaceMembers = await prisma.spaceUser.findMany({
        where: { userId: session.user.id },
        select: { spaceId: true },
      });
      const accessibleSpaceIds = spaceMembers.map(sm => sm.spaceId);

      totalReserveEntries = await prisma.streamEntry.count({
        where: {
          stream: {
            spaceId: { in: accessibleSpaceIds },
          },
        },
      });
    }

    return NextResponse.json({ totalReserveEntries });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
  }
}
