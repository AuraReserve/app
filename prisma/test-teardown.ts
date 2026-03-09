/**
 * Test Database Teardown Script
 * Cleans up SQLite test database
 */

import * as fs from 'fs';
import * as path from 'path';

const TEST_DB_PATH = path.join(process.cwd(), 'test.db');
const TEST_DB_JOURNAL_PATH = path.join(process.cwd(), 'test.db-journal');

async function teardownTestDatabase() {
  console.log('🧹 Cleaning up test database...');

  try {
    // Remove test database
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
      console.log('✓ Removed test.db');
    }

    // Remove test database journal (if exists)
    if (fs.existsSync(TEST_DB_JOURNAL_PATH)) {
      fs.unlinkSync(TEST_DB_JOURNAL_PATH);
      console.log('✓ Removed test.db-journal');
    }

    console.log('✅ Test database cleanup complete!');
  } catch (error) {
    console.error('❌ Error cleaning up test database:', error);
    process.exit(1);
  }
}

teardownTestDatabase();
