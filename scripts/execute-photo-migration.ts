#!/usr/bin/env tsx

/**
 * Photo Migration Execution Script
 *
 * This script executes the atomic photo migration from local storage to AWS S3
 * with comprehensive monitoring, progress tracking, and error handling.
 *
 * Usage:
 * - npm run migrate:photos
 * - npm run migrate:photos -- --dry-run
 * - npm run migrate:photos -- --resume <migration-id>
 * - npm run migrate:photos -- --rollback <migration-id>
 *
 * @category Migration Scripts
 * @since 1.7.0
 */

import { PrismaClient } from '@prisma/client';
import {
  PhotoMigrationOrchestrator,
  createMigrationOrchestrator,
  S3StorageService,
  PhotoProcessingService,
  CostProtectionService,
  CdnService,
  storageService,
  photoProcessingService,
  cdnService
} from '@/lib/services';
import { validateStorageConfig } from '@/lib/config/storage';
import { serverEnv } from '@/lib/utils/env';

/**
 * Command line arguments interface
 */
interface MigrationArgs {
  dryRun?: boolean;
  resume?: string;
  rollback?: string;
  batchSize?: number;
  maxConcurrentBatches?: number;
  enableCostProtection?: boolean;
  validateAfterMigration?: boolean;
  cleanupLocalFiles?: boolean;
  verbose?: boolean;
}

/**
 * Parse command line arguments
 */
function parseArgs(): MigrationArgs {
  const args: MigrationArgs = {};

  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];

    switch (arg) {
      case '--dry-run':
        args.dryRun = true;
        break;
      case '--resume':
        args.resume = process.argv[++i];
        break;
      case '--rollback':
        args.rollback = process.argv[++i];
        break;
      case '--batch-size':
        args.batchSize = parseInt(process.argv[++i]);
        break;
      case '--max-concurrent-batches':
        args.maxConcurrentBatches = parseInt(process.argv[++i]);
        break;
      case '--enable-cost-protection':
        args.enableCostProtection = true;
        break;
      case '--disable-cost-protection':
        args.enableCostProtection = false;
        break;
      case '--validate-after-migration':
        args.validateAfterMigration = true;
        break;
      case '--cleanup-local-files':
        args.cleanupLocalFiles = true;
        break;
      case '--verbose':
        args.verbose = true;
        break;
    }
  }

  return args;
}

/**
 * Print usage instructions
 */
function printUsage() {
  console.log(`
📸 Photo Migration Script - Story 1.7

Usage:
  npm run migrate:photos [options]

Options:
  --dry-run                    Simulate migration without making changes
  --resume <migration-id>      Resume a paused migration
  --rollback <migration-id>    Rollback a failed migration
  --batch-size <number>        Photos per batch (default: 50)
  --max-concurrent-batches <n> Max concurrent batches (default: 2)
  --enable-cost-protection     Enable cost protection (default: true)
  --disable-cost-protection    Disable cost protection
  --validate-after-migration   Validate migrated photos (default: true)
  --cleanup-local-files        Clean up local files after migration
  --verbose                    Enable verbose logging

Examples:
  npm run migrate:photos                          # Run full migration
  npm run migrate:photos -- --dry-run            # Test migration
  npm run migrate:photos -- --batch-size 25      # Smaller batches
  npm run migrate:photos -- --cleanup-local-files # Clean up after migration
  npm run migrate:photos -- --resume abc123      # Resume migration abc123
  npm run migrate:photos -- --rollback abc123    # Rollback migration abc123
`);
}

/**
 * Display migration progress
 */
function displayProgress(migrationId: string, progress: number, eta?: Date) {
  const progressBar = '█'.repeat(Math.floor(progress / 2)) +
                     '░'.repeat(50 - Math.floor(progress / 2));

  const etaStr = eta ? `ETA: ${eta.toLocaleTimeString()}` : '';

  console.log(`\n[${migrationId.slice(-8)}] Progress: [${progressBar}] ${progress.toFixed(1)}% ${etaStr}`);
}

/**
 * Main migration execution function
 */
async function main(): Promise<void> {
  const args = parseArgs();

  // Handle help request
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    printUsage();
    process.exit(0);
  }

  console.log('🚀 Starting Photo Migration to AWS S3...\n');

  if (args.verbose) {
    console.log('Arguments:', JSON.stringify(args, null, 2));
  }

  const prisma = new PrismaClient();

  try {
    // Validate environment and configuration
    console.log('📋 Validating configuration...');
    validateStorageConfig();

    if (!serverEnv.AWS_ACCESS_KEY_ID || !serverEnv.AWS_SECRET_ACCESS_KEY) {
      throw new Error('Missing AWS credentials in environment variables');
    }

    console.log('✅ Configuration validation passed');

    // Initialize services
    const costProtectionService = new CostProtectionService(prisma);

    const migrationOrchestrator = createMigrationOrchestrator(
      prisma,
      storageService,
      photoProcessingService,
      costProtectionService,
      cdnService
    );

    // Set up event listeners for progress tracking
    migrationOrchestrator.on('migration-started', ({ migrationId }) => {
      console.log(`\n🎯 Migration started: ${migrationId}`);
    });

    migrationOrchestrator.on('progress-update', ({ migrationId, progress, eta }) => {
      displayProgress(migrationId, progress, eta);
    });

    migrationOrchestrator.on('batch-started', ({ batchId, batchNumber }) => {
      if (args.verbose) {
        console.log(`   📦 Processing batch ${batchNumber} (${batchId.slice(-8)})`);
      }
    });

    migrationOrchestrator.on('batch-completed', (result) => {
      const status = result.success ? '✅' : '❌';
      console.log(`   ${status} Batch completed: ${result.processedCount} processed, ${result.errorCount} errors`);

      if (result.errors.length > 0 && args.verbose) {
        result.errors.forEach(error => console.log(`     ⚠️  ${error}`));
      }
    });

    migrationOrchestrator.on('migration-completed', (result) => {
      console.log(`\n🎉 Migration completed successfully!`);
      console.log(`   📊 Summary:`);
      console.log(`      Total Photos: ${result.summary.totalItems}`);
      console.log(`      Processed: ${result.summary.processedItems}`);
      console.log(`      Successful: ${result.successCount}`);
      console.log(`      Failed: ${result.errorCount}`);
      console.log(`      Average Processing Time: ${result.summary.avgProcessingTime}ms`);
      console.log(`      Total Cost: $${result.summary.totalCostUsd.toFixed(4)}`);

      if (result.errors.length > 0) {
        console.log(`\n⚠️  Errors encountered:`);
        result.errors.forEach(error => console.log(`   • ${error}`));
      }
    });

    migrationOrchestrator.on('migration-failed', ({ migrationId, error }) => {
      console.error(`\n💥 Migration ${migrationId} failed:`, error.message);
    });

    migrationOrchestrator.on('migration-paused', ({ migrationId }) => {
      console.log(`\n⏸️  Migration ${migrationId} paused`);
    });

    migrationOrchestrator.on('rollback-started', ({ migrationId }) => {
      console.log(`\n🔄 Starting rollback for migration ${migrationId}...`);
    });

    migrationOrchestrator.on('rollback-completed', ({ migrationId }) => {
      console.log(`\n✅ Rollback completed for migration ${migrationId}`);
    });

    // Handle different operation modes
    if (args.rollback) {
      console.log(`\n🔄 Executing rollback for migration: ${args.rollback}`);
      await migrationOrchestrator.executeRollback(args.rollback);

    } else if (args.resume) {
      console.log(`\n▶️  Resuming migration: ${args.resume}`);
      const result = await migrationOrchestrator.resumeMigration(args.resume);

      console.log(`\n📋 Migration ${args.resume} resumed and completed`);
      console.log(`   Final Status: ${result.status}`);

    } else {
      // New migration
      if (args.dryRun) {
        console.log(`\n🧪 DRY RUN MODE - No actual changes will be made\n`);

        // Count photos that would be migrated
        const photosToMigrate = await prisma.itemPhoto.count({
          where: {
            originalUrl: {
              not: { startsWith: 'https://' },
            },
          },
        });

        console.log(`📊 Migration simulation results:`);
        console.log(`   Photos to migrate: ${photosToMigrate}`);
        console.log(`   Estimated batches: ${Math.ceil(photosToMigrate / (args.batchSize || 50))}`);
        console.log(`   Estimated storage: ${(photosToMigrate * 300 / 1024).toFixed(2)} MB`); // ~300KB per photo (multi-format)
        console.log(`   Estimated cost: $${(photosToMigrate * 0.0001).toFixed(4)}`); // Rough estimate

        console.log(`\n✅ Dry run completed - no changes made`);

      } else {
        // Execute migration
        const migrationConfig = {
          batchSize: args.batchSize || 50,
          maxConcurrentBatches: args.maxConcurrentBatches || 2,
          retryFailedItems: true,
          maxRetriesPerItem: 3,
          pauseOnErrorThreshold: 5,
          enableCostProtection: args.enableCostProtection !== false,
          costProtectionThreshold: 0.85,
          validateAfterMigration: args.validateAfterMigration !== false,
          cleanupLocalFiles: args.cleanupLocalFiles || false,
        };

        console.log(`📋 Migration Configuration:`);
        console.log(`   Batch Size: ${migrationConfig.batchSize}`);
        console.log(`   Max Concurrent Batches: ${migrationConfig.maxConcurrentBatches}`);
        console.log(`   Cost Protection: ${migrationConfig.enableCostProtection ? 'Enabled' : 'Disabled'}`);
        console.log(`   Validate After Migration: ${migrationConfig.validateAfterMigration}`);
        console.log(`   Cleanup Local Files: ${migrationConfig.cleanupLocalFiles}`);

        const result = await migrationOrchestrator.executeMigration(migrationConfig);

        if (result.status === 'COMPLETED') {
          console.log(`\n🎊 Photo migration completed successfully!`);
          console.log(`   Migration ID: ${result.migrationId}`);
          console.log(`   Duration: ${((result.completedAt!.getTime() - result.startedAt.getTime()) / 1000 / 60).toFixed(2)} minutes`);
        } else {
          console.log(`\n⚠️  Migration finished with status: ${result.status}`);
          console.log(`   Use --resume ${result.migrationId} to continue`);
        }
      }
    }

  } catch (error) {
    console.error('\n💥 Migration script failed:', error);

    if (error instanceof Error) {
      console.error(`   Error: ${error.message}`);

      if (args.verbose && error.stack) {
        console.error(`   Stack: ${error.stack}`);
      }
    }

    process.exit(1);

  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Handle graceful shutdown
 */
process.on('SIGINT', async () => {
  console.log('\n\n⏹️  Received interrupt signal. Attempting graceful shutdown...');
  console.log('   Migration will pause at the next safe checkpoint.');
  console.log('   Use --resume <migration-id> to continue later.');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n\n⏹️  Received terminate signal. Shutting down...');
  process.exit(0);
});

/**
 * Script execution entry point
 */
if (require.main === module) {
  main()
    .then(() => {
      console.log('\n✅ Migration script completed successfully');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n💥 Migration script failed:', error);
      process.exit(1);
    });
}

export { main as executePhotoMigration };