/**
 * Playwright global setup for e2e tests.
 * 
 * This file runs once before all tests and sets up the test environment,
 * including database preparation, test user creation, and authentication state.
 */

const { execSync } = require('child_process');

async function globalSetup() {
  console.log('Setting up test environment...');
  
  // Set test environment variables
  process.env.DATABASE_URL = 'file:./test-e2e.db';
  process.env.NEXTAUTH_SECRET = 'test-secret-key-minimum-32-characters-long';
  process.env.NODE_ENV = 'test';
  
  try {
    // Generate Prisma client with test database
    console.log('Generating Prisma client...');
    execSync('npx prisma generate', { stdio: 'inherit' });
    
    // Push database schema (creates database if it doesn't exist)
    console.log('Setting up test database...');
    execSync('npx prisma db push --force-reset', { 
      stdio: 'inherit',
      env: { ...process.env, DATABASE_URL: 'file:./test-e2e.db' }
    });
    
    // Seed test data
    console.log('Seeding test data...');
    // You can add test data seeding logic here if needed
    
    console.log('✓ Test environment setup complete');
  } catch (error) {
    console.error('Failed to setup test environment:', error);
    process.exit(1);
  }
}

module.exports = globalSetup;