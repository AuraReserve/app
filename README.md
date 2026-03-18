# AuraReserve

A Web3 reserve auditing and proof-of-reserve platform for physical assets (gold, silver, gemstones, etc.). Built with Next.js 16, React 19, TypeScript, PostgreSQL, and Prisma. Uses a multi-tenant "Spaces" architecture where each Space is a separate reserve tracking context.

## Quick Start

```bash
pnpm install
cp .env.example .env       # Set at least DATABASE_URL
pnpm db:migrate
pnpm db:seed               # Optional: sample data
pnpm dev                   # http://localhost:3000
```

Requires Node.js 20+, pnpm 9+, and PostgreSQL 15+ (or Docker).

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Development server |
| `pnpm build` | Production build |
| `pnpm test` | Unit tests (Vitest) |
| `pnpm test:e2e` | E2E tests (Playwright) |
| `pnpm lint` | ESLint |
| `pnpm type-check` | TypeScript check |
| `pnpm db:migrate` | Run migrations |
| `pnpm db:studio` | Prisma Studio GUI |
| `pnpm db:seed` | Seed database |
| `pnpm db:reset` | Reset database |

## Docker

```bash
export POSTGRES_PASSWORD=change-me
export BETTER_AUTH_SECRET=$(openssl rand -base64 32)
docker compose up -d
```

See `.env.example` for all configuration options.

## Redis for Development

The job queue requires Redis. Options for local development:

### Option 1: Docker (recommended)

Start only Redis from docker-compose:

```bash
docker compose up redis -d
```

Redis will be available at `redis://localhost:6379`. Add to your `.env`:

```
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

### Redis URL format

The `REDIS_URL` follows the standard Redis URI format:

```
redis://[:password@]host[:port][/db]
```

Examples:

```bash
# No auth (local dev)
REDIS_URL="redis://localhost:6379"

# With password
REDIS_URL="redis://:mysecretpassword@localhost:6379"

# With password, specific database
REDIS_URL="redis://:mysecretpassword@redis.example.com:6379/0"

# With username + password (Redis 6+ ACL)
REDIS_URL="redis://myuser:mysecretpassword@redis.example.com:6379"

# TLS
REDIS_URL="rediss://:mysecretpassword@redis.example.com:6380"
```

### Running the worker

The worker is a separate process that picks up jobs from the queue (cron triggers, manual runs, on-change outputs, notifications). It requires the same `.env` as the app — it needs `DATABASE_URL`, `REDIS_URL`, and any integration-specific vars (e.g. `AVALANCHE_SIGNER_PRIVATE_KEY` for blockchain reads).

Start in a separate terminal:

```bash
pnpm worker
```

You should see:

```
[Queue] Synced N repeatable jobs, removed 0 orphans
[Worker] Startup sync complete
[Worker] Ready and processing jobs
```

The worker will now pick up and process any queued jobs. Cron-scheduled integrations will fire automatically based on their configured schedule.