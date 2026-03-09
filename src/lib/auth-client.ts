/**
 * Better Auth Client Configuration
 * Client-side authentication utilities for React components
 */

import { createAuthClient } from "better-auth/react";
import { customSessionClient, twoFactorClient } from "better-auth/client/plugins";
import type { auth } from "@/lib/auth";
import type { GlobalPermissions } from "@/lib/permissions";

// Extended user type with our custom fields
export interface ExtendedUser {
  id: string;
  email: string;
  name: string;
  image?: string | null;
  role: string;
  permissions: GlobalPermissions;
  twoFactorEnabled: boolean;
  spaces: Array<{
    spaceId: string;
    role: string;
    spaceName: string;
  }>;
}

export interface ExtendedSession {
  user: ExtendedUser;
  session: {
    id: string;
    userId: string;
    expiresAt: Date;
  };
}

const authClient = createAuthClient({
  baseURL: typeof window !== "undefined" ? window.location.origin : (process.env.NEXT_PUBLIC_BETTER_AUTH_URL || "http://localhost:3000"),
  plugins: [
    twoFactorClient(),
    customSessionClient<typeof auth>(),
  ],
});

export const {
  signIn,
  signOut,
  signUp,
  twoFactor,
} = authClient;

// Re-export getSession from the client
export const getSession = authClient.getSession;

/**
 * Force the reactive useSession() store to refetch session data from the server.
 * Use this after operations that change server-side session data (e.g. space creation)
 * so that all components subscribing to useSession() get updated.
 */
export function refreshSession() {
  authClient.$store.notify("$sessionSignal");
}

// Custom typed useSession hook
export function useSession() {
  const session = authClient.useSession();
  return {
    data: session.data as ExtendedSession | null,
    isPending: session.isPending,
    error: session.error,
  };
}
