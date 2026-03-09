import fs from "fs";
import path from "path";

const FALLBACK_SECRET = "development-secret-string-with-minimum-length-32";

let cachedSecret: string | null = null;

const ENV_FILES = [".env.test", ".env.local", ".env"];

function tryReadSecretFromFile(filePath: string): string | null {
  try {
    const fileContents = fs.readFileSync(filePath, "utf8");
    for (const rawLine of fileContents.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const [key, ...rest] = line.split("=");
      if (key !== "BETTER_AUTH_SECRET" || rest.length === 0) continue;
      const value = rest.join("=").trim();
      if (!value) continue;
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        return value.slice(1, -1);
      }
      return value;
    }
  } catch {
    // File not found or unreadable; ignore and continue checking other sources.
  }
  return null;
}

export function getBetterAuthSecret(): string {
  if (cachedSecret) {
    return cachedSecret;
  }

  const fromEnv = process.env.BETTER_AUTH_SECRET?.trim();
  if (fromEnv) {
    cachedSecret = fromEnv;
    return cachedSecret;
  }

  const projectRoot = process.cwd();
  for (const fileName of ENV_FILES) {
    const candidate = tryReadSecretFromFile(path.join(projectRoot, fileName));
    if (candidate) {
      cachedSecret = candidate;
      return cachedSecret;
    }
  }

  cachedSecret = FALLBACK_SECRET;
  return cachedSecret;
}
