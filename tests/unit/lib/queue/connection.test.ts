import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("ioredis", () => {
  const Redis = vi.fn();
  return { default: Redis, Redis };
});

describe("getRedisConnection", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.REDIS_URL;
  });

  it("creates connection with REDIS_URL", async () => {
    process.env.REDIS_URL = "redis://myhost:6380";
    const { getRedisConnection } = await import("@/lib/queue/connection");
    const conn = getRedisConnection();
    expect(conn).toBeDefined();
  });

  it("uses default redis://localhost:6379 when REDIS_URL not set", async () => {
    const { getRedisConnection } = await import("@/lib/queue/connection");
    const conn = getRedisConnection();
    expect(conn).toBeDefined();
  });

  it("returns same instance on repeated calls (singleton)", async () => {
    process.env.REDIS_URL = "redis://localhost:6379";
    const { getRedisConnection } = await import("@/lib/queue/connection");
    const a = getRedisConnection();
    const b = getRedisConnection();
    expect(a).toBe(b);
  });
});
