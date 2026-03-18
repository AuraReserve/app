# BullMQ Job Queue Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace inline integration execution with BullMQ-powered job queue for reliable cron scheduling, retries, notifications, and horizontal scaling.

**Architecture:** Single BullMQ queue (`integrations`) with typed jobs. Workers run as separate Docker containers importing business logic directly. Blockchain signing delegated to a JSON-RPC signer service. Notification channels fan out via a pluggable registry.

**Tech Stack:** BullMQ, ioredis, Redis 7, Next.js 16, Prisma 7, viem, Docker Compose

**Spec:** `docs/superpowers/specs/2026-03-18-bullmq-job-queue-design.md`

---

## Chunk 1: Foundation — Dependencies, Schema, Queue Core

### Task 1: Install Dependencies and Add Env Vars

**Files:**
- Modify: `package.json`
- Modify: `src/lib/env.ts`
- Modify: `.env.example`

- [ ] **Step 1: Install BullMQ and ioredis**

```bash
pnpm add bullmq ioredis
```

- [ ] **Step 2: Add REDIS_URL and SIGNER env vars to env schema**

In `src/lib/env.ts`, add to the `envSchema` object after the `SYSTEM_USER_EMAIL` field:

```typescript
// Redis (required for job queue)
REDIS_URL: z.string().url().optional(),

// Signer service
SIGNER_SERVICE_URL: z.string().url().optional(),
SIGNER_SERVICE_TOKEN: z.string().min(16, 'SIGNER_SERVICE_TOKEN must be at least 16 characters').optional(),
```

- [ ] **Step 3: Update .env.example**

Add after the `SYSTEM_USER_EMAIL` section:

```env
# -----------------------------------------------------------------------------
# Job Queue (Redis)
# -----------------------------------------------------------------------------
# Required for cron scheduling, retries, and background job processing
# REDIS_URL="redis://localhost:6379"

# -----------------------------------------------------------------------------
# Signer Service
# -----------------------------------------------------------------------------
# JSON-RPC signing service for blockchain transactions
# Defaults to embedded signer at /api/internal/signer/sign
# SIGNER_SERVICE_URL="http://localhost:3000/api/internal/signer/sign"
# SIGNER_SERVICE_TOKEN="your-signer-token-at-least-16-chars"
```

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml src/lib/env.ts .env.example
git commit -m "feat: add bullmq, ioredis deps and queue env vars"
```

---

### Task 2: Prisma Schema Changes

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add retry fields to SpaceIntegration**

After the `metadata` field (line 462) in the `SpaceIntegration` model, add:

```prisma
maxAttempts      Int             @default(3) @map("max_attempts")
retryBackoff     Int             @default(30) @map("retry_backoff")
```

- [ ] **Step 2: Add Notification model**

After the `IntegrationRunLog` model, add:

```prisma
model Notification {
  id              String   @id @default(cuid())
  spaceId         String   @map("space_id")
  type            String
  title           String
  message         String
  metadata        Json     @default("{}")
  read            Boolean  @default(false)
  createdDate     DateTime @default(now()) @map("created_date")

  space           Space    @relation(fields: [spaceId], references: [id], onDelete: Cascade)

  @@index([spaceId, read])
  @@map("notifications")
}
```

- [ ] **Step 3: Add NotificationChannel model**

```prisma
model NotificationChannel {
  id        String   @id @default(cuid())
  spaceId   String   @map("space_id")
  name      String
  type      String
  config    Json     @default("{}")
  enabled   Boolean  @default(true)

  space     Space    @relation(fields: [spaceId], references: [id], onDelete: Cascade)

  @@index([spaceId])
  @@map("notification_channels")
}
```

- [ ] **Step 4: Add reverse relations to Space model**

In the `Space` model (line 195 area), add after `integrationEntitlements`:

```prisma
notifications          Notification[]
notificationChannels   NotificationChannel[]
```

- [ ] **Step 5: Run migration**

```bash
pnpm db:migrate
```

Enter migration name: `add_job_queue_fields_and_notification_models`

- [ ] **Step 6: Verify schema**

```bash
pnpm db:generate
pnpm type-check
```

- [ ] **Step 7: Commit**

```bash
git add prisma/
git commit -m "feat: add retry fields, Notification, NotificationChannel models"
```

---

### Task 3: Redis Connection

**Files:**
- Create: `src/lib/queue/connection.ts`
- Test: `tests/unit/lib/queue/connection.test.ts`

- [ ] **Step 1: Write test for Redis connection factory**

```typescript
// tests/unit/lib/queue/connection.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run tests/unit/lib/queue/connection.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Implement Redis connection**

```typescript
// src/lib/queue/connection.ts
import Redis from "ioredis";

let connection: Redis | null = null;

export function getRedisConnection(): Redis {
  if (!connection) {
    const url = process.env.REDIS_URL || "redis://localhost:6379";
    connection = new Redis(url, {
      maxRetriesPerRequest: null, // required by BullMQ
    });
  }
  return connection;
}

export async function closeRedisConnection(): Promise<void> {
  if (connection) {
    await connection.quit();
    connection = null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm vitest run tests/unit/lib/queue/connection.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/queue/connection.ts tests/unit/lib/queue/connection.test.ts
git commit -m "feat: add Redis connection singleton for BullMQ"
```

---

### Task 4: Queue Definitions and Job Types

**Files:**
- Create: `src/lib/queue/queues.ts`
- Create: `src/lib/queue/jobs.ts`
- Test: `tests/unit/lib/queue/jobs.test.ts`

- [ ] **Step 1: Create queue definitions**

```typescript
// src/lib/queue/queues.ts
import { Queue } from "bullmq";
import { getRedisConnection } from "./connection";

let integrationQueue: Queue | null = null;

export function getIntegrationQueue(): Queue {
  if (!integrationQueue) {
    integrationQueue = new Queue("integrations", {
      connection: getRedisConnection(),
      defaultJobOptions: {
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 5000 },
      },
    });
  }
  return integrationQueue;
}
```

- [ ] **Step 2: Write test for job enqueue helpers**

```typescript
// tests/unit/lib/queue/jobs.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the queue
const mockAdd = vi.fn().mockResolvedValue({ id: "job-123" });
vi.mock("@/lib/queue/queues", () => ({
  getIntegrationQueue: () => ({ add: mockAdd }),
}));

describe("job enqueue helpers", () => {
  beforeEach(() => {
    mockAdd.mockClear();
  });

  it("enqueueIntegrationRun adds integration.run job", async () => {
    const { enqueueIntegrationRun } = await import("@/lib/queue/jobs");
    const result = await enqueueIntegrationRun("si-123", "manual");
    expect(mockAdd).toHaveBeenCalledWith(
      "integration.run",
      { spaceIntegrationId: "si-123", trigger: "manual" },
      expect.any(Object)
    );
    expect(result).toEqual({ id: "job-123" });
  });

  it("enqueueIntegrationRun passes retry options from params", async () => {
    const { enqueueIntegrationRun } = await import("@/lib/queue/jobs");
    await enqueueIntegrationRun("si-123", "cron", undefined, {
      maxAttempts: 5,
      retryBackoff: 60,
    });
    expect(mockAdd).toHaveBeenCalledWith(
      "integration.run",
      expect.any(Object),
      expect.objectContaining({
        attempts: 5,
        backoff: { type: "exponential", delay: 60000 },
      })
    );
  });

  it("enqueueNotify adds integration.notify job", async () => {
    const { enqueueNotify } = await import("@/lib/queue/jobs");
    await enqueueNotify({
      spaceIntegrationId: "si-123",
      error: "RPC timeout",
      failedAt: "2026-03-18T00:00:00Z",
      attemptsMade: 3,
    });
    expect(mockAdd).toHaveBeenCalledWith(
      "integration.notify",
      expect.objectContaining({ spaceIntegrationId: "si-123" }),
      expect.any(Object)
    );
  });

  it("enqueueDeliver adds notification.deliver job", async () => {
    const { enqueueDeliver } = await import("@/lib/queue/jobs");
    await enqueueDeliver({
      notificationId: "n-1",
      channelId: "ch-1",
      channelType: "webhook",
      payload: {
        event: "integration.failed",
        space: { id: "s1", name: "Test" },
        integration: { id: "i1", key: "webhook", name: "Webhook" },
        error: "fail",
        attemptsMade: 3,
        failedAt: "2026-03-18T00:00:00Z",
      },
    });
    expect(mockAdd).toHaveBeenCalledWith(
      "notification.deliver",
      expect.objectContaining({ channelType: "webhook" }),
      expect.any(Object)
    );
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
pnpm vitest run tests/unit/lib/queue/jobs.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 4: Implement job types and enqueue helpers**

```typescript
// src/lib/queue/jobs.ts
import type { RunOptions } from "@/lib/integrations/runner";
import { getIntegrationQueue } from "./queues";

// ---------------------------------------------------------------------------
// Job data interfaces
// ---------------------------------------------------------------------------

export interface IntegrationRunJobData {
  spaceIntegrationId: string;
  trigger: "cron" | "manual" | "on_change";
  options?: RunOptions;
}

export interface NotifyJobData {
  spaceIntegrationId: string;
  error: string;
  failedAt: string;
  attemptsMade: number;
}

export interface DeliverJobData {
  notificationId: string;
  channelId: string;
  channelType: string;
  payload: {
    event: string;
    space: { id: string; name: string };
    integration: { id: string; key: string; name: string };
    error: string;
    attemptsMade: number;
    failedAt: string;
  };
}

// ---------------------------------------------------------------------------
// Retry config passed from SpaceIntegration fields
// ---------------------------------------------------------------------------

export interface RetryConfig {
  maxAttempts: number;
  retryBackoff: number; // seconds
}

const DEFAULT_RETRY: RetryConfig = { maxAttempts: 3, retryBackoff: 30 };

// ---------------------------------------------------------------------------
// Enqueue helpers
// ---------------------------------------------------------------------------

export async function enqueueIntegrationRun(
  spaceIntegrationId: string,
  trigger: IntegrationRunJobData["trigger"],
  options?: RunOptions,
  retry?: Partial<RetryConfig>
) {
  const queue = getIntegrationQueue();
  const { maxAttempts, retryBackoff } = { ...DEFAULT_RETRY, ...retry };

  return queue.add(
    "integration.run",
    { spaceIntegrationId, trigger, options } satisfies IntegrationRunJobData,
    {
      attempts: maxAttempts,
      backoff: { type: "exponential" as const, delay: retryBackoff * 1000 },
    }
  );
}

export async function enqueueNotify(data: NotifyJobData) {
  const queue = getIntegrationQueue();
  return queue.add("integration.notify", data, {
    attempts: 3,
    backoff: { type: "fixed" as const, delay: 30_000 },
  });
}

