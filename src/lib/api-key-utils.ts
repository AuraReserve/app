/**
 * API Key Generation and Hashing Utilities
 *
 * Keys are generated server-side with crypto-secure randomness,
 * hashed with SHA-256 before storage, and the plaintext is returned
 * to the user exactly once at creation time.
 */

import crypto from "crypto";

const KEY_PREFIX = "ar_";
const KEY_RANDOM_BYTES = 24; // 48 hex chars → 192 bits of entropy

/**
 * Generate a new API key with crypto-secure randomness.
 * Format: ar_<48 hex chars> (51 chars total)
 */
export function generateApiKey(): string {
  const randomPart = crypto.randomBytes(KEY_RANDOM_BYTES).toString("hex");
  return `${KEY_PREFIX}${randomPart}`;
}

/**
 * Hash an API key using SHA-256.
 * Deterministic — same input always produces the same hash,
 * so we can look up keys by hashing the incoming value.
 */
export function hashApiKey(plaintext: string): string {
  return crypto.createHash("sha256").update(plaintext).digest("hex");
}

/**
 * Extract a display prefix from a plaintext API key.
 * Shows the type prefix + first 8 hex chars for identification.
 * e.g. "ar_abc123de" from "ar_abc123def456789..."
 */
export function getKeyPrefix(plaintext: string): string {
  return plaintext.substring(0, KEY_PREFIX.length + 8);
}
