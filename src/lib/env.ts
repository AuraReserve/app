/**
 * Environment Variable Validation
 * Validates required environment variables at startup using Zod
 */

import { z } from 'zod';

const envSchema = z.object({
  // Node Environment
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Database
  DATABASE_URL: z.string().url().min(1, 'DATABASE_URL is required'),

  // Application URLs
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
  BETTER_AUTH_URL: z.string().url().optional(),

  // Authentication
  BETTER_AUTH_SECRET: z
    .string()
    .min(32, 'BETTER_AUTH_SECRET must be at least 32 characters for security')
    .optional()
    .describe('Generate with: openssl rand -base64 32'),

  // Auth Provider Flags
  AUTH_CREDENTIALS_ENABLED: z
    .string()
    .default('true')
    .transform((val) => val === 'true'),
  AUTH_GOOGLE_ENABLED: z
    .string()
    .default('false')
    .transform((val) => val === 'true'),
  AUTH_AZURE_ENABLED: z
    .string()
    .default('false')
    .transform((val) => val === 'true'),

  // Google OAuth (required if Google auth is enabled)
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),

  // Azure AD (required if Azure auth is enabled)
  AZURE_AD_CLIENT_ID: z.string().optional(),
  AZURE_AD_CLIENT_SECRET: z.string().optional(),
  AZURE_AD_TENANT_ID: z.string().optional(),

  // Avalanche integration
  AVALANCHE_SIGNER_PRIVATE_KEY: z.string().optional(),

  // Cron job authentication
  CRON_SECRET: z.string().min(16, 'CRON_SECRET must be at least 16 characters').optional(),

  // Plugin configuration encryption
  PLUGIN_CONFIG_ENCRYPTION_KEY: z.string().min(32, 'PLUGIN_CONFIG_ENCRYPTION_KEY must be at least 32 characters').optional(),

  // System user for automated operations
  SYSTEM_USER_EMAIL: z.string().email().optional(),

  // Plugin billing/entitlement flags
  SELF_HOSTED: z
    .string()
    .default('false')
    .transform((val) => val === 'true'),
  BILLING_ENABLED: z
    .string()
    .default('false')
    .transform((val) => val === 'true'),
})
  .refine(
    (data) => {
      if (data.NODE_ENV === "production") {
        return !!data.BETTER_AUTH_SECRET;
      }
      return true;
    },
    {
      message: "BETTER_AUTH_SECRET is required when NODE_ENV is production",
      path: ["BETTER_AUTH_SECRET"],
    }
  )
  .refine(
    (data) => {
      // If Google auth is enabled, require Google credentials
      if (data.AUTH_GOOGLE_ENABLED) {
        return !!(data.GOOGLE_CLIENT_ID && data.GOOGLE_CLIENT_SECRET);
      }
      return true;
    },
    {
      message: 'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required when AUTH_GOOGLE_ENABLED is true',
      path: ['GOOGLE_CLIENT_ID'],
    }
  )
  .refine(
    (data) => {
      // If Azure auth is enabled, require Azure credentials
      if (data.AUTH_AZURE_ENABLED) {
        return !!(data.AZURE_AD_CLIENT_ID && data.AZURE_AD_CLIENT_SECRET && data.AZURE_AD_TENANT_ID);
      }
      return true;
    },
    {
      message:
        'AZURE_AD_CLIENT_ID, AZURE_AD_CLIENT_SECRET, and AZURE_AD_TENANT_ID are required when AUTH_AZURE_ENABLED is true',
      path: ['AZURE_AD_CLIENT_ID'],
    }
  );

export type Env = z.infer<typeof envSchema>;

/**
 * Validates environment variables and throws if validation fails
 * Call this at application startup
 */
export function validateEnv(): Env {
  try {
    const parsed = envSchema.parse(process.env);
    return parsed;
  } catch (error) {
    console.error('\n❌ Environment variable validation failed:\n');

    if (error instanceof z.ZodError) {
      const errorMessages = error.issues.map((issue) => {
        const path = issue.path.join('.');
        return `  - ${path}: ${issue.message}`;
      });

      console.error(errorMessages.join('\n'));
    } else {
      console.error(error);
    }

    console.error('\nPlease check your .env file and ensure all required variables are set.');
    console.error('See .env.example for reference.\n');

    throw error;
  }
}

/**
 * Validated and typed environment variables
 * Use this instead of process.env for type safety
 *
 * Note: Validation is performed in instrumentation.ts at startup
 * This export is for use throughout the application
 */
let _env: Env | undefined;

export function getEnv(): Env {
  if (!_env) {
    _env = validateEnv();
  }
  return _env;
}

// For convenience, export a getter that can be used like: env.DATABASE_URL
export const env = new Proxy({} as Env, {
  get(_target, prop) {
    return getEnv()[prop as keyof Env];
  },
});
