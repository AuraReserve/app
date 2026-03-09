# Prisma Database Schema

This directory contains the database schema and related scripts for AuraReserve.

## Files

### Schema
- **`schema.prisma`** - Main PostgreSQL schema (source of truth)
- **`.schema.sqlite.prisma`** - Auto-generated SQLite schema (gitignored)

### Seed
- **`seed.ts`** - Unified seed file that works with both PostgreSQL and SQLite

### Scripts
- **`generate-sqlite-schema.ts`** - Generates SQLite schema from PostgreSQL schema
- **`test-setup.ts`** - Sets up SQLite test database
- **`test-teardown.ts`** - Cleans up SQLite test database

## How It Works

### Schema Generation

When running tests, the SQLite schema is automatically generated from the PostgreSQL schema:

1. Reads `schema.prisma`
2. Transforms PostgreSQL-specific types:
   - `String[]` → `String` with `@default("[]")`
   - `Json` → `String` with `@default("{}")`
   - `Json?` → `String?`
   - `provider = "postgresql"` → `provider = "sqlite"`
3. Writes to `.schema.sqlite.prisma`

### Seed File

The seed file automatically detects the database type:

```typescript
const isSQLite = process.env.DATABASE_URL?.startsWith('file:') ?? false;
```

For SQLite, it serializes arrays and JSON to strings:
- `serializeArray([...])` → `JSON.stringify([...])`
- `serializeJson({...})` → `JSON.stringify({...})`

For PostgreSQL, it uses native types.

## Development Workflow

### Using PostgreSQL (Development)
```bash
# Generate client
pnpm db:generate

# Push schema to database
pnpm db:push

# Seed database
pnpm db:seed
```

### Using SQLite (Testing)
```bash
# Setup test database (generates schema, pushes to SQLite, seeds)
pnpm db:test:setup

# Reset test database
pnpm db:test:reset

# Cleanup test database
pnpm db:test:teardown
```

## Important Notes

1. **Always edit `schema.prisma`** - Never edit `.schema.sqlite.prisma` (it's auto-generated)

2. **After testing** - Run `pnpm db:generate` to regenerate the PostgreSQL client for development

3. **Schema changes** - When you modify `schema.prisma`:
   - For PostgreSQL: `pnpm db:push` or create a migration
   - For SQLite tests: Run `pnpm db:test:reset` to regenerate

4. **Type safety** - During test runs, Prisma Client is generated from the SQLite schema, so array fields will be typed as `string` instead of `string[]`. After tests, regenerate from PostgreSQL schema.

## Schema Differences

| Feature | PostgreSQL | SQLite |
|---------|-----------|--------|
| Arrays | `String[]` | `String` (JSON stringified) |
| JSON | `Json` | `String` (JSON stringified) |
| Default values | Native arrays/objects | JSON strings |
| Provider | `postgresql` | `sqlite` |

See `/TESTING.md` for more details on testing with SQLite.