export async function enqueueDeliver(data: DeliverJobData) {
  const queue = getIntegrationQueue();
  return queue.add("notification.deliver", data, {
    attempts: 3,
    backoff: { type: "fixed" as const, delay: 30_000 },
  });
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
pnpm vitest run tests/unit/lib/queue/jobs.test.ts
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/queue/queues.ts src/lib/queue/jobs.ts tests/unit/lib/queue/jobs.test.ts
git commit -m "feat: add BullMQ queue definitions and job enqueue helpers"
```

---

### Task 5: Repeatable Job Sync

**Files:**
- Create: `src/lib/queue/sync.ts`
- Test: `tests/unit/lib/queue/sync.test.ts`

- [ ] **Step 1: Write test for sync functions**

```typescript
// tests/unit/lib/queue/sync.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockUpsertJobScheduler = vi.fn().mockResolvedValue(undefined);
const mockRemoveJobScheduler = vi.fn().mockResolvedValue(true);
const mockGetJobSchedulers = vi.fn().mockResolvedValue([]);
const mockQueue = {
  upsertJobScheduler: mockUpsertJobScheduler,
  removeJobScheduler: mockRemoveJobScheduler,
  getJobSchedulers: mockGetJobSchedulers,
};

vi.mock("@/lib/queue/queues", () => ({
  getIntegrationQueue: () => mockQueue,
}));

const mockFindUnique = vi.fn();
const mockFindMany = vi.fn().mockResolvedValue([]);
vi.mock("@/lib/prisma", () => ({
  prisma: {
    spaceIntegration: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
  },
}));

describe("sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("syncRepeatableJob upserts when integration has CRON trigger and ACTIVE status", async () => {
    mockFindUnique.mockResolvedValue({
      id: "si-1",
      trigger: "CRON",
      status: "ACTIVE",
      schedule: "*/5 * * * *",
      maxAttempts: 3,
      retryBackoff: 30,
    });

    const { syncRepeatableJob } = await import("@/lib/queue/sync");
    await syncRepeatableJob("si-1");

    expect(mockUpsertJobScheduler).toHaveBeenCalledWith(
      "si-1",
      { pattern: "*/5 * * * *" },
      "integration.run",
      expect.objectContaining({ spaceIntegrationId: "si-1", trigger: "cron" }),
      expect.any(Object)
    );
  });

  it("syncRepeatableJob removes when integration is not CRON", async () => {
    mockFindUnique.mockResolvedValue({
      id: "si-1",
      trigger: "MANUAL",
      status: "ACTIVE",
      schedule: null,
    });

    const { syncRepeatableJob } = await import("@/lib/queue/sync");
    await syncRepeatableJob("si-1");

    expect(mockRemoveJobScheduler).toHaveBeenCalledWith("si-1");
    expect(mockUpsertJobScheduler).not.toHaveBeenCalled();
  });

  it("removeRepeatableJob calls removeJobScheduler", async () => {
    const { removeRepeatableJob } = await import("@/lib/queue/sync");
    await removeRepeatableJob("si-1");

    expect(mockRemoveJobScheduler).toHaveBeenCalledWith("si-1");
  });

  it("syncAllRepeatables removes orphans and upserts from DB", async () => {
    mockGetJobSchedulers.mockResolvedValue([
      { key: "si-orphan" },
      { key: "si-existing" },
    ]);
    mockFindMany.mockResolvedValue([
      { id: "si-existing", schedule: "0 * * * *", maxAttempts: 3, retryBackoff: 30 },
      { id: "si-new", schedule: "0 9 * * 1-5", maxAttempts: 5, retryBackoff: 60 },
    ]);

    const { syncAllRepeatables } = await import("@/lib/queue/sync");
    await syncAllRepeatables();

    // Orphan removed
    expect(mockRemoveJobScheduler).toHaveBeenCalledWith("si-orphan");
    // Existing + new upserted
    expect(mockUpsertJobScheduler).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run tests/unit/lib/queue/sync.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Implement sync functions**

> **Note:** The `upsertJobScheduler` API used below is from BullMQ v5+. Verify the installed version matches. The signature is `queue.upsertJobScheduler(key, repeat, jobName, data, opts)`. If using an older BullMQ version, the API may differ — check [BullMQ docs](https://docs.bullmq.io/).

```typescript
// src/lib/queue/sync.ts
import { prisma } from "@/lib/prisma";
import { getIntegrationQueue } from "./queues";
import type { IntegrationRunJobData } from "./jobs";
import type { IntegrationStatus, IntegrationTrigger } from "@prisma/client";

// Prisma 7 enum workaround
const STATUS_ACTIVE = "ACTIVE" as unknown as IntegrationStatus;
const TRIGGER_CRON = "CRON" as unknown as IntegrationTrigger;

/**
 * Sync a single integration's repeatable job in BullMQ.
 * Upserts if trigger=CRON + status=ACTIVE + schedule present.
 * Removes otherwise.
 */
export async function syncRepeatableJob(
  spaceIntegrationId: string
): Promise<void> {
  const si = await prisma.spaceIntegration.findUnique({
    where: { id: spaceIntegrationId },
    select: {
      id: true,
      trigger: true,
      status: true,
      schedule: true,
      maxAttempts: true,
      retryBackoff: true,
    },
  });

  if (!si) {
    await removeRepeatableJob(spaceIntegrationId);
    return;
  }

  const shouldSchedule =
    si.trigger === TRIGGER_CRON &&
    si.status === STATUS_ACTIVE &&
    si.schedule;

  if (!shouldSchedule) {
    await removeRepeatableJob(spaceIntegrationId);
    return;
  }

  const queue = getIntegrationQueue();
  await queue.upsertJobScheduler(
    si.id,
    { pattern: si.schedule! },
    "integration.run",
    {
      spaceIntegrationId: si.id,
      trigger: "cron",
    } satisfies IntegrationRunJobData,
    {
      attempts: si.maxAttempts,
      backoff: {
        type: "exponential" as const,
        delay: si.retryBackoff * 1000,
      },
    }
  );
}

/**
 * Remove a repeatable job from BullMQ by spaceIntegrationId.
 */
export async function removeRepeatableJob(
  spaceIntegrationId: string
): Promise<void> {
  const queue = getIntegrationQueue();
  await queue.removeJobScheduler(spaceIntegrationId);
}

/**
 * Full reconciliation: sync all active CRON integrations from DB to BullMQ.
 * Removes orphaned repeatables. Called on worker startup.
 */
export async function syncAllRepeatables(): Promise<void> {
  const queue = getIntegrationQueue();

  // 1. Get all existing BullMQ job schedulers
  const schedulers = await queue.getJobSchedulers();
  const existingKeys = new Set(schedulers.map((s) => s.key));

  // 2. Get all active CRON integrations from DB
  const dbIntegrations = await prisma.spaceIntegration.findMany({
    where: {
      trigger: TRIGGER_CRON,
      status: STATUS_ACTIVE,
      schedule: { not: null },
    },
    select: {
      id: true,
      schedule: true,
      maxAttempts: true,
      retryBackoff: true,
    },
  });
  const dbIds = new Set(dbIntegrations.map((si) => si.id));

  // 3. Remove orphans (in BullMQ but not in DB)
  for (const key of existingKeys) {
    if (!dbIds.has(key)) {
      await queue.removeJobScheduler(key);
    }
  }

  // 4. Upsert all DB integrations
  for (const si of dbIntegrations) {
    await queue.upsertJobScheduler(
      si.id,
      { pattern: si.schedule! },
      "integration.run",
      {
        spaceIntegrationId: si.id,
        trigger: "cron",
      } satisfies IntegrationRunJobData,
      {
        attempts: si.maxAttempts,
        backoff: {
          type: "exponential" as const,
          delay: si.retryBackoff * 1000,
        },
      }
    );
  }

  console.log(
    `[Queue] Synced ${dbIntegrations.length} repeatable jobs, removed ${existingKeys.size - dbIds.size < 0 ? 0 : [...existingKeys].filter((k) => !dbIds.has(k)).length} orphans`
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm vitest run tests/unit/lib/queue/sync.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/queue/sync.ts tests/unit/lib/queue/sync.test.ts
git commit -m "feat: add BullMQ repeatable job sync with DB reconciliation"
```

---

## Chunk 2: Workers and Entrypoint

### Task 6: Integration Worker

**Files:**
- Create: `src/lib/queue/workers/integration.worker.ts`
- Test: `tests/unit/lib/queue/workers/integration.worker.test.ts`

- [ ] **Step 1: Write test for integration worker processor**

```typescript
// tests/unit/lib/queue/workers/integration.worker.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRunSpaceIntegration = vi.fn();
vi.mock("@/lib/integrations/runner", () => ({
  runSpaceIntegration: (...args: unknown[]) => mockRunSpaceIntegration(...args),
}));

const mockEnqueueNotify = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/queue/jobs", () => ({
  enqueueNotify: (...args: unknown[]) => mockEnqueueNotify(...args),
}));

describe("processIntegrationRun", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls runSpaceIntegration and returns on success", async () => {
    mockRunSpaceIntegration.mockResolvedValue({ success: true, message: "ok" });
    const { processIntegrationRun } = await import(
      "@/lib/queue/workers/integration.worker"
    );

    await expect(
      processIntegrationRun({
        spaceIntegrationId: "si-1",
        trigger: "cron",
      })
    ).resolves.toBeUndefined();
  });

  it("throws Error on retryable failure", async () => {
    mockRunSpaceIntegration.mockResolvedValue({
      success: false,
      message: "RPC timeout",
    });
    const { processIntegrationRun } = await import(
      "@/lib/queue/workers/integration.worker"
    );

    await expect(
      processIntegrationRun({
        spaceIntegrationId: "si-1",
        trigger: "cron",
      })
    ).rejects.toThrow("RPC timeout");
  });

  it("throws UnrecoverableError for non-retryable failures", async () => {
    mockRunSpaceIntegration.mockResolvedValue({
      success: false,
      message: "Integration is INACTIVE, not active",
    });
    const { processIntegrationRun } = await import(
      "@/lib/queue/workers/integration.worker"
    );

    await expect(
      processIntegrationRun({
        spaceIntegrationId: "si-1",
        trigger: "cron",
      })
    ).rejects.toThrow("Integration is INACTIVE");
    // Verify it's an UnrecoverableError
    try {
      await processIntegrationRun({
        spaceIntegrationId: "si-1",
        trigger: "cron",
      });
    } catch (e) {
      expect((e as Error).constructor.name).toBe("UnrecoverableError");
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run tests/unit/lib/queue/workers/integration.worker.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Implement integration worker processor**

```typescript
// src/lib/queue/workers/integration.worker.ts
import { UnrecoverableError } from "bullmq";
import { runSpaceIntegration } from "@/lib/integrations/runner";
import type { IntegrationRunJobData } from "../jobs";

/**
 * Non-retryable error patterns.
 * These failures won't resolve on retry — skip remaining attempts.
 */
const NON_RETRYABLE_PATTERNS = [
  "is INACTIVE",
  "No input handler for",
  "No output handler for",
  "Manual input requires",
  "Integration has no assigned stream",
];

function isNonRetryable(message: string): boolean {
  return NON_RETRYABLE_PATTERNS.some((p) => message.includes(p));
}

/**
 * Process an integration.run job.
 * Called by the BullMQ Worker — throws on failure so BullMQ can retry.
 */
export async function processIntegrationRun(
  data: IntegrationRunJobData
): Promise<void> {
  const result = await runSpaceIntegration(
    data.spaceIntegrationId,
    data.options
  );

  if (!result.success) {
    const msg = result.message || "Integration run failed";
    if (isNonRetryable(msg)) {
      throw new UnrecoverableError(msg);
    }
    throw new Error(msg);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm vitest run tests/unit/lib/queue/workers/integration.worker.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/queue/workers/integration.worker.ts tests/unit/lib/queue/workers/integration.worker.test.ts
git commit -m "feat: add integration worker processor with error classification"
```

---

### Task 7: Notification Worker

**Files:**
- Create: `src/lib/notifications/registry.ts`
- Create: `src/lib/notifications/channels/in-app.ts`
- Create: `src/lib/notifications/channels/webhook.ts`
- Create: `src/lib/queue/workers/notification.worker.ts`
- Test: `tests/unit/lib/queue/workers/notification.worker.test.ts`
- Test: `tests/unit/lib/notifications/channels/webhook.test.ts`

- [ ] **Step 1: Create notification channel types and registry**

```typescript
// src/lib/notifications/registry.ts
export interface NotificationPayload {
  event: string;
  space: { id: string; name: string };
  integration: { id: string; key: string; name: string };
  error: string;
  attemptsMade: number;
  failedAt: string;
}

export interface NotificationChannel {
  type: string;
  deliver(config: Record<string, unknown>, payload: NotificationPayload): Promise<void>;
}

const channels = new Map<string, NotificationChannel>();

export function registerChannel(channel: NotificationChannel): void {
  channels.set(channel.type, channel);
}

export function getChannel(type: string): NotificationChannel | undefined {
  return channels.get(type);
}

export function getAllChannelTypes(): string[] {
  return Array.from(channels.keys());
}
```

- [ ] **Step 2: Create in-app notification channel**

```typescript
// src/lib/notifications/channels/in-app.ts
import { prisma } from "@/lib/prisma";
import type { NotificationChannel, NotificationPayload } from "../registry";

export const inAppChannel: NotificationChannel = {
  type: "in-app",
  async deliver(_config, payload) {
    await prisma.notification.create({
      data: {
        spaceId: payload.space.id,
        type: payload.event,
        title: `Integration failed: ${payload.integration.name}`,
        message: payload.error,
        metadata: {
          integrationId: payload.integration.id,
          integrationKey: payload.integration.key,
          attemptsMade: payload.attemptsMade,
          failedAt: payload.failedAt,
        } as never,
      },
    });
  },
};
```

- [ ] **Step 3: Create webhook notification channel**

```typescript
// src/lib/notifications/channels/webhook.ts
import type { NotificationChannel, NotificationPayload } from "../registry";

export const webhookChannel: NotificationChannel = {
  type: "webhook",
  async deliver(config, payload) {
    const url = config.url as string;
    if (!url) throw new Error("Webhook URL not configured");

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(config.headers as Record<string, string> | undefined),
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(
        `Webhook delivery failed: ${response.status} ${response.statusText}`
      );
    }
  },
};
```

- [ ] **Step 4: Write webhook channel test**

```typescript
// tests/unit/lib/notifications/channels/webhook.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { webhookChannel } from "@/lib/notifications/channels/webhook";

describe("webhookChannel", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const payload = {
    event: "integration.failed",
    space: { id: "s1", name: "Test Space" },
    integration: { id: "i1", key: "webhook", name: "My Webhook" },
    error: "RPC timeout",
    attemptsMade: 3,
    failedAt: "2026-03-18T00:00:00Z",
  };

  it("POSTs payload to configured URL", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", mockFetch);

    await webhookChannel.deliver({ url: "https://example.com/hook" }, payload);

    expect(mockFetch).toHaveBeenCalledWith(
      "https://example.com/hook",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(payload),
      })
    );
  });

  it("throws on non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500, statusText: "Internal Server Error" })
    );

    await expect(
      webhookChannel.deliver({ url: "https://example.com/hook" }, payload)
    ).rejects.toThrow("Webhook delivery failed: 500");
  });

  it("throws when URL not configured", async () => {
    await expect(webhookChannel.deliver({}, payload)).rejects.toThrow(
      "Webhook URL not configured"
    );
  });
});
```

- [ ] **Step 5: Write notification worker test**

```typescript
// tests/unit/lib/queue/workers/notification.worker.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFindMany = vi.fn().mockResolvedValue([]);
const mockFindUnique = vi.fn();
const mockCreate = vi.fn().mockResolvedValue({ id: "n-1" });

