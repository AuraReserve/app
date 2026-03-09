import { describe, it, expect } from "vitest";
import { generateApiKey, hashApiKey, getKeyPrefix } from "@/lib/api-key-utils";

describe("API Key Utilities", () => {
  describe("generateApiKey", () => {
    it("generates a key with the 'ar_' prefix", () => {
      const key = generateApiKey();
      expect(key.startsWith("ar_")).toBe(true);
    });

    it("generates a key of the correct length (ar_ + 48 hex chars = 51)", () => {
      const key = generateApiKey();
      expect(key.length).toBe(51);
    });

    it("generates unique keys on each call", () => {
      const keys = new Set(Array.from({ length: 10 }, () => generateApiKey()));
      expect(keys.size).toBe(10);
    });

    it("hex portion contains only valid hex characters", () => {
      const key = generateApiKey();
      const hexPart = key.slice(3); // remove "ar_"
      expect(hexPart).toMatch(/^[0-9a-f]{48}$/);
    });
  });

  describe("hashApiKey", () => {
    it("returns a 64-character hex string (SHA-256)", () => {
      const hash = hashApiKey("ar_abc123");
      expect(hash.length).toBe(64);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it("is deterministic (same input produces same hash)", () => {
      const key = "ar_abcdef1234567890abcdef1234567890abcdef12345678";
      const hash1 = hashApiKey(key);
      const hash2 = hashApiKey(key);
      expect(hash1).toBe(hash2);
    });

    it("produces different hashes for different keys", () => {
      const hash1 = hashApiKey("ar_key1");
      const hash2 = hashApiKey("ar_key2");
      expect(hash1).not.toBe(hash2);
    });

    it("round-trips: hash of generated key can be verified", () => {
      const key = generateApiKey();
      const hash = hashApiKey(key);
      expect(hashApiKey(key)).toBe(hash);
    });
  });

  describe("getKeyPrefix", () => {
    it("returns the type prefix + first 8 chars of the random part", () => {
      const key = "ar_abcdef1234567890abcdef1234567890abcdef12345678";
      const prefix = getKeyPrefix(key);
      expect(prefix).toBe("ar_abcdef12");
      expect(prefix.length).toBe(11); // "ar_" (3) + 8 hex chars
    });

    it("works with generated keys", () => {
      const key = generateApiKey();
      const prefix = getKeyPrefix(key);
      expect(key.startsWith(prefix)).toBe(true);
      expect(prefix.length).toBe(11);
    });
  });
});
