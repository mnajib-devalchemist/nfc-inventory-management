#!/usr/bin/env tsx

/**
 * S3 Bucket Lifecycle Configuration Setup Script
 *
 * This script configures S3 bucket lifecycle rules for cost optimization,
 * including transitions to cheaper storage classes and cleanup of incomplete uploads.
 *
 * @category Infrastructure Scripts
 * @since 1.7.0
 */

import { storageService } from '@/lib/services/storage';
import { validateStorageConfig, STORAGE_CONFIG } from '@/lib/config/storage';

/**
 * Sets up lifecycle rules for all configured S3 buckets.
 */
async function setupS3Lifecycle(): Promise<void> {
  console.log('🚀 Setting up S3 bucket lifecycle rules for cost optimization...\n');

  try {
    // Validate storage configuration
    validateStorageConfig();

    const buckets = Object.keys(STORAGE_CONFIG.buckets) as Array<keyof typeof STORAGE_CONFIG.buckets>;

    for (const bucketType of buckets) {
      const bucketName = STORAGE_CONFIG.buckets[bucketType];
      console.log(`📦 Configuring lifecycle rules for ${bucketName} (${bucketType})...`);

      try {
        await storageService.configureBucketLifecycle(bucketType);
        console.log(`✅ Successfully configured lifecycle rules for ${bucketName}\n`);
      } catch (error) {
        console.error(`❌ Failed to configure lifecycle rules for ${bucketName}:`, error);
        console.log(`   You may need to configure this manually in AWS Console\n`);
      }
    }

    console.log('🎉 S3 lifecycle configuration completed!');
    console.log('\nConfigured Rules:');

    if (STORAGE_CONFIG.lifecycleRules.intelligentTiering.enabled) {
      console.log(`   • Intelligent Tiering after ${STORAGE_CONFIG.lifecycleRules.intelligentTiering.days} days`);
    }

    if (STORAGE_CONFIG.lifecycleRules.glacierTransition.enabled) {
      console.log(`   • Glacier transition after ${STORAGE_CONFIG.lifecycleRules.glacierTransition.days} days`);
    }

    if (STORAGE_CONFIG.lifecycleRules.cleanupIncompleteUploads.enabled) {
      console.log(`   • Cleanup incomplete uploads after ${STORAGE_CONFIG.lifecycleRules.cleanupIncompleteUploads.days} days`);
    }

  } catch (error) {
    console.error('❌ Fatal error setting up S3 lifecycle rules:', error);
    process.exit(1);
  }
}

/**
 * Main execution when run as script.
 */
if (require.main === module) {
  setupS3Lifecycle()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Script execution failed:', error);
      process.exit(1);
    });
}

export { setupS3Lifecycle };