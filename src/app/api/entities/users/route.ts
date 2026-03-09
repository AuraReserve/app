import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { ServerEntities } from '@/lib/entities/server';
import { validatePassword, hashPassword } from '@/lib/password';
import type { User as UserType } from '@/lib/entities/types';
import prisma from '@/lib/prisma';
import { getSession, requireRole, hasRole } from '@/lib/auth-utils';
import { auditUserOperation } from '@/lib/dal/audit';

type PublicUser = Omit<UserType, 'password'>;

function sanitizeUser(user: UserType): PublicUser {
  const { password: _password, ...safeUser } = user;
  return safeUser;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const action = searchParams.get('action');
    const sort = searchParams.get('sort') || undefined;
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : undefined;

    if (action === 'me') {
      const session = await getSession();
      if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      try {
        const user = await ServerEntities.User.me();
        return NextResponse.json(sanitizeUser(user));
      } catch (error) {
        if (error instanceof Error) {
          if (error.message === 'Unauthorized') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
          }
          if (error.message === 'User not found') {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
          }
        }

        console.error('Error fetching current user:', error);
        return NextResponse.json({ error: 'Failed to fetch user' }, { status: 500 });
      }
    }

    // Require admin role to list all users
    try {
      await requireRole('admin');
    } catch {
      return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // Get filter criteria from query params
    const filter: Record<string, string> = {};
    for (const [key, value] of searchParams.entries()) {
      if (!['action', 'sort', 'limit'].includes(key)) {
        filter[key] = value;
      }
    }

    const users = Object.keys(filter).length > 0
      ? await ServerEntities.User.filter(filter as Partial<UserType>, sort, limit)
      : await ServerEntities.User.list(sort, limit);

    // Fetch all space memberships in a single query (avoids N+1)
    const userIds = users.map((user) => user.id);
    const allSpaceMembers = await prisma.spaceUser.findMany({
      where: { userId: { in: userIds } },
      include: {
        space: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });

    // Group space memberships by user ID
    const spaceMembersByUserId = new Map<string, typeof allSpaceMembers>();
    for (const sm of allSpaceMembers) {
      const existing = spaceMembersByUserId.get(sm.userId) || [];
      existing.push(sm);
      spaceMembersByUserId.set(sm.userId, existing);
    }

    // Map users with their space memberships
    const usersWithSpaceMembers = users.map((user) => {
      const safeUser = sanitizeUser(user);
      const spaceMembers = spaceMembersByUserId.get(user.id) || [];

      return {
        ...safeUser,
        spaceMembers: spaceMembers.map((sm) => ({
          id: sm.id,
          role: sm.role.toLowerCase(),
          space: sm.space,
        })),
      };
    });

    return NextResponse.json(usersWithSpaceMembers);
  } catch (error) {
    console.error('Error fetching users:', error);
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    // Require admin role to create users
    try {
      await requireRole('admin');
    } catch {
      return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const session = await getSession();
    const data = await request.json() as Omit<UserType, 'id' | 'created_date'>;

    // Prevent non-owners from assigning admin or owner roles
    if ((data.role === 'admin' || data.role === 'owner') && session?.user?.role !== 'owner') {
      return NextResponse.json({ error: 'Forbidden: Only owners can assign admin or owner roles' }, { status: 403 });
    }

    // Remove invited_by if it's null or invalid to avoid foreign key constraint
    if (!data.invited_by) {
      delete (data).invited_by;
    }

    // Validate and hash password if provided
    if (typeof data.password === 'string') {
      const validation = validatePassword(data.password);
      if (!validation.isValid) {
        return NextResponse.json(
          { error: 'Invalid password', details: validation.errors },
          { status: 400 }
        );
      }

      data.password = await hashPassword(data.password);
    }

    const user = await ServerEntities.User.create(data);

    // Audit log (non-blocking)
    after(async () => {
      if (session?.user?.email) {
        await auditUserOperation("create", user.id, session.user.email, request, {
          details: {
            action: "user_created",
            created_user_email: user.email,
            created_user_name: user.full_name,
            role: user.role,
          },
          newValues: {
            email: user.email,
            full_name: user.full_name,
            role: user.role,
            is_active: user.is_active,
          },
        });
      }
    });

    return NextResponse.json(sanitizeUser(user));
  } catch (error) {
    console.error('Error creating user:', error);
    return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id, ...data } = await request.json() as { id: string } & Partial<UserType>;

    // Self-update: users can update their own name (non-privileged fields only)
    const isSelfUpdate = id === session.user.id;
    if (isSelfUpdate) {
      // Only allow name update for self-edits — reject role, is_active, password, etc.
      const allowedSelfFields = new Set(['full_name', 'company']);
      const attemptedFields = Object.keys(data);
      const disallowedFields = attemptedFields.filter(f => !allowedSelfFields.has(f));
      if (disallowedFields.length > 0) {
        return NextResponse.json(
          { error: `Cannot self-update fields: ${disallowedFields.join(', ')}` },
          { status: 403 }
        );
      }

      const user = await ServerEntities.User.update(id, data);
      if (!user) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }
      return NextResponse.json(sanitizeUser(user));
    }

    // Admin-only: updating other users
    if (!hasRole(session.user.role, 'admin')) {
      return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // Check if trying to modify an owner account (only owners can do this)
    const targetUser = await prisma.user.findUnique({
      where: { id },
      select: { role: true, email: true, fullName: true, isActive: true }
    });
    if (targetUser?.role?.toLowerCase() === 'owner' && session.user.role !== 'owner') {
      return NextResponse.json({ error: 'Forbidden: Only owners can modify owner accounts' }, { status: 403 });
    }

    // Prevent non-owners from setting admin or owner roles
    if ((data.role === 'admin' || data.role === 'owner') && session.user.role !== 'owner') {
      return NextResponse.json({ error: 'Forbidden: Only owners can assign admin or owner roles' }, { status: 403 });
    }

    // Validate and hash password if being updated
    if (typeof data.password === 'string') {
      const validation = validatePassword(data.password);
      if (!validation.isValid) {
        return NextResponse.json(
          { error: 'Invalid password', details: validation.errors },
          { status: 400 }
        );
      }

      data.password = await hashPassword(data.password);
    }

    const user = await ServerEntities.User.update(id, data);

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Audit log (non-blocking)
    after(async () => {
      if (session.user.email) {
        // Don't log password changes in values
        const safeOldValues: Record<string, unknown> = {};
        const safeNewValues: Record<string, unknown> = {};
        const changedFields: string[] = [];

        if (data.role !== undefined && data.role !== targetUser?.role?.toLowerCase()) {
          safeOldValues.role = targetUser?.role?.toLowerCase();
          safeNewValues.role = data.role;
          changedFields.push('role');
        }
        if (data.full_name !== undefined) {
          safeOldValues.full_name = targetUser?.fullName;
          safeNewValues.full_name = data.full_name;
          changedFields.push('full_name');
        }
        if (data.is_active !== undefined) {
          safeOldValues.is_active = targetUser?.isActive;
          safeNewValues.is_active = data.is_active;
          changedFields.push('is_active');
        }
        if (data.password) {
          changedFields.push('password');
        }

        await auditUserOperation("update", id, session.user.email, request, {
          details: {
            action: "user_updated",
            updated_user_email: user.email,
            fields_changed: changedFields,
          },
          oldValues: Object.keys(safeOldValues).length > 0 ? safeOldValues : undefined,
          newValues: Object.keys(safeNewValues).length > 0 ? safeNewValues : undefined,
        });
      }
    });

    return NextResponse.json(sanitizeUser(user));
  } catch (error) {
    console.error('Error updating user:', error);
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    // Require admin role to delete users
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!hasRole(session.user.role, 'admin')) {
      return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { id } = await request.json() as { id: string };

    // Check if trying to delete an owner account (only owners can do this)
    const targetUser = await prisma.user.findUnique({
      where: { id },
      select: { role: true, email: true, fullName: true }
    });
    if (targetUser?.role?.toLowerCase() === 'owner' && session.user.role !== 'owner') {
      return NextResponse.json({ error: 'Forbidden: Only owners can delete owner accounts' }, { status: 403 });
    }

    // Prevent self-deletion
    if (id === session.user.id) {
      return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 });
    }

    const success = await ServerEntities.User.delete(id);

    if (!success) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Audit log (non-blocking)
    after(async () => {
      if (session.user.email && targetUser) {
        await auditUserOperation("delete", id, session.user.email, request, {
          details: {
            action: "user_deleted",
            deleted_user_email: targetUser.email,
            deleted_user_name: targetUser.fullName,
          },
          oldValues: {
            email: targetUser.email,
            full_name: targetUser.fullName,
            role: targetUser.role?.toLowerCase(),
          },
        });
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting user:', error);
    return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 });
  }
}
