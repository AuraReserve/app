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

# Optionally run seed script (set SEED_DATABASE=true to enable)
if [ "${SEED_DATABASE:-false}" = "true" ]; then
  echo "Running seed script..."
  pnpm exec tsx prisma/seed.ts
  echo "Seed complete"
fi

# Start the application
echo "Starting Next.js server..."
exec "$@"
