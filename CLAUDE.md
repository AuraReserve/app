# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AuraReserve is a Web3 reserve auditing and proof-of-reserve platform built with Next.js 16, React 19, and TypeScript. The application manages audited reserves for physical assets (gold, silver, gemstones, etc.) through a multi-tenant "Spaces" architecture.

## Project Structure

```
aura-reserve/
├── src/                    # Next.js source
│   ├── app/                # App Router pages and API routes
│   ├── components/         # React components (ui/, spaces/, etc.)
│   ├── hooks/              # Custom React hooks
│   ├── lib/                # Utilities, auth, DB, DAL
│   ├── types/              # TypeScript types
│   └── constants/          # Constants
├── prisma/                 # Database schema, migrations, seed
├── tests/                  # Unit and integration tests
├── public/                 # Static assets
├── docs/                   # Documentation
├── package.json
├── tsconfig.json
├── next.config.ts
├── vitest.config.ts
└── postcss.config.mjs
```

## Development Commands

```bash
# Development server
pnpm dev

# Production build
pnpm build

# Run tests
pnpm test

# Type check
pnpm type-check

# Lint
pnpm lint

# Database commands
pnpm db:migrate          # Run migrations
pnpm db:push             # Push schema changes
pnpm db:studio           # Open Prisma Studio
pnpm db:seed             # Seed database
pnpm db:reset            # Reset database (destructive)
pnpm db:generate         # Generate Prisma client

# Clean build artifacts
pnpm clean
```

## Architecture

### Multi-Tenant Spaces System

The application is built around a "Spaces" concept where each Space represents a separate reserve tracking context (e.g., "ACC Gold", "Emeralds Switzerland"). Navigation and features change dynamically based on whether the user is in the global context or a specific Space context.

**Global Navigation:**
- Dashboard, Spaces, Analytics, User Management (admin only)

**Space Navigation:**
- Dashboard, Reserves, Analytics (space-scoped), API, User Management (admin only), Settings

### User Roles & Permissions (Two-Tier System)

The application uses a **two-tier role system**: platform-level roles and space-level roles.

#### Platform Roles (UserRole enum in Prisma)

Defined in `prisma/schema.prisma`:

| Role | DB Value | Description |
|------|----------|-------------|
| `OWNER` | "owner" | Super admin with full platform access, can manage all users including other owners |
| `ADMIN` | "admin" | Platform admin who can create spaces and manage users (except owners) |
| `CREATOR` | "creator" | Can create spaces, no admin privileges. SaaS: self-assigned via opt-in. Self-hosted: admin-assigned. |
| `null` | - | Space-only users with no platform-level permissions |

#### Space Roles (SpaceRole enum in Prisma)

| Role | Description |
|------|-------------|
| `ADMIN` | Can manage space settings, members, and all data operations |
| `AUDITOR` | Can view data and submit/archive proof-of-reserve entries |
| `MEMBER` | Read-only access to space data (default for new members) |

#### Permission Matrices

**Global Permissions by Role:**
| Feature | Owner | Admin | Creator | None |
|---------|-------|-------|---------|------|
| Create Spaces | ✓ | ✓ | ✓ | ✗ |
| Manage Users | ✓ | ✓ | ✗ | ✗ |
| Access Admin Panel | ✓ | ✗ | ✗ | ✗ |
| View Analytics | ✓ | ✓ | ✓ | ✓ |

**Space Permissions by Role:**
| Feature | Admin | Auditor | Member |
|---------|-------|---------|--------|
| View Data | ✓ | ✓ | ✓ |
| Manage Reserves | ✓ | ✓ | ✗ |
| Manage API Keys | ✓ | ✗ | ✗ |
| Manage Settings | ✓ | ✗ | ✗ |
| Manage Members | ✓ | ✗ | ✗ |

#### Key Files for Role System

- **Type definitions**: `src/lib/auth-utils.ts` (lines 12-13), `src/lib/permissions.ts`
- **Permission functions**: `src/lib/permissions.ts` (216 lines)
- **Server-side checking**: `src/lib/auth-utils.ts` (290 lines)
- **Client hooks**: `src/hooks/useCurrentUser.ts`, `src/hooks/useSpacePermissions.ts`
- **Auth configuration**: `src/lib/auth.ts` (Better Auth with custom session plugin)

