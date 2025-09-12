#!/usr/bin/env tsx

/**
 * Database extensions validation and testing script.
 * 
 * This script tests the availability and functionality of PostgreSQL extensions
 * required for the search functionality. It can be run during development setup
 * or deployment validation.
 * 
 * Usage:
 *   npm run test:extensions
 *   or
 *   tsx scripts/test-extensions.ts
 * 
 * @since 1.4.0
 */

// Load environment variables from .env.local for testing
import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env.local first, then .env
config({ path: resolve(process.cwd(), '.env.local') });
config({ path: resolve(process.cwd(), '.env') });

import { 
  checkExtensionAvailability, 
  installExtensions, 
  validateDatabaseConfiguration,
  getSearchConfiguration 
} from '@/lib/db/extensions';
import { prisma } from '@/lib/db';

interface TestResult {
  name: string;
  success: boolean;
  message: string;
  duration: number;
}

async function runTest(name: string, testFn: () => Promise<void>): Promise<TestResult> {
  const startTime = Date.now();
  try {
    await testFn();
    return {
      name,
      success: true,
      message: 'PASSED',
      duration: Date.now() - startTime,
    };
  } catch (error) {
    return {
      name,
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error',
      duration: Date.now() - startTime,
    };
  }
}

async function testDatabaseConnection(): Promise<void> {
  await prisma.$queryRaw`SELECT 1 as connection_test`;
  console.log('✓ Database connection successful');
}

async function testExtensionAvailability(): Promise<void> {
  const extensions = await checkExtensionAvailability();
  
  console.log('Extension Status:');
  console.log(`  pg_trgm: ${extensions.pg_trgm ? '✓' : '✗'}`);
  console.log(`  unaccent: ${extensions.unaccent ? '✓' : '✗'}`);
  console.log(`  uuid_ossp: ${extensions.uuid_ossp ? '✓' : '✗'}`);
  console.log(`  Full-text search capable: ${extensions.fullTextSearchCapable ? '✓' : '✗'}`);
  
  if (!extensions.fullTextSearchCapable) {
    console.warn('⚠ Full-text search will use fallback ILIKE implementation');
  }
}

async function testExtensionFunctionality(): Promise<void> {
  try {
    // Test UUID generation
    const uuid = await prisma.$queryRaw<Array<{uuid: string}>>`SELECT uuid_generate_v4() as uuid`;
    console.log(`✓ UUID generation working: ${uuid[0]?.uuid}`);
  } catch (error) {
    console.log('✗ UUID generation using fallback (uuid-ossp not available)');
  }

  try {
    // Test trigram functionality
    const similarity = await prisma.$queryRaw<Array<{similarity: number}>>`
      SELECT similarity('test', 'tset') as similarity
    `;
    console.log(`✓ Trigram similarity working: ${similarity[0]?.similarity}`);
  } catch (error) {
    console.log('✗ Trigram functionality not available (pg_trgm not installed)');
  }

  try {
    // Test unaccent functionality
    const unaccented = await prisma.$queryRaw<Array<{unaccented: string}>>`
      SELECT unaccent('café') as unaccented
    `;
    console.log(`✓ Unaccent working: "${unaccented[0]?.unaccented}"`);
  } catch (error) {
    console.log('✗ Unaccent functionality not available (unaccent not installed)');
  }
}

async function testSearchVectorGeneration(): Promise<void> {
  try {
    // Test tsvector generation
    const vector = await prisma.$queryRaw<Array<{vector: string}>>`
      SELECT to_tsvector('english', 'test item description') as vector
    `;
    console.log(`✓ Search vector generation working`);
  } catch (error) {
    throw new Error(`Search vector generation failed: ${error}`);
  }
}

async function testSearchConfiguration(): Promise<void> {
  const config = await getSearchConfiguration();
  
  console.log('Search Configuration:');
  console.log(`  Use Full-Text Search: ${config.useFullTextSearch}`);
  console.log(`  Use Trigram Search: ${config.useTrigramSearch}`);
  console.log(`  Use Unaccent: ${config.useUnaccent}`);
  console.log(`  Indexing Strategy: ${config.indexingStrategy}`);
  console.log(`  Fallback to ILIKE: ${config.fallbackToIlike}`);
}

async function main(): Promise<void> {
  console.log('🔍 PostgreSQL Extensions Test Suite');
  console.log('=====================================\n');

  const tests = [
    runTest('Database Connection', testDatabaseConnection),
    runTest('Extension Availability Check', testExtensionAvailability),
    runTest('Extension Functionality Test', testExtensionFunctionality),
    runTest('Search Vector Generation', testSearchVectorGeneration),
    runTest('Search Configuration', testSearchConfiguration),
  ];

  const results = await Promise.all(tests);
  
  console.log('\n📊 Test Results Summary:');
  console.log('========================');
  
  let totalPassed = 0;
  let totalDuration = 0;
  
  for (const result of results) {
    const status = result.success ? '✅ PASS' : '❌ FAIL';
    console.log(`${status} ${result.name} (${result.duration}ms)`);
    
    if (!result.success) {
      console.log(`     Error: ${result.message}`);
    }
    
    if (result.success) totalPassed++;
    totalDuration += result.duration;
  }

  console.log(`\nResults: ${totalPassed}/${results.length} tests passed in ${totalDuration}ms`);

  // Run database validation
  console.log('\n🔧 Database Configuration Validation:');
  console.log('====================================');
  
  const validation = await validateDatabaseConfiguration();
  
  if (validation.valid) {
    console.log('✅ Database configuration is valid');
  } else {
    console.log('❌ Database configuration has issues');
  }

  if (validation.warnings.length > 0) {
    console.log('\n⚠️  Warnings:');
    validation.warnings.forEach(warning => console.log(`   - ${warning}`));
  }

  if (validation.recommendations.length > 0) {
    console.log('\n💡 Recommendations:');
    validation.recommendations.forEach(rec => console.log(`   - ${rec}`));
  }

  // Suggest extension installation if needed
  if (!validation.valid || validation.warnings.length > 0) {
    console.log('\n🛠️  Auto-installing missing extensions...');
    try {
      const postInstallStatus = await installExtensions();
      console.log('✅ Extension installation completed');
      
      if (postInstallStatus.fullTextSearchCapable) {
        console.log('✅ Full-text search is now available');
      } else {
        console.log('⚠️  Full-text search still unavailable - will use fallback');
      }
    } catch (error) {
      console.log(`❌ Extension installation failed: ${error}`);
      console.log('   Manual installation may be required');
    }
  }

  console.log('\n✨ Extension testing completed');
  
  if (totalPassed < results.length) {
    process.exit(1);
  }
}

// Handle cleanup
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

// Run the tests
main().catch((error) => {
  console.error('❌ Test suite failed:', error);
  process.exit(1);
});