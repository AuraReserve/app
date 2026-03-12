#!/bin/sh
set -e

echo "Starting AuraReserve..."

# Wait for database to be ready
echo "Waiting for database..."
until nc -z postgres 5432; do
  echo "Database is unavailable - sleeping"
  sleep 1
done

echo "Database is up"

# Run database migrations
echo "Running database migrations..."
pnpm exec prisma migrate deploy

echo "Migrations complete"

# Always deploy catalog defaults (asset types, integrations) — idempotent
echo "Deploying defaults..."
node -e "
const fs = require('fs');
const { Client } = require('pg');
(async () => {
  const sql = fs.readFileSync('prisma/deploy-defaults.sql', 'utf8');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  await client.query(sql);
  await client.end();
  console.log('Defaults deployed.');
})().catch(e => { console.error('Failed to deploy defaults:', e); process.exit(1); });
"

# Optionally run full seed script (set SEED_DATABASE=true to enable)
if [ "${SEED_DATABASE:-false}" = "true" ]; then
  echo "Running seed script..."
  pnpm exec tsx prisma/seed.ts
  echo "Seed complete"
fi

# Start the application
echo "Starting Next.js server..."
exec "$@"
