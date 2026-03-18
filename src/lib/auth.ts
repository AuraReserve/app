/**
 * Better Auth Configuration
 * Handles authentication with credentials, Google OAuth, Microsoft OAuth, and 2FA
 */

import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { customSession, twoFactor } from "better-auth/plugins";
import { prisma, prismaBase } from "@/lib/prisma";
import { getGlobalPermissions, type GlobalPermissions } from "@/lib/permissions";
import { getAuthBaseUrl, requireAuthSecret } from "@/lib/auth-env";
import { getRegistrationSettings } from "@/lib/settings";

const authBaseUrl = getAuthBaseUrl();

// Extended user type with custom fields
export interface ExtendedUser {
  id: string;
  email: string;
  name: string;
  image?: string | null;
  role: string;
  permissions: GlobalPermissions;
  twoFactorEnabled: boolean;
  emailVerified: boolean;
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

export const auth = betterAuth({
  // Better Auth should always receive a secret; in development/test we provide a safe fallback.
  secret: requireAuthSecret(),
  baseURL: authBaseUrl,
  trustedOrigins: [authBaseUrl.replace(/\/+$/, "")],
  database: prismaAdapter(prismaBase, {
    provider: "postgresql",
  }),
  user: {
    additionalFields: {
      role: {
        type: "string",
        required: false,
        defaultValue: null,
        input: false, // Don't allow setting via API
      },
    },
  },
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    requireEmailVerification: false, // Dynamic enforcement via requireAuth() + settings
    minPasswordLength: 8,
    maxPasswordLength: 128,
    password: {
      // Override Better Auth's default hashing to enforce password strength
      // requirements and use consistent bcrypt hashing across the app.
      hash: async (password: string) => {
        const { validatePassword, hashPassword } = await import("@/lib/password");
        const validation = validatePassword(password);
        if (!validation.isValid) {
          throw new Error(validation.errors[0]);
        }
        return hashPassword(password);
      },
      verify: async ({ password, hash }: { password: string; hash: string }) => {
        const { verifyPassword } = await import("@/lib/password");
        return verifyPassword(password, hash);
      },
    },
  },
  socialProviders: {
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          },
        }
      : {}),
    ...(process.env.AZURE_AD_CLIENT_ID && process.env.AZURE_AD_CLIENT_SECRET
      ? {
          microsoft: {
            clientId: process.env.AZURE_AD_CLIENT_ID,
            clientSecret: process.env.AZURE_AD_CLIENT_SECRET,
            tenantId: process.env.AZURE_AD_TENANT_ID || "common",
          },
        }
      : {}),
  },
  session: {
    expiresIn: 30 * 24 * 60 * 60, // 30 days in seconds
    updateAge: 24 * 60 * 60, // Update session every 24 hours
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // 5 minutes
    },
  },
  plugins: [
    twoFactor({
      issuer: "AuraReserve",
      totpOptions: {
        digits: 6,
        period: 30,
      },
      backupCodeOptions: {
        length: 10,
        count: 10,
      },
    }),
    customSession(async ({ user, session }) => {
      // Fetch additional user data including role and spaces
      const dbUser = await prisma.user.findUnique({
        where: { id: user.id },
        include: {
          spaceMembers: {
            include: {
              space: true,
            },
          },
        },
      });

      const normalizedRole = dbUser?.role ? dbUser.role.toLowerCase() : "";

      return {
        user: {
          ...user,
          role: normalizedRole,
          permissions: getGlobalPermissions(normalizedRole || null),
          twoFactorEnabled: dbUser?.twoFactorEnabled ?? false,
          emailVerified: !!dbUser?.emailVerified,
          spaces: dbUser?.spaceMembers.map((sm) => ({
            spaceId: sm.spaceId,
            role: sm.role.toLowerCase(),
            spaceName: sm.space.name,
          })) || [],
        },
        session,
      };
    }),
  ],
  databaseHooks: {
    user: {
      create: {
        before: async (user, _context) => {
          // Enforce allow_self_registration setting
          // Admin-created users go through /api/entities/users (Prisma direct), not Better Auth
          const settings = await getRegistrationSettings();
          if (!settings.signupEnabled || !settings.allowSelfRegistration) {
            throw new Error("Registration is currently disabled");
          }
          return { data: user };
        },
        after: async (user) => {
          // Send verification email if required by settings
          const settings = await getRegistrationSettings();
          if (settings.requireEmailVerification && user.email) {
            try {
              const { sendUserVerificationEmail } = await import("@/lib/auth-helpers");
              await sendUserVerificationEmail(user.email);
            } catch (error) {
              console.error("Failed to send verification email:", error);
            }
          }
        },
      },
    },
    session: {
      create: {
        after: async (session) => {
          // Update last login time when session is created
          try {
            const loggedInUser = await prisma.user.update({
              where: { id: session.userId },
              data: { lastLogin: new Date() },
            });

            // Create audit log for login event
            if (loggedInUser.email) {
              const { auditAuthEvent } = await import("@/lib/dal");
              await auditAuthEvent("login", session.userId, loggedInUser.email, {
                details: { sessionId: session.id },
              });
            }
          } catch (error) {
            console.error("Failed to update last login:", error);
          }
        },
      },
    },
  },
});

/**
 * Get session with extended user data (spaces, permissions, etc.)
 */
export async function getExtendedSession(headers: Headers): Promise<ExtendedSession | null> {
  const session = await auth.api.getSession({ headers });

  if (!session?.user) {
    return null;
  }

  // Fetch additional user data from database
  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: {
      spaceMembers: {
        include: {
          space: true,
        },
      },
    },
  });

  if (!dbUser) {
    return null;
  }

  const normalizedRole = dbUser.role ? dbUser.role.toLowerCase() : "";

  return {
    user: {
      id: dbUser.id,
      email: dbUser.email,
      name: dbUser.name || dbUser.fullName || "",
      image: dbUser.image || session.user.image,
      role: normalizedRole,
      permissions: getGlobalPermissions(normalizedRole || null),
      twoFactorEnabled: dbUser.twoFactorEnabled,
      emailVerified: !!dbUser.emailVerified,
      spaces: dbUser.spaceMembers.map((sm) => ({
        spaceId: sm.spaceId,
        role: sm.role.toLowerCase(),
        spaceName: sm.space.name,
      })),
    },
    session: {
      id: session.session.id,
      userId: session.session.userId,
      expiresAt: session.session.expiresAt,
    },
  };
}

export type Auth = typeof auth;
