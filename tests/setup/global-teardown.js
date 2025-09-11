/**
 * Playwright global teardown for e2e tests.
 * 
 * This file runs once after all tests complete and cleans up the test
 * environment, including removing test databases and temporary files.
 */

const fs = require('fs');
const path = require('path');

async function globalTeardown() {
  console.log('Cleaning up test environment...');
  
  try {
    // Remove test database
    const testDbPath = path.join(process.cwd(), 'test-e2e.db');
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
      console.log('✓ Test database removed');
    }
    
    // Remove any temporary test files
    const tempFiles = ['test-e2e.db-journal'];
    tempFiles.forEach(file => {
      const filePath = path.join(process.cwd(), file);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    });
    
    console.log('✓ Test environment cleanup complete');
  } catch (error) {
    console.error('Failed to cleanup test environment:', error);
  }
}

module.exports = globalTeardown;