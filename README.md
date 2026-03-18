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

### Running the worker locally

In a separate terminal:

```bash
pnpm worker
```