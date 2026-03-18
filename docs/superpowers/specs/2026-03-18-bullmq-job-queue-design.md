# BullMQ Job Queue Integration Design

**Date:** 2026-03-18
**Status:** Draft

## Problem

AuraReserve has a fully built integration runner system with cron expression parsing, handler registry, and run logging. However, there is no scheduler actually triggering cron jobs. The `/api/cron/` directory is empty. Cron-configured integrations never fire. Additionally, manual and on-change triggers execute inline (blocking the request), there are no retries on failure, no failure notifications, and no horizontal scaling.

## Solution

Introduce BullMQ (backed by Redis) as the job queue for all integration execution — cron, manual, and on-change triggers. Workers run as separate Docker containers, executing jobs directly (importing `runSpaceIntegration()` from the shared codebase). Blockchain signing is delegated to a signer service for secret isolation.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Deployment model | Docker Compose (self-hosted) | Primary deployment target |
| Worker process | Separate container | Scales independently, doesn't affect web performance |
| Job execution model | Direct execution (workers import business logic) | Workers actually absorb compute load when scaled |
| Blockchain signing | Signer service (JSON-RPC, embedded in app Phase 1) | Secret isolation — workers never touch private keys |
| Cron scheduling | BullMQ repeatable jobs | Native cron support, replaces custom `isCronDue()` parser |
| Retry behavior | Per-integration configurable (attempts + backoff) | Different integration types have different failure characteristics |
| Failure handling | Log + notify (in-app + webhook channels, extensible) | Space admins need visibility into failures |
| Admin dashboard | Integrated into admin UI at `/admin/jobs` | Owner-only job monitoring with retry/cleanup actions |

## Architecture

### Queue Layout

A single queue called `integrations` with typed jobs:

| Job Type | Trigger | Description |
|----------|---------|-------------|
| `integration.run` | All triggers | Executes `runSpaceIntegration()` with the given ID and options |
| `integration.notify` | Failed jobs | Creates notification record and fans out to configured channels |
| `notification.deliver` | Notify worker | Delivers to a specific channel (webhook, email, etc.) |

One queue rather than multiple because all jobs call the same `runSpaceIntegration()` — the handler registry dispatches to the correct handler. BullMQ repeatable jobs handle cron scheduling natively. ON_CHANGE and manual triggers add a regular job.

**Known limitation:** All job types share the same concurrency limit. At low volume (Phase 1) this is fine. If notification delivery volume grows to the point where it delays integration runs, split into two queues: `integrations` for `integration.run` and `notifications` for `integration.notify` + `notification.deliver`.

### Job Data Shapes

```typescript
interface IntegrationRunJobData {
  spaceIntegrationId: string;
  trigger: "cron" | "manual" | "on_change";
  options?: RunOptions; // existing RunOptions from runner.ts
}

interface NotifyJobData {
  spaceIntegrationId: string;
  error: string;
  failedAt: string;
  attemptsMade: number;
}

interface DeliverJobData {
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
```

### Job Lifecycle

**Cron**: BullMQ repeatable fires → adds `integration.run` job → worker calls `runSpaceIntegration()` → logs result via existing `createRunLog()`.

**Manual**: API route enqueues `integration.run` job → returns `202 Accepted` with job ID → worker processes async.

**ON_CHANGE**: `runOnChangeOutputs()` enqueues one job per matching output instead of executing inline.

**Failure**: Worker checks the return value of `runSpaceIntegration()`. If `success === false`, the worker throws an error so BullMQ treats it as a failure and retries. Some failures are non-retryable (e.g. "Integration is INACTIVE", "No input handler found") — the worker identifies these and throws with `UnrecoverableError` so BullMQ skips retries. On final failure (all retries exhausted), the worker enqueues `integration.notify` job. Run logging happens inside `runSpaceIntegration()` itself via `createRunLog()` on every attempt.

### Full Flow Example (Cron)

```
BullMQ scheduler (in Redis)
  ↓  enqueues job every N minutes per cron expression
Redis queue
  ↓  worker picks it up (exactly one worker, even with 20 running)
Worker container
  ↓  calls runSpaceIntegration() directly (same codebase)
runSpaceIntegration("clx123...")
  ↓  loads config from DB, determines direction + handler key
Handler (e.g. blockchainInputHandler)
  ↓  calls RPC, reads contract value
Returns { value: 1250.5 }
  ↓  runSpaceIntegration creates StreamEntry in DB
  ↓  creates IntegrationRunLog in DB
Worker marks job as completed in BullMQ
```

## Sync: BullMQ Repeatables ↔ Database

When a user creates, updates, or deletes an integration with `trigger: CRON`, the corresponding BullMQ repeatable job must be upserted or removed.

### Sync Functions (`src/lib/queue/sync.ts`)

- `syncRepeatableJob(spaceIntegrationId)` — reads DB, upserts repeatable in BullMQ
- `removeRepeatableJob(spaceIntegrationId)` — removes repeatable by key
- `syncAllRepeatables()` — bulk reconciliation on worker startup

### When Sync Happens

| Event | Action |
|-------|--------|
| Create integration with `trigger: CRON` | `syncRepeatableJob()` |
| Update trigger to `CRON` or change schedule | `syncRepeatableJob()` |
| Update trigger away from `CRON` | `removeRepeatableJob()` |
| Delete integration | `removeRepeatableJob()` |
| Disable integration (`status: INACTIVE`) | `removeRepeatableJob()` |
| Worker starts | `syncAllRepeatables()` — full reconciliation from DB |

### Repeatable Job Key

Uses `spaceIntegrationId` as the BullMQ repeat key so each integration maps to exactly one repeatable. Changing the schedule removes the old repeatable and creates a new one.

### `syncAllRepeatables()` Reconciliation Strategy

On worker startup, full reconciliation runs:

1. List all BullMQ repeatable job schedulers from Redis
2. Query all active `SpaceIntegration` records with `trigger: CRON` from DB
3. Remove any BullMQ repeatables not present in DB (orphan cleanup)
4. Upsert repeatables from DB (handles cron expression changes — old schedule gets replaced)

If two workers start simultaneously, BullMQ's `upsertJobScheduler()` is idempotent — duplicate upserts are safe. Orphan removal uses the repeatable key (spaceIntegrationId), which is deterministic.

### Graceful Degradation

If Redis is unreachable when the DAL writes, log a warning but don't fail the DB operation. The worker's startup reconciliation catches drift.

If Redis loses data between restarts, `syncAllRepeatables()` on worker startup is the recovery mechanism — it rebuilds all repeatable schedules from the DB as the source of truth.

## Retry Configuration

### Schema Addition (SpaceIntegration)

```prisma
maxAttempts      Int       @default(3) @map("max_attempts")      // total attempts including initial (3 = 1 initial + 2 retries)
retryBackoff     Int       @default(30) @map("retry_backoff")    // seconds, base for exponential
```

