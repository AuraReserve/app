const DEV_AUTH_SECRET_FALLBACK = "development-only-better-auth-secret-minimum-length-32";

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

export function getAuthSecret(): string | undefined {
  const secret = process.env.BETTER_AUTH_SECRET?.trim();
  if (secret) return secret;

  if (!isProduction()) {
    return DEV_AUTH_SECRET_FALLBACK;
  }

  return undefined;
}

export function requireAuthSecret(): string {
  const secret = getAuthSecret();
  if (!secret) {
    throw new Error("BETTER_AUTH_SECRET must be set in production");
  }
  return secret;
}

export function getAuthBaseUrl(): string {
  return (
    process.env.BETTER_AUTH_URL?.trim() ||
    process.env.NEXT_PUBLIC_BETTER_AUTH_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    "http://localhost:3000"
  );
}