vi.mock("@/lib/prisma", () => ({
  prisma: {
    notification: { create: (...args: unknown[]) => mockCreate(...args) },
    notificationChannel: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
    spaceIntegration: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
    },
  },
}));

const mockEnqueueDeliver = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/queue/jobs", () => ({
  enqueueDeliver: (...args: unknown[]) => mockEnqueueDeliver(...args),
}));

describe("processNotify", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates in-app notification and enqueues delivery for each channel", async () => {
    mockFindUnique.mockResolvedValue({
      id: "si-1",
      spaceId: "s-1",
      space: { id: "s-1", name: "Test" },
      integration: { id: "int-1", key: "webhook", name: "Webhook" },
    });
    mockFindMany.mockResolvedValue([
      { id: "ch-1", type: "webhook", config: { url: "https://example.com" }, enabled: true },
    ]);

    const { processNotify } = await import(
      "@/lib/queue/workers/notification.worker"
    );
    await processNotify({
      spaceIntegrationId: "si-1",
      error: "timeout",
      failedAt: "2026-03-18T00:00:00Z",
      attemptsMade: 3,
    });

    expect(mockEnqueueDeliver).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 6: Implement notification worker processor**

```typescript
// src/lib/queue/workers/notification.worker.ts
import { prisma } from "@/lib/prisma";
import { enqueueDeliver } from "../jobs";
import { getChannel } from "@/lib/notifications/registry";
import type { NotifyJobData, DeliverJobData } from "../jobs";
import type { NotificationPayload } from "@/lib/notifications/registry";

/**
 * Process an integration.notify job.
 * 1. Creates in-app Notification record
 * 2. Reads space's configured channels
 * 3. Enqueues one notification.deliver job per channel
 */
export async function processNotify(data: NotifyJobData): Promise<void> {
  // Look up the integration for context
  const si = await prisma.spaceIntegration.findUnique({
    where: { id: data.spaceIntegrationId },
    include: {
      space: { select: { id: true, name: true } },
      integration: { select: { id: true, key: true, name: true } },
    },
  });

  if (!si) return;

  const payload: NotificationPayload = {
    event: "integration.failed",
    space: { id: si.space.id, name: si.space.name },
    integration: {
      id: si.integration.id,
      key: si.integration.key,
      name: si.integration.name,
    },
    error: data.error,
    attemptsMade: data.attemptsMade,
    failedAt: data.failedAt,
  };

  // 1. Always create in-app notification
  const notification = await prisma.notification.create({
    data: {
      spaceId: si.space.id,
      type: "integration_failure",
      title: `Integration failed: ${si.integration.name}`,
      message: data.error,
      metadata: {
        spaceIntegrationId: data.spaceIntegrationId,
        integrationKey: si.integration.key,
        attemptsMade: data.attemptsMade,
        failedAt: data.failedAt,
      } as never,
    },
  });

  // 2. Fan out to configured channels
  const channels = await prisma.notificationChannel.findMany({
    where: { spaceId: si.space.id, enabled: true },
  });

  for (const ch of channels) {
    await enqueueDeliver({
      notificationId: notification.id,
      channelId: ch.id,
      channelType: ch.type,
      payload,
    });
  }
}

/**
 * Process a notification.deliver job.
 * Delivers to a single channel using the channel registry.
 */
export async function processDeliver(data: DeliverJobData): Promise<void> {
  const channel = getChannel(data.channelType);
  if (!channel) {
    console.warn(`[Notify] Unknown channel type: ${data.channelType}`);
    return;
  }

  // Load channel config from DB
  const dbChannel = await prisma.notificationChannel.findUnique({
    where: { id: data.channelId },
  });
  if (!dbChannel || !dbChannel.enabled) return;

  const config = (dbChannel.config as Record<string, unknown>) ?? {};
  await channel.deliver(config, data.payload);
}
```

- [ ] **Step 7: Run all notification tests**

```bash
pnpm vitest run tests/unit/lib/notifications/ tests/unit/lib/queue/workers/notification.worker.test.ts
```

Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/lib/notifications/ src/lib/queue/workers/notification.worker.ts tests/unit/lib/notifications/ tests/unit/lib/queue/workers/notification.worker.test.ts
git commit -m "feat: add notification channel registry, in-app + webhook channels, and notification worker"
```

---

### Task 8: Worker Entrypoint

**Files:**
- Create: `src/worker.ts`

- [ ] **Step 1: Create worker entrypoint**

```typescript
// src/worker.ts
/**
 * BullMQ Worker Entrypoint
 *
 * Standalone process that processes integration jobs from the queue.
 * Run via: pnpm exec tsx src/worker.ts
 */

import { Worker } from "bullmq";
import { getRedisConnection, closeRedisConnection } from "@/lib/queue/connection";
import { processIntegrationRun } from "@/lib/queue/workers/integration.worker";
import { processNotify, processDeliver } from "@/lib/queue/workers/notification.worker";
import { syncAllRepeatables } from "@/lib/queue/sync";
import { registerChannel } from "@/lib/notifications/registry";
import { inAppChannel } from "@/lib/notifications/channels/in-app";
import { webhookChannel } from "@/lib/notifications/channels/webhook";
import { enqueueNotify } from "@/lib/queue/jobs";
import type { IntegrationRunJobData, NotifyJobData, DeliverJobData } from "@/lib/queue/jobs";

// Register notification channels
registerChannel(inAppChannel);
registerChannel(webhookChannel);

const connection = getRedisConnection();

const worker = new Worker(
  "integrations",
  async (job) => {
    switch (job.name) {
      case "integration.run":
        return processIntegrationRun(job.data as IntegrationRunJobData);
      case "integration.notify":
        return processNotify(job.data as NotifyJobData);
      case "notification.deliver":
        return processDeliver(job.data as DeliverJobData);
      default:
        console.warn(`[Worker] Unknown job type: ${job.name}`);
    }
  },
  {
    connection,
    concurrency: 5,
  }
);

// Handle final failure — enqueue notification
worker.on("failed", async (job, err) => {
  if (!job) return;
  // Only notify for integration.run jobs that exhausted all attempts
  if (job.name !== "integration.run") return;
  if (job.attemptsMade < (job.opts.attempts ?? 1)) return;

  const data = job.data as IntegrationRunJobData;
  await enqueueNotify({
    spaceIntegrationId: data.spaceIntegrationId,
    error: err.message,
    failedAt: new Date().toISOString(),
    attemptsMade: job.attemptsMade,
  });
});

worker.on("ready", () => {
  console.log("[Worker] Ready and processing jobs");
});

worker.on("error", (err) => {
  console.error("[Worker] Error:", err.message);
});

// Graceful shutdown
async function shutdown() {
  console.log("[Worker] Shutting down gracefully...");
  await worker.close();
  await closeRedisConnection();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

// Startup: reconcile repeatable jobs from DB
(async () => {
  try {
    await syncAllRepeatables();
    console.log("[Worker] Startup sync complete");
  } catch (err) {
    console.error("[Worker] Startup sync failed:", err);
  }
})();
```

- [ ] **Step 2: Add worker script to package.json**

In `package.json`, add to `scripts`:

```json
"worker": "tsx src/worker.ts"
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
pnpm type-check
```

Expected: No errors related to worker.ts

- [ ] **Step 4: Commit**

```bash
git add src/worker.ts package.json
git commit -m "feat: add standalone BullMQ worker entrypoint with graceful shutdown"
```

---

## Chunk 3: Wire Up — DAL Sync, Runner Changes, API Routes

### Task 9: Add Sync Hooks to DAL Functions

**Files:**
- Modify: `src/lib/dal/data-inputs.ts`
- Modify: `src/lib/dal/data-outputs.ts`

- [ ] **Step 1: Add sync calls to data-inputs.ts**

At the top of `src/lib/dal/data-inputs.ts`, add import:

```typescript
import { syncRepeatableJob, removeRepeatableJob } from "@/lib/queue/sync";
```

In `createDataInput()`, after the `return` from the `$transaction` block (line 171), wrap the return:

Replace lines 125-171:
```typescript
  // 5. Create atomically
  const spaceIntegration = await prisma.$transaction(async (tx) => {
    // ... existing transaction code unchanged ...
  });

  // Sync BullMQ repeatable if CRON trigger
  try {
    await syncRepeatableJob(spaceIntegration.id);
  } catch (err) {
    console.warn("[Queue] Failed to sync repeatable job:", err);
  }

  return spaceIntegration;
```

In `updateDataInput()`, after the `prisma.spaceIntegration.update()` call (line 249), add:

```typescript
  const updated = await prisma.spaceIntegration.update({
    // ... existing update code ...
  });

  // Sync BullMQ repeatable on trigger/schedule/status change
  if (params.trigger !== undefined || params.schedule !== undefined || params.status !== undefined) {
    try {
      await syncRepeatableJob(integrationId);
    } catch (err) {
      console.warn("[Queue] Failed to sync repeatable job:", err);
    }
  }

  return updated;
```

- [ ] **Step 2: Add sync calls to data-outputs.ts**

Same pattern. At top, add import:

```typescript
import { syncRepeatableJob, removeRepeatableJob } from "@/lib/queue/sync";
```

In `createDataOutput()`, after the `prisma.spaceIntegration.create()` (line 109), wrap:

```typescript
  const spaceIntegration = await prisma.spaceIntegration.create({
    // ... existing code ...
  });

  try {
    await syncRepeatableJob(spaceIntegration.id);
  } catch (err) {
    console.warn("[Queue] Failed to sync repeatable job:", err);
  }

  return spaceIntegration;
```

In `updateDataOutput()`, after the `prisma.spaceIntegration.update()` (line 218), add:

```typescript
  const updated = await prisma.spaceIntegration.update({
    // ... existing code ...
  });

  if (params.trigger !== undefined || params.schedule !== undefined || params.status !== undefined) {
    try {
      await syncRepeatableJob(integrationId);
    } catch (err) {
      console.warn("[Queue] Failed to sync repeatable job:", err);
    }
  }

  return updated;
```

- [ ] **Step 3: Verify type-check passes**

```bash
pnpm type-check
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/dal/data-inputs.ts src/lib/dal/data-outputs.ts
git commit -m "feat: sync BullMQ repeatable jobs on integration create/update"
```

---

### Task 10: Clean Up Runner — Delete Cron Code, Change ON_CHANGE

**Files:**
- Modify: `src/lib/integrations/runner.ts`

- [ ] **Step 1: Delete cron scheduling code**

Remove everything from line 276 to line 427 in `runner.ts`:
- `parseCronField()`
- `cronMatches()`
- `isCronDue()`
- `runScheduledIntegrations()`

- [ ] **Step 2: Rewrite `runOnChangeOutputs()` to enqueue**

Replace the existing `runOnChangeOutputs()` (lines 243-274) with:

```typescript
/**
 * Enqueue jobs for all on_change output destinations linked to a stream.
 * Called after a new entry is created in the stream.
 */
export async function runOnChangeOutputs(
  spaceId: string,
  streamId: string
): Promise<void> {
  // Lazy import to avoid circular dependency at module level
  const { enqueueIntegrationRun } = await import("@/lib/queue/jobs");

  const outputs = await prisma.spaceIntegration.findMany({
    where: {
      spaceId,
      streamId,
      direction: DIRECTION_OUTPUT,
      trigger: "ON_CHANGE" as unknown as import("@prisma/client").IntegrationTrigger,
      status: STATUS_ACTIVE,
    },
    select: { id: true, maxAttempts: true, retryBackoff: true },
  });

  for (const output of outputs) {
    await enqueueIntegrationRun(output.id, "on_change", undefined, {
      maxAttempts: output.maxAttempts,
      retryBackoff: output.retryBackoff,
    });
  }
}
```

- [ ] **Step 3: Wire runOnChangeOutputs into stream entry creation**

In `src/lib/dal/stream-entries.ts`, at the end of `createEntry()` (after the entry is created and returned), add a fire-and-forget call:

```typescript
// After the entry is created, trigger on-change outputs
import { runOnChangeOutputs } from "@/lib/integrations/runner";

// At the end of createEntry(), before returning:
const stream = await prisma.dataStream.findUnique({
  where: { id: streamId },
  select: { spaceId: true },
});
if (stream) {
  // Fire and forget — don't block entry creation on output dispatch
  runOnChangeOutputs(stream.spaceId, streamId).catch((err) =>
    console.warn("[OnChange] Failed to enqueue outputs:", err)
  );
}
```

Note: The import should be dynamic (`await import(...)`) if circular dependency issues arise. The call is fire-and-forget — it enqueues jobs into BullMQ and returns quickly.

- [ ] **Step 4: Delete empty /src/app/api/cron/ directory**

```bash
rmdir src/app/api/cron 2>/dev/null || true
```

- [ ] **Step 5: Verify type-check passes**

```bash
pnpm type-check
```

- [ ] **Step 6: Run existing tests to check for regressions**

```bash
pnpm test
```

- [ ] **Step 7: Commit**

```bash
git add src/lib/integrations/runner.ts src/lib/dal/stream-entries.ts
git commit -m "refactor: replace cron parser with BullMQ, wire on_change triggers to queue"
```

---

### Task 11: Update API Routes to Enqueue Jobs

**Files:**
- Modify: `src/app/api/spaces/[spaceId]/data-outputs/[outputId]/run/route.ts`

The data-inputs run route has a test mode (no `?persist`) that returns results synchronously — this should stay synchronous for UX. Only the persist mode and outputs should enqueue.

- [ ] **Step 1: Update output run route to enqueue**

Replace `src/app/api/spaces/[spaceId]/data-outputs/[outputId]/run/route.ts`:

```typescript
import { getDataOutput } from "@/lib/dal/data-outputs";
import { NextResponse } from "next/server";
import { enqueueIntegrationRun } from "@/lib/queue/jobs";
import { spaceRoute, ApiError } from "@/lib/api";
import type { IntegrationStatus } from "@prisma/client";

const STATUS_ACTIVE = "ACTIVE" as unknown as IntegrationStatus;

// POST /api/spaces/[spaceId]/data-outputs/[outputId]/run
// Enqueues the output handler for async processing.
export const POST = spaceRoute<{ outputId: string }>(
  { requiredAccess: "auditor", label: "run data output" },
  async ({ params }) => {
    const output = await getDataOutput(params.outputId);
    if (!output || output.spaceId !== params.spaceId) {
      return ApiError.notFound("Data output not found");
    }

    if (output.status !== STATUS_ACTIVE) {
      return ApiError.badRequest("Output is not active");
    }

    const job = await enqueueIntegrationRun(
      params.outputId,
      "manual",
      undefined,
      {
        maxAttempts: output.maxAttempts,
        retryBackoff: output.retryBackoff,
      }
    );

    return NextResponse.json({
      jobId: job.id,
      message: "Output run enqueued",
    }, { status: 202 });
  }
);
```

- [ ] **Step 2: Update input run route persist mode to enqueue**

In `src/app/api/spaces/[spaceId]/data-inputs/[inputId]/run/route.ts`, the persist block (lines 37-47) currently calls `runSpaceIntegration()` synchronously which re-runs the handler. Keep it synchronous (no enqueue) since the test-then-persist UX requires immediate feedback. The handler has already run for the test — just persist the result directly. No change needed for input persist mode; the existing inline execution is correct for this user-facing flow. Only cron and on_change triggers go through the queue.

- [ ] **Step 3: Verify type-check passes**

```bash
pnpm type-check
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/spaces/[spaceId]/data-inputs/[inputId]/run/route.ts src/app/api/spaces/[spaceId]/data-outputs/[outputId]/run/route.ts
git commit -m "feat: API routes enqueue jobs instead of executing inline"
```

---

## Chunk 4: Signer Service

### Task 12: Signer Types and Client

**Files:**
- Create: `src/lib/signer/types.ts`
- Create: `src/lib/signer/client.ts`
- Test: `tests/unit/lib/signer/client.test.ts`

- [ ] **Step 1: Create signer types**

```typescript
// src/lib/signer/types.ts
export interface JsonRpcRequest {
  jsonrpc: "2.0";
  method: string;
  params: unknown[];
  id: number;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  result?: unknown;
  error?: { code: number; message: string };
  id: number;
}

export interface SignTransactionParams {
  from?: string;
  to: string;
  data?: string;
  value?: string;
  chainId: string;
  gas?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  nonce?: string;
}
```

- [ ] **Step 2: Write test for signer client**

```typescript
// tests/unit/lib/signer/client.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

describe("signTransaction", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.SIGNER_SERVICE_URL;
    delete process.env.SIGNER_SERVICE_TOKEN;
  });

  it("sends JSON-RPC request to signer service", async () => {
    process.env.SIGNER_SERVICE_URL = "http://signer:4000/sign";
    process.env.SIGNER_SERVICE_TOKEN = "test-token-123456";

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          jsonrpc: "2.0",
          result: "0xsigned",
          id: 1,
        }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { signTransaction } = await import("@/lib/signer/client");
    const result = await signTransaction({
      to: "0x1234567890abcdef1234567890abcdef12345678",
      chainId: "0xa86a",
      value: "0x0",
    });

    expect(result).toBe("0xsigned");
    expect(mockFetch).toHaveBeenCalledWith(
      "http://signer:4000/sign",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-token-123456",
        }),
      })
    );
  });

  it("throws on JSON-RPC error response", async () => {
    process.env.SIGNER_SERVICE_URL = "http://signer:4000/sign";
    process.env.SIGNER_SERVICE_TOKEN = "test-token-123456";

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            jsonrpc: "2.0",
            error: { code: -32000, message: "Key not found" },
            id: 1,
          }),
      })
    );

    const { signTransaction } = await import("@/lib/signer/client");
    await expect(
      signTransaction({
        to: "0x1234567890abcdef1234567890abcdef12345678",
        chainId: "0xa86a",
      })
    ).rejects.toThrow("Key not found");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
pnpm vitest run tests/unit/lib/signer/client.test.ts
```

Expected: FAIL

- [ ] **Step 4: Implement signer client**

```typescript
// src/lib/signer/client.ts
import type { JsonRpcRequest, JsonRpcResponse, SignTransactionParams } from "./types";

let requestId = 0;

function getSignerUrl(): string {
  return (
    process.env.SIGNER_SERVICE_URL ||
    "http://localhost:3000/api/internal/signer/sign"
  );
}

function getSignerToken(): string {
  return process.env.SIGNER_SERVICE_TOKEN || "";
}

async function jsonRpcCall(
  method: string,
  params: unknown[]
): Promise<unknown> {
  const url = getSignerUrl();
  const token = getSignerToken();

  const body: JsonRpcRequest = {
    jsonrpc: "2.0",
    method,
    params,
    id: ++requestId,
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(
      `Signer service error: ${response.status} ${response.statusText}`
    );
  }

  const data: JsonRpcResponse = await response.json();

  if (data.error) {
    throw new Error(data.error.message);
  }

  return data.result;
}

export async function signTransaction(
  tx: SignTransactionParams
): Promise<string> {
  const result = await jsonRpcCall("eth_signTransaction", [tx]);
  return result as string;
}

export async function personalSign(
  message: string,
  address: string
): Promise<string> {
  const result = await jsonRpcCall("personal_sign", [message, address]);
  return result as string;
}

export async function getAccounts(): Promise<string[]> {
  const result = await jsonRpcCall("eth_accounts", []);
  return result as string[];
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
pnpm vitest run tests/unit/lib/signer/client.test.ts
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/signer/ tests/unit/lib/signer/
git commit -m "feat: add JSON-RPC signer client with eth_signTransaction and personal_sign"
```

---

### Task 13: Signer API Route (Phase 1 — Local Key)

**Files:**
- Create: `src/lib/signer/handlers/local.ts`
- Create: `src/app/api/internal/signer/sign/route.ts`
- Test: `tests/unit/lib/signer/handlers/local.test.ts`

- [ ] **Step 1: Write test for local signer handler**

```typescript
// tests/unit/lib/signer/handlers/local.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("viem/accounts", () => ({
  privateKeyToAccount: vi.fn().mockReturnValue({
    address: "0xTestAddress",
    signTransaction: vi.fn().mockResolvedValue("0xSignedTx"),
  }),
}));

describe("localSignHandler", () => {
  beforeEach(() => {
    delete process.env.AVALANCHE_SIGNER_PRIVATE_KEY;
    delete process.env.BLOCKCHAIN_SIGNER_PRIVATE_KEY;
  });

  it("signs transaction using env private key", async () => {
    process.env.AVALANCHE_SIGNER_PRIVATE_KEY = "0x" + "ab".repeat(32);
    const { localSignHandler } = await import("@/lib/signer/handlers/local");
    const result = await localSignHandler({
      jsonrpc: "2.0",
      method: "eth_signTransaction",
      params: [{ to: "0x" + "00".repeat(20), chainId: "0xa86a" }],
      id: 1,
    });

    expect(result.result).toBe("0xSignedTx");
  });

  it("returns eth_accounts with signer address", async () => {
    process.env.AVALANCHE_SIGNER_PRIVATE_KEY = "0x" + "ab".repeat(32);
    const { localSignHandler } = await import("@/lib/signer/handlers/local");
    const result = await localSignHandler({
      jsonrpc: "2.0",
      method: "eth_accounts",
      params: [],
      id: 1,
    });

    expect(result.result).toEqual(["0xTestAddress"]);
  });

  it("returns error when no private key configured", async () => {
    const { localSignHandler } = await import("@/lib/signer/handlers/local");
    const result = await localSignHandler({
      jsonrpc: "2.0",
      method: "eth_signTransaction",
      params: [{ to: "0x" + "00".repeat(20), chainId: "0xa86a" }],
      id: 1,
    });

    expect(result.error).toBeDefined();
    expect(result.error?.message).toContain("No signer private key");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run tests/unit/lib/signer/handlers/local.test.ts
```

Expected: FAIL

- [ ] **Step 3: Implement local signer handler**

```typescript
// src/lib/signer/handlers/local.ts
import { privateKeyToAccount } from "viem/accounts";
import type { JsonRpcRequest, JsonRpcResponse, SignTransactionParams } from "../types";

function getPrivateKey(): string | undefined {
  return (
    process.env.AVALANCHE_SIGNER_PRIVATE_KEY ||
    process.env.ETHEREUM_SIGNER_PRIVATE_KEY ||
    process.env.BLOCKCHAIN_SIGNER_PRIVATE_KEY
  );
}

function normalizeKey(key: string): `0x${string}` {
  return key.startsWith("0x")
    ? (key as `0x${string}`)
    : (`0x${key}` as `0x${string}`);
}

export async function localSignHandler(
  request: JsonRpcRequest
): Promise<JsonRpcResponse> {
  const key = getPrivateKey();
  if (!key) {
    return {
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "No signer private key configured",
      },
      id: request.id,
    };
  }

  const account = privateKeyToAccount(normalizeKey(key));

  try {
    switch (request.method) {
      case "eth_signTransaction": {
        const params = request.params[0] as SignTransactionParams;
        const signed = await account.signTransaction({
          to: params.to as `0x${string}`,
          data: params.data as `0x${string}` | undefined,
          value: params.value ? BigInt(params.value) : undefined,
          chainId: params.chainId ? parseInt(params.chainId, 16) : undefined,
          gas: params.gas ? BigInt(params.gas) : undefined,
          maxFeePerGas: params.maxFeePerGas
            ? BigInt(params.maxFeePerGas)
            : undefined,
          maxPriorityFeePerGas: params.maxPriorityFeePerGas
            ? BigInt(params.maxPriorityFeePerGas)
            : undefined,
          nonce: params.nonce ? parseInt(params.nonce, 16) : undefined,
        });
        return { jsonrpc: "2.0", result: signed, id: request.id };
      }

      case "personal_sign": {
        // Not implemented in Phase 1 — placeholder
        return {
          jsonrpc: "2.0",
          error: { code: -32601, message: "personal_sign not yet implemented" },
          id: request.id,
        };
      }

      case "eth_accounts":
        return {
          jsonrpc: "2.0",
          result: [account.address],
          id: request.id,
        };

      default:
        return {
          jsonrpc: "2.0",
          error: { code: -32601, message: `Method not supported: ${request.method}` },
          id: request.id,
        };
    }
  } catch (err) {
    return {
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: err instanceof Error ? err.message : "Signing failed",
      },
      id: request.id,
    };
  }
}
```

- [ ] **Step 4: Create the API route**

```typescript
// src/app/api/internal/signer/sign/route.ts
import { NextRequest, NextResponse } from "next/server";
import { localSignHandler } from "@/lib/signer/handlers/local";
import type { JsonRpcRequest } from "@/lib/signer/types";

export async function POST(request: NextRequest) {
  // Authenticate with SIGNER_SERVICE_TOKEN
  const token = process.env.SIGNER_SERVICE_TOKEN;
  if (token) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${token}`) {
      return NextResponse.json(
        { jsonrpc: "2.0", error: { code: -32000, message: "Unauthorized" }, id: null },
        { status: 401 }
      );
    }
  }

  const body: JsonRpcRequest = await request.json();

  if (body.jsonrpc !== "2.0" || !body.method) {
    return NextResponse.json(
      { jsonrpc: "2.0", error: { code: -32600, message: "Invalid request" }, id: body.id ?? null },
      { status: 400 }
    );
  }

  const result = await localSignHandler(body);
  return NextResponse.json(result);
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
pnpm vitest run tests/unit/lib/signer/handlers/local.test.ts
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/signer/handlers/ src/app/api/internal/signer/
git commit -m "feat: add local signer handler and /api/internal/signer/sign route"
```

---

### Task 14: Refactor Blockchain Output Handler to Use Signer

**Files:**
- Modify: `src/lib/integrations/handlers/output/blockchain.ts`

- [ ] **Step 1: Refactor to use signer client**

Replace the signing section of `blockchain.ts`. The key changes:
- Remove `privateKeyToAccount` and `createWalletClient` usage
- Use `signTransaction()` from signer client
- Use `publicClient` only for gas estimation and broadcast

Replace the `run()` method body (lines 112-209). The handler should:
1. Create a `publicClient` for gas estimation and broadcasting
2. Build the unsigned transaction
3. Call `signTransaction()` from `@/lib/signer/client`
4. Broadcast via `publicClient.sendRawTransaction()`

Remove imports: `createWalletClient`, `privateKeyToAccount`
Add import: `import { signTransaction } from "@/lib/signer/client";`

The `signerPrivateKey` field in `BlockchainOutputConfig` should be removed — signing is handled by the signer service. The `getSignerEnvVars` import can be removed.

Full replacement of the `run()` method:

```typescript
  async run(
    rawConfig: Record<string, unknown>,
    context: StoreEntryContext
  ): Promise<ExecutionResult> {
    const config = normalizeConfig(rawConfig);
    const validation = this.validateConfig(rawConfig);
    if (!validation.valid) {
      return this.failure(
        `Invalid blockchain output config: ${(validation.errors || []).join(", ")}`
      );
    }

    const chainBase = config.blockchain === "ethereum" ? mainnet : avalanche;
    const chain = {
      ...chainBase,
      id: config.chainId,
      rpcUrls: {
        ...chainBase.rpcUrls,
        default: { ...chainBase.rpcUrls.default, http: [config.rpcUrl] },
      },
    };
    const publicClient = createPublicClient({ chain, transport: http(config.rpcUrl) });

    try {
      let txData: `0x${string}`;
      let requestPayload: Record<string, unknown>;

      if (config.writeMode === "por_value") {
        const entryValue = context.entry.value;
        if (entryValue === null || entryValue === undefined) {
          return this.failure("Stream entry has no value for PoR write mode");
        }
        const value = parseUnits(entryValue.toString(), config.valueDecimals ?? DEFAULT_DECIMALS);
        txData = encodeFunctionData({
          abi: AURA_RESERVE_ORACLE_ABI,
          functionName: "writeValue",
          args: [value, context.unit],
        });
        requestPayload = { value: entryValue, unit: context.unit };
      } else {
        // merkle_root mode
        const artifactData = context.entry.artifactData;
        if (!artifactData) {
          return this.failure("Stream entry has no artifact data for merkle write mode");
        }
        const merkleRoot = normalizeRoot(String(artifactData.merkleRoot || ""));
        if (!merkleRoot) return this.failure("Invalid merkle root format in entry artifact data");
        const totalBalance = typeof artifactData.totalBalance === "number" ? artifactData.totalBalance : 0;
        const leafCount = typeof artifactData.leafCount === "number" ? artifactData.leafCount : 0;
        const totalBalanceUnits = parseUnits(totalBalance.toString(), config.valueDecimals ?? DEFAULT_DECIMALS);

        txData = encodeFunctionData({
          abi: AURA_RESERVE_ORACLE_ABI,
          functionName: "writeMerkle",
          args: [merkleRoot, totalBalanceUnits, BigInt(leafCount), context.unit],
        });
        requestPayload = { merkleRoot, totalBalance, leafCount, unit: context.unit };
      }

      // Sign via signer service
      const { signTransaction } = await import("@/lib/signer/client");
      const signedTx = await signTransaction({
        to: config.contractAddress,
        data: txData,
        chainId: `0x${config.chainId.toString(16)}`,
        value: "0x0",
      });

      // Broadcast
      const txHash = await publicClient.sendRawTransaction({
        serializedTransaction: signedTx as `0x${string}`,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

      return this.success(
        config.writeMode === "por_value"
          ? "PoR value written to blockchain"
          : "Merkle root written to blockchain",
        requestPayload,
        { txHash, receipt }
      );
    } catch (error) {
      return this.failure(
        `Blockchain output failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }
```

Also update imports at top of file:
- Remove: `createWalletClient`, `privateKeyToAccount` from `viem` / `viem/accounts`
- Add: `encodeFunctionData` from `viem`
- Remove: `getSignerEnvVars` import from `@/lib/blockchain` (keep `getDefaultChainId`, `getDefaultRpcUrl`, and `type SupportedBlockchain` — still used by `normalizeConfig`)
- Remove `signerPrivateKey` from `BlockchainOutputConfig` interface and `normalizeConfig()`

- [ ] **Step 2: Verify type-check passes**

```bash
pnpm type-check
```

- [ ] **Step 3: Run existing tests**

```bash
pnpm test
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/integrations/handlers/output/blockchain.ts
git commit -m "refactor: blockchain output handler uses signer service instead of direct key access"
```

---

## Chunk 5: Admin Dashboard

### Task 15: Admin Jobs API Route

**Files:**
- Create: `src/app/api/admin/jobs/route.ts`

- [ ] **Step 1: Create the admin jobs API**

```typescript
// src/app/api/admin/jobs/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth-utils";
import { getIntegrationQueue } from "@/lib/queue/queues";

export async function GET(request: NextRequest) {
  await requireRole("owner");

  const queue = getIntegrationQueue();
  const url = new URL(request.url);
  const state = url.searchParams.get("state") || "all";
  const page = parseInt(url.searchParams.get("page") || "0");
  const pageSize = 50;

  // Queue counts
  const counts = await queue.getJobCounts();

  // Job list based on requested state
  let jobs: unknown[] = [];
  if (state === "failed") {
    jobs = await queue.getFailed(page * pageSize, (page + 1) * pageSize - 1);
  } else if (state === "active") {
    jobs = await queue.getActive(page * pageSize, (page + 1) * pageSize - 1);
  } else if (state === "waiting") {
    jobs = await queue.getWaiting(page * pageSize, (page + 1) * pageSize - 1);
  } else if (state === "completed") {
    jobs = await queue.getCompleted(page * pageSize, (page + 1) * pageSize - 1);
  } else if (state === "delayed") {
    jobs = await queue.getDelayed(page * pageSize, (page + 1) * pageSize - 1);
  }

  // Repeatable job schedulers
  const schedulers = await queue.getJobSchedulers();

  return NextResponse.json({
    counts,
    jobs: jobs.map((j: any) => ({
      id: j.id,
      name: j.name,
      data: j.data,
      attemptsMade: j.attemptsMade,
      failedReason: j.failedReason,
      processedOn: j.processedOn,
      finishedOn: j.finishedOn,
      timestamp: j.timestamp,
    })),
    schedulers: schedulers.map((s: any) => ({
      key: s.key,
      pattern: s.pattern,
      next: s.next,
    })),
  });
}

// POST — actions on jobs (retry, remove, pause, resume, clean)
export async function POST(request: NextRequest) {
  await requireRole("owner");

  const queue = getIntegrationQueue();
  const body = await request.json();
  const { action, jobId } = body;

  switch (action) {
    case "retry": {
      const job = await queue.getJob(jobId);
      if (job) await job.retry();
      return NextResponse.json({ success: true });
    }
    case "remove": {
      const job = await queue.getJob(jobId);
      if (job) await job.remove();
      return NextResponse.json({ success: true });
    }
    case "pause":
      await queue.pause();
      return NextResponse.json({ success: true });
    case "resume":
      await queue.resume();
      return NextResponse.json({ success: true });
    case "clean": {
      const grace = (body.olderThanDays ?? 7) * 24 * 60 * 60 * 1000;
      await queue.clean(grace, 1000, "completed");
      return NextResponse.json({ success: true });
    }
    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/admin/jobs/route.ts
git commit -m "feat: add admin jobs API route for queue monitoring and actions"
```

---

### Task 16: Admin Jobs Dashboard Page

**Files:**
- Create: `src/app/admin/jobs/page.tsx`
- Create: `src/app/admin/jobs/page-client.tsx`
- Modify: `src/app/admin/layout.tsx`

- [ ] **Step 1: Add Jobs nav item to admin layout**

In `src/app/admin/layout.tsx`, add import and nav item:

Add import: `import { ListTodo } from "lucide-react";`

Add to `adminNavItems` array after the Users entry:

```typescript
{
  title: "Jobs",
  href: "/admin/jobs",
  icon: ListTodo,
},
```

- [ ] **Step 2: Create server page**

```typescript
// src/app/admin/jobs/page.tsx
import JobsPageClient from "./page-client";

export const metadata = { title: "Job Queue | Admin" };

export default function JobsPage() {
  return <JobsPageClient />;
}
```

- [ ] **Step 3: Create client component**

Create `src/app/admin/jobs/page-client.tsx` with a dashboard that:
- Fetches from `GET /api/admin/jobs`
- Shows queue counts as stat cards
- Tab navigation for job states (Failed, Active, Scheduled, Completed)
- Table listing jobs with columns: ID, Type, Status, Created, Duration
- Failed jobs have Retry and Remove buttons
- Pause/Resume queue toggle
- Clean old completed jobs button
- Auto-refresh every 10 seconds

This is a UI implementation task — build it following the existing admin page patterns (see `src/app/admin/users/`, `src/app/admin/settings/` for style reference). Use existing UI components from `src/components/ui/`.

- [ ] **Step 4: Verify the page builds**

```bash
pnpm build
```

Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/jobs/ src/app/admin/layout.tsx
git commit -m "feat: add admin jobs dashboard page with queue monitoring"
```

---

## Chunk 6: Infrastructure and Documentation

### Task 17: Docker Compose and README

**Files:**
- Modify: `docker-compose.yml`
- Modify: `README.md`

- [ ] **Step 1: Add Redis and Worker services to docker-compose.yml**

Add `redis` service before the `app` service:

```yaml
  # Redis (Job Queue)
  redis:
    image: redis:7-alpine
    container_name: aurareserve-redis
    restart: unless-stopped
    volumes:
      - redis_data:/data
    networks:
      - aurareserve-network
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
```

Add `redis` dependency and `REDIS_URL` to the `app` service:

```yaml
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    environment:
      # ... existing env vars ...
      REDIS_URL: redis://redis:6379
```

Add `worker` service after the `app` service:

```yaml
  # Background Worker (Job Queue)
  worker:
    image: aurareserve-app
    build:
      context: .
      dockerfile: Dockerfile
    container_name: aurareserve-worker
    restart: unless-stopped
    depends_on:
      redis:
        condition: service_healthy
      postgres:
        condition: service_healthy
    environment:
      NODE_ENV: production
      DATABASE_URL: postgresql://${POSTGRES_USER:-aurareserve}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB:-aurareserve}?schema=public
      REDIS_URL: redis://redis:6379
      AVALANCHE_SIGNER_PRIVATE_KEY: ${AVALANCHE_SIGNER_PRIVATE_KEY:-}
      SIGNER_SERVICE_URL: http://app:3000/api/internal/signer/sign
      SIGNER_SERVICE_TOKEN: ${SIGNER_SERVICE_TOKEN:-}
      SYSTEM_USER_EMAIL: ${SYSTEM_USER_EMAIL:-system@aurareserve.io}
    command: ["pnpm", "exec", "tsx", "src/worker.ts"]
    networks:
      - aurareserve-network
```

Add `redis_data` to volumes:

```yaml
volumes:
  postgres_data:
    driver: local
  redis_data:
    driver: local
```

- [ ] **Step 2: Add Redis dev section to README.md**

Add a section to `README.md`:

```markdown
## Redis for Development

The job queue requires Redis. Options for local development:

### Option 1: Docker (recommended)

Start only Redis from docker-compose:

```bash
docker compose up redis -d
```

Redis will be available at `redis://localhost:6379`. Add to your `.env`:

```env
REDIS_URL="redis://localhost:6379"
```

### Option 2: System install

**macOS:**
```bash
brew install redis
brew services start redis
```

**Ubuntu/Debian:**
```bash
sudo apt install redis-server
sudo systemctl start redis
```

**Fedora:**
```bash
sudo dnf install redis
sudo systemctl start redis
```

### Running the worker locally

In a separate terminal:

```bash
pnpm worker
```
```

- [ ] **Step 3: Commit**

```bash
git add docker-compose.yml README.md
git commit -m "feat: add Redis + Worker to docker-compose, add Redis dev docs to README"
```

---

### Task 18: Final Verification

- [ ] **Step 1: Run full type-check**

```bash
pnpm type-check
```

Expected: PASS

- [ ] **Step 2: Run all tests**

```bash
pnpm test
```

Expected: All tests pass

- [ ] **Step 3: Run production build**

```bash
pnpm build
```

Expected: Build succeeds

- [ ] **Step 4: Verify Docker build**

```bash
docker compose build app
```

Expected: Build succeeds

- [ ] **Step 5: Final commit if any fixups needed**

```bash
git status
# If any uncommitted fixes, commit them
```
