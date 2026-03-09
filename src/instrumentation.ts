/**
 * Next.js Instrumentation Hook
 * Runs once when the server starts up (both dev and production)
 * Perfect for validating environment variables before the app starts
 *
 * NOTE: Temporarily disabled due to edge runtime compatibility issues with Zod/Proxy
 * TODO: Re-enable when edge runtime compatibility is resolved
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { validateEnv } = await import('./lib/env');
    validateEnv();

    // Warn early if the system user required by integration runner is missing
    try {
      const { getSystemUserEmail } = await import('./lib/integrations/runner');
      const { prisma } = await import('./lib/prisma');
      const email = getSystemUserEmail();
      const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
      if (!user) {
        console.warn(
          `[AuraReserve] System user (${email}) not found in the database. ` +
          `Integration runners will fail until this user is created. ` +
          `Set SYSTEM_USER_EMAIL or seed the database.`
        );
      }
    } catch {
      // Database may not be reachable during build — skip gracefully
    }
  }
}
