/**
 * Test Database Setup Script
 * Initializes SQLite database for testing
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const TEST_DB_PATH = path.join(process.cwd(), 'test.db');
const TEST_ENV_PATH = path.join(process.cwd(), '.env.test');

async function setupTestDatabase() {
  console.log('🧪 Setting up test database...');

  try {
    // Remove existing test database if it exists
    if (fs.existsSync(TEST_DB_PATH)) {
      console.log('📂 Removing existing test database...');
      fs.unlinkSync(TEST_DB_PATH);
    }

    // Load test environment variables
    console.log('🔧 Loading test environment variables...');
    if (fs.existsSync(TEST_ENV_PATH)) {
      const envContent = fs.readFileSync(TEST_ENV_PATH, 'utf-8');
      envContent.split('\n').forEach((line) => {
        const trimmedLine = line.trim();
        if (trimmedLine && !trimmedLine.startsWith('#')) {
          const [key, ...valueParts] = trimmedLine.split('=');
          if (key && valueParts.length > 0) {
            process.env[key.trim()] = valueParts.join('=').trim();
          }
        }
      });
    }

    // Ensure DATABASE_URL is set
    process.env.DATABASE_URL = 'file:./test.db';

    // Generate SQLite schema from PostgreSQL schema
    console.log('📝 Generating SQLite schema...');
    execSync('pnpm exec tsx prisma/generate-sqlite-schema.ts', {
      stdio: 'inherit',
    });

    // Push schema to SQLite database
    console.log('📋 Pushing schema to test database...');
    execSync('pnpm exec prisma db push --accept-data-loss --schema=./prisma/.schema.sqlite.prisma', {
      stdio: 'inherit',
      env: {
        ...process.env,
        DATABASE_URL: 'file:./test.db',
      },
    });

    // Generate Prisma Client from SQLite schema
    console.log('🔨 Generating Prisma Client from SQLite schema...');
    execSync('pnpm exec prisma generate --schema=./prisma/.schema.sqlite.prisma', {
      stdio: 'inherit',
      env: {
        ...process.env,
        DATABASE_URL: 'file:./test.db',
      },
    });

    // Seed test database
    console.log('🌱 Seeding test database...');
    execSync('pnpm exec tsx prisma/seed.ts', {
      stdio: 'inherit',
      env: {
        ...process.env,
        DATABASE_URL: 'file:./test.db',
      },
    });

    console.log('✅ Test database setup complete!');
    console.log(`📍 Database location: ${TEST_DB_PATH}`);
  } catch (error) {
    console.error('❌ Error setting up test database:', error);
    process.exit(1);
  }
}

setupTestDatabase();
