import { getGlobalPermissions } from "@/lib/permissions";
import type { ExtendedUser } from "@/lib/auth-client";

type SessionStatus = "loading" | "authenticated" | "unauthenticated";

export interface MockCurrentUserState {
  user: ExtendedUser | null;
  permissions: ReturnType<typeof getGlobalPermissions>;
  status: SessionStatus;
}

interface SetMockCurrentUserInput {
  user?: Partial<ExtendedUser> | null;
  permissions?: ReturnType<typeof getGlobalPermissions>;
  status?: SessionStatus;
}

const defaultUser: ExtendedUser = {
  id: "test-user",
  role: "owner",
  email: "owner@example.com",
  name: "Test Owner",
  image: null,
  permissions: getGlobalPermissions("owner"),
  spaces: [],
  twoFactorEnabled: false,
};

export const mockCurrentUserState: MockCurrentUserState = {
  user: defaultUser,
  permissions: getGlobalPermissions("owner"),
  status: "authenticated",
};

export function setMockCurrentUser({
  user,
  permissions,
  status,
}: SetMockCurrentUserInput) {
  if (user !== undefined) {
    const role = user?.role ?? null;
    const resolvedPermissions = permissions ?? getGlobalPermissions(role);
    mockCurrentUserState.user = user
      ? {
          ...defaultUser,
          ...user,
          role: user.role ?? defaultUser.role,
          spaces: user.spaces ?? defaultUser.spaces,
          twoFactorEnabled: user.twoFactorEnabled ?? defaultUser.twoFactorEnabled,
          image: user.image ?? defaultUser.image,
          permissions: resolvedPermissions,
        }
      : null;
    mockCurrentUserState.permissions = resolvedPermissions;
  }

  if (permissions && user === undefined) {
    mockCurrentUserState.permissions = permissions;
    if (mockCurrentUserState.user) {
      mockCurrentUserState.user = {
        ...mockCurrentUserState.user,
        permissions,
      };
    }
  }

  if (status) {
    mockCurrentUserState.status = status;
  }
}

export function resetMockCurrentUser() {
  mockCurrentUserState.user = {
    ...defaultUser,
    permissions: getGlobalPermissions("owner"),
  };
  mockCurrentUserState.permissions = getGlobalPermissions("owner");
  mockCurrentUserState.status = "authenticated";
}
