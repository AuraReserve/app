#!/bin/bash
# Apply the auditor role migration to the database

echo "Applying migration to add AUDITOR role..."

# Run the SQL migration inside the Docker container
docker compose exec -T aurareserve-db psql -U postgres -d aurareserve << 'SQL'
-- Add AUDITOR role to space_role enum
ALTER TYPE "space_role" ADD VALUE IF NOT EXISTS 'auditor';

-- Verify the enum values
SELECT enumlabel FROM pg_enum WHERE enumtypid = 'space_role'::regtype ORDER BY enumsortorder;
SQL

echo "Migration completed!"
