"use client";

import { useSession } from "@/lib/auth-client";
import { useMemo } from "react";
import { getGlobalPermissions, type GlobalPermissions } from "@/lib/permissions";

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  image?: string | null;
  role: string;
  permissions: GlobalPermissions;
  spaces: Array<{
    spaceId: string;
    role: string;
    spaceName: string;
  }>;
}

export interface CurrentUserState {
  user: CurrentUser | null;
  permissions: GlobalPermissions;
  status: "loading" | "authenticated" | "unauthenticated";
}

/**
 * Provides the authenticated user and precomputed global permissions.
 * Falls back to an all-false permission set while the session loads.
 */
export function useCurrentUser(): CurrentUserState {
  const { data, isPending } = useSession();

  // Extract user data from session
  const userData = data?.user as CurrentUser | undefined;

  // Convert isPending to status for backwards compatibility
  const status = useMemo(() => {
    if (isPending) return "loading" as const;
    if (userData) return "authenticated" as const;
    return "unauthenticated" as const;
  }, [isPending, userData]);

  const permissions = useMemo(() => {
    if (userData?.permissions) {
      return userData.permissions;
    }
    return getGlobalPermissions(userData?.role ?? null);
  }, [userData?.permissions, userData?.role]);

  return {
    user: userData ?? null,
    permissions,
    status,
  };
}