#### How to Check Roles

**Server-side (API routes):**
```typescript
import { requireAuth, requireRole, requireSpaceAccess, requireSpaceAdmin, getSpaceRole, hasRole, isSpaceAdmin } from "@/lib/auth-utils";

// Basic auth check (throws if not authenticated)
await requireAuth();

// Require specific platform role (throws if insufficient)
await requireRole("owner");    // owner only
await requireRole("admin");    // owner or admin
await requireRole("creator");  // owner, admin, or creator

// Check space access (throws if no access)
await requireSpaceAccess(spaceId);

// Require space admin (throws if not space admin)
await requireSpaceAdmin(spaceId);

// Get user's role in a space (returns role or null)
const role = await getSpaceRole(spaceId);

// Check if user can perform action
const canManage = await canManageReserves(spaceId);  // admin or auditor
const canManageKeys = await canManageApiKeys(spaceId);  // admin only
```

**Client-side (React components):**
```typescript
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useSpacePermissions } from "@/hooks/useSpacePermissions";

// Global permissions
const { user, permissions, status } = useCurrentUser();
if (permissions.canCreateSpaces) { /* show create button */ }

// Space-specific permissions
const { role, permissions, isAdmin, isAuditor, isMember } = useSpacePermissions(spaceId);
if (permissions.canManageReserves) { /* show reserve form */ }
```

#### Common Role Issues & Solutions

1. **Role not recognized**: Roles are normalized to **lowercase** throughout the system. Always compare lowercase:
   ```typescript
   // ✓ Correct
   if (role?.toLowerCase() === "admin") { ... }

   // ✗ Wrong - may fail due to case mismatch
   if (role === "ADMIN") { ... }
   ```

2. **Checking wrong role tier**: Platform roles and space roles are separate:
   ```typescript
   // Platform role check
   const isGlobalAdmin = isAdmin(user.role);  // checks platform role

   // Space role check
   const spaceRole = await getSpaceRole(spaceId);  // checks SpaceUser table
   ```

3. **Global admins have implicit space access**: Platform owners/admins automatically have admin access to ALL spaces without explicit SpaceUser records. This is handled in `hasSpaceAccess()` and `isSpaceAdmin()`.

4. **Session not including role**: The session is enriched via Better Auth custom plugin in `auth.ts` (lines 92-121). Use `getExtendedSession()` for full user data including role and permissions.

### Authentication (Better Auth)

The app uses [Better Auth](https://better-auth.com) for authentication with Prisma adapter.

**Key auth files:**
- `src/lib/auth.ts` - Server-side auth configuration with custom session plugin
- `src/lib/auth-client.ts` - Client-side auth hooks (`useSession`)
- `src/lib/auth-utils.ts` - Utility functions for role/permission checking

**Auth features enabled:**
- Email/password authentication
- Two-factor authentication (TOTP)
- Magic link authentication
- Session management with extended user data

**Extended session data** (added via custom plugin in auth.ts):
```typescript
{
  user: {
    id, email, name, image,
    role,           // Platform role (lowercase)
    permissions,    // GlobalPermissions object
    twoFactorEnabled,
    spaces: [       // User's space memberships
      { id, name, slug, role }
    ]
  }
}
```

### Database (Prisma)

**Schema location:** `prisma/schema.prisma`

**Key commands:**
```bash
# Generate Prisma client after schema changes
pnpm db:generate

# Create migration
pnpm db:migrate

# Reset database (destructive)
pnpm db:reset

# Seed database
pnpm db:seed
```

## Path Aliases

In `tsconfig.json`:
- `@/*` → `./src/*` (local imports)

## Styling

- TailwindCSS v4 with PostCSS
- Uses Geist Sans and Geist Mono fonts from next/font/google
- Custom CSS variables defined in globals.css for theming
- Color scheme: Primary blue (#2563eb), slate grays for UI

## TypeScript Configuration

- Target: ES2017
- Strict mode enabled
- Uses Next.js TypeScript plugin
- Path resolution via bundler mode