These map directly to BullMQ job options:
- `maxAttempts` → `attempts` (BullMQ's `attempts` includes the initial attempt, so `maxAttempts: 3` means 1 initial + 2 retries)
- `retryBackoff` → `backoff: { type: 'exponential', delay: retryBackoff * 1000 }`

Users configure these in the existing integration settings UI alongside trigger and schedule.

## Signer Service

Workers execute handlers directly, including blockchain handlers. To avoid distributing private keys to every worker, blockchain signing is delegated to a signer service.

### Interface (JSON-RPC, EIP-1193 aligned)

```typescript
// Request — compatible with Fireblocks, AWS KMS signers, WalletConnect
interface SignRequest {
  jsonrpc: "2.0";
  method: "eth_signTransaction" | "personal_sign" | "eth_signTypedData_v4" | "eth_accounts";
  params: unknown[];  // shape varies by method (see below)
  id: number;
}

// eth_signTransaction params:
//   [{ from?, to, data?, value?, chainId, gas?, maxFeePerGas?, maxPriorityFeePerGas?, nonce? }]
// personal_sign params:
//   [message: string, address: string]
// eth_signTypedData_v4 params:
//   [address: string, typedData: string]
// eth_accounts params:
//   [] (no params)

interface SignResponse {
  jsonrpc: "2.0";
  result: string;            // signed tx hex (or address list for eth_accounts)
  id: number;
}
```

### Supported Methods

| Method | Use case |
|--------|----------|
| `eth_signTransaction` | Blockchain writes (primary) |
| `personal_sign` | Message signing (proof-of-reserve attestations) |
| `eth_signTypedData_v4` | EIP-712 structured data signing (typed attestations) |
| `eth_accounts` | List available signer addresses |

### Phase 1 — Embedded in Next.js App

- `POST /api/internal/signer/sign` — authenticated with `SIGNER_SERVICE_TOKEN`
- Backend: reads `AVALANCHE_SIGNER_PRIVATE_KEY` from env, signs with `viem`
- Single signer profile ("default")

### Phase 2 — Extractable

- Move to standalone service, swap URL via `SIGNER_SERVICE_URL` env var
- Add Fireblocks/KMS backends behind the same JSON-RPC interface
- Multiple signer profiles (e.g. "avalanche-hot", "ethereum-custody")
- Zero code changes in workers or handlers — only URL changes

### Impact on Blockchain Output Handler

Current flow:
```
handler receives context → build tx → sign tx → broadcast tx
```

New flow:
```
handler receives context → build unsigned tx → POST to signer (JSON-RPC) → broadcast signed tx
```

The handler calls `signTransaction()` from `src/lib/signer/client.ts`, which abstracts the HTTP call. Workers don't know or care whether the signer is local or remote. Pointing `SIGNER_SERVICE_URL` at a Fireblocks endpoint or any JSON-RPC compatible signer works without code changes.

## Failure Notifications

When a job exhausts all retries, the worker enqueues an `integration.notify` job. The notification worker creates a DB record and fans out to configured channels.

### Notification Channel Registry

Same pattern as the integration handler registry — pluggable handlers behind a registry.

Phase 1 channels: `in-app` (DB record) + `webhook` (POST to URL). Email is a known near-term addition.

### Schema Additions

```prisma
model Notification {
  id              String   @id @default(cuid())
  spaceId         String   @map("space_id")
  type            String                          // "integration_failure", extensible
  title           String
  message         String
  metadata        Json     @default("{}")         // { spaceIntegrationId, error, attemptsMade }
  read            Boolean  @default(false)
  createdDate     DateTime @default(now()) @map("created_date")

  space           Space    @relation(fields: [spaceId], references: [id], onDelete: Cascade)

  @@index([spaceId, read])
  @@map("notifications")
}

model NotificationChannel {
  id        String   @id @default(cuid())
  spaceId   String   @map("space_id")
  name      String                        // user-defined label (e.g. "PagerDuty webhook", "Ops Slack")
  type      String                        // "webhook", "email", "telegram", "teams", "slack"
  config    Json     @default("{}")       // { url, token, chatId, ... }
  enabled   Boolean  @default(true)

  space     Space    @relation(fields: [spaceId], references: [id], onDelete: Cascade)

  @@index([spaceId])
  @@map("notification_channels")
}
```

### Notification Flow

```
Job fails all retries
  → worker enqueues integration.notify
  → notify worker:
      1. Creates Notification record in DB (always — for in-app UI)
      2. Reads space's configured channels
      3. Enqueues one notification.deliver job per enabled channel
  → channel workers execute independently:
      - webhook handler → POST to configured URL
      - (future) email handler → send email
      - (future) telegram handler → Telegram Bot API
```

### Webhook Payload

```json
{
  "event": "integration.failed",
  "space": { "id": "...", "name": "ACC Gold" },
  "integration": { "id": "...", "key": "blockchain-read", "name": "..." },
  "error": "RPC timeout after 3 attempts",
  "attemptsMade": 3,
  "failedAt": "2026-03-18T14:30:00Z"
}
```

Notification delivery jobs have fixed retry (3 attempts, 30s backoff) — not user-configurable.

## Admin Dashboard

**Location**: `/admin/jobs` — accessible to platform owners only.

**API route**: `GET /api/admin/jobs` — reads queue state from BullMQ directly.

### Page Sections

| Section | Shows |
|---------|-------|
| Queue overview | Total jobs, active, waiting, completed, failed, delayed counts |
| Active jobs | Currently processing jobs with progress |
| Failed jobs | Failed jobs with error, retry count, timestamps. "Retry" button |
| Scheduled | Upcoming repeatable jobs with next run time and cron expression |
| Completed | Recent completed jobs (last 100) with duration |

### Actions

- Retry a failed job
- Remove a failed job
- Pause/resume the queue
- Clean completed jobs older than N days

Uses `@bull-board/api` for reading queue state, rendered with custom React components matching the existing admin UI.

## New Files

```
src/lib/queue/
├── connection.ts              # ioredis connection, reads REDIS_URL
├── queues.ts                  # Queue definitions
├── jobs.ts                    # Job types, enqueue helpers
├── workers/
│   ├── integration.worker.ts  # Processes integration.run jobs
│   └── notification.worker.ts # Processes integration.notify + notification.deliver
└── sync.ts                    # Sync DB ↔ BullMQ repeatables

src/lib/signer/
├── client.ts                  # signTransaction() — JSON-RPC client
├── types.ts                   # JSON-RPC sign request/response types
└── handlers/
    └── local.ts               # Phase 1: sign with env var key

src/lib/notifications/
├── registry.ts                # Channel handler registry
└── channels/
    ├── in-app.ts              # Creates Notification DB record
    └── webhook.ts             # POSTs to configured URL

src/app/api/internal/
└── signer/sign/route.ts       # JSON-RPC signing endpoint

src/app/admin/jobs/
├── page.tsx                   # Admin jobs dashboard
└── page-client.tsx            # Client component

src/app/api/admin/jobs/
└── route.ts                   # Queue stats + job listing API

src/worker.ts                  # Standalone worker entrypoint
```

## Worker Process Details

### Entrypoint (`src/worker.ts`)

The worker runs via `tsx src/worker.ts` (tsx is already installed in the Docker image for seed/migration scripts). No separate build step needed.

### Graceful Shutdown

The worker registers `SIGTERM` and `SIGINT` handlers to:
1. Stop accepting new jobs
2. Wait for active jobs to complete (with a timeout)
3. Call `worker.close()` to cleanly disconnect from Redis

This is important for Docker containers, which send `SIGTERM` on `docker stop`.

### Error Classification in the Worker Processor

`runSpaceIntegration()` returns `{ success: false }` for many failure paths without throwing. The worker processor must convert these into errors for BullMQ:

**Non-retryable failures** (throw `UnrecoverableError`):
- "Integration is INACTIVE" — won't become active on retry
- "No input handler found" — configuration problem
- "Manual input requires a value" — missing data, won't appear on retry

**Retryable failures** (throw regular `Error`):
- Handler errors (RPC timeout, API 500, network issues)
- "No stream entry available for output" — entry may arrive before retry

The worker inspects the error message to classify. BullMQ's `UnrecoverableError` skips remaining retries and moves the job directly to failed.

### Job ID Correlation

The worker stores the BullMQ job ID in the run log metadata so the admin dashboard can link jobs to their log entries.

## Modified Files

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add `maxAttempts`, `retryBackoff` to SpaceIntegration. Add `Notification`, `NotificationChannel` models. Add `notifications Notification[]` and `notificationChannels NotificationChannel[]` reverse relations to `Space` model |
| `src/lib/dal/data-inputs.ts` | Call `syncRepeatableJob()` / `removeRepeatableJob()` after create/update |
| `src/lib/dal/data-outputs.ts` | Same as above |
| `src/lib/integrations/runner.ts` | Delete `isCronDue()`, `cronMatches()`, `parseCronField()`, `runScheduledIntegrations()`. Change `runOnChangeOutputs()` to enqueue instead of execute inline. Note: `runOnChangeOutputs()` is currently defined but not called anywhere — a caller must be added in the stream entry creation flow (e.g. `createEntry()` in `src/lib/dal/stream-entries.ts`) |
| `src/lib/integrations/handlers/output/blockchain.ts` | Split into build unsigned tx → call signer → broadcast |
| `src/app/api/spaces/[spaceId]/data-inputs/[inputId]/run/route.ts` | Enqueue job instead of direct execution, return 202 |
| `src/app/api/spaces/[spaceId]/data-outputs/[outputId]/run/route.ts` | Same as above |
| `src/app/admin/layout.tsx` | Add "Jobs" item to `adminNavItems` array |
| `docker-compose.yml` | Add redis + worker services |
| `Dockerfile` | No changes needed — `tsx` is already installed in the runner stage (used for seed/migration). Worker runs via `tsx src/worker.ts` |
| `.env.example` | Add `REDIS_URL`, `SIGNER_SERVICE_URL`, `SIGNER_SERVICE_TOKEN` |
| `package.json` | Add `bullmq`, `ioredis`, worker script |
| `README.md` | Redis setup for development section |

## Deleted Code

- `runner.ts`: `isCronDue()`, `cronMatches()`, `parseCronField()`, `runScheduledIntegrations()` (~150 lines) — replaced by BullMQ repeatable jobs
- `/src/app/api/cron/` directory (empty, no longer needed)

## What Stays Unchanged

- `runSpaceIntegration()` — still the core executor, called by workers directly
- Handler registry pattern — untouched
- All existing handlers except blockchain output (which gets the signer split)
- UI for configuring trigger type + cron expression (just adds retry config fields)
- `createRunLog()` and run logging — still called from `runSpaceIntegration()`

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `REDIS_URL` | Yes (if using queues) | `redis://localhost:6379` | Redis connection for BullMQ |
| `SIGNER_SERVICE_URL` | No | `http://localhost:3000/api/internal/signer/sign` | Signing service endpoint |
| `SIGNER_SERVICE_TOKEN` | Yes (if signer enabled) | — | Auth token for signer service |

## Docker Compose Additions

```yaml
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
    # Same env as app (DB, secrets, etc.) plus:
    REDIS_URL: redis://redis:6379
  command: ["pnpm", "exec", "tsx", "src/worker.ts"]
  networks:
    - aurareserve-network
```
