#!/usr/bin/env tsx

/**
 * S3 Connection and Upload Functionality Test Script
 *
 * This script tests S3 configuration, connection, and basic upload/download
 * functionality to verify the AWS integration is working correctly.
 *
 * @category Testing Scripts
 * @since 1.7.0
 */

import { storageService } from '@/lib/services/storage';
import { validateStorageConfig, STORAGE_CONFIG } from '@/lib/config/storage';
import { writeFileSync, readFileSync, unlinkSync } from 'fs';
import { join } from 'path';

/**
 * Creates a test image buffer for upload testing.
 */
function createTestImageBuffer(): Buffer {
  // Create a minimal valid JPEG buffer (1x1 pixel black image)
  const jpegHeader = Buffer.from([
    0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
    0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43,
    0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
    0x09, 0x08, 0x0A, 0x0C, 0x14, 0x0D, 0x0C, 0x0B, 0x0B, 0x0C, 0x19, 0x12,
    0x13, 0x0F, 0x14, 0x1D, 0x1A, 0x1F, 0x1E, 0x1D, 0x1A, 0x1C, 0x1C, 0x20,
    0x24, 0x2E, 0x27, 0x20, 0x22, 0x2C, 0x23, 0x1C, 0x1C, 0x28, 0x37, 0x29,
    0x2C, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1F, 0x27, 0x39, 0x3D, 0x38, 0x32,
    0x3C, 0x2E, 0x33, 0x34, 0x32, 0xFF, 0xC0, 0x00, 0x11, 0x08, 0x00, 0x01,
    0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
    0xFF, 0xC4, 0x00, 0x14, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x08, 0xFF, 0xC4,
    0x00, 0x14, 0x10, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xFF, 0xDA, 0x00, 0x0C,
    0x03, 0x01, 0x00, 0x02, 0x11, 0x03, 0x11, 0x00, 0x3F, 0x00, 0x8A, 0x00,
    0xFF, 0xD9
  ]);

  return jpegHeader;
}

/**
 * Tests S3 configuration and connection.
 */
async function testS3Configuration(): Promise<void> {
  console.log('🔧 Testing S3 configuration...');

  try {
    validateStorageConfig();
    console.log('✅ Storage configuration is valid');

    console.log('📋 Configuration Details:');
    console.log(`   • Region: ${process.env.AWS_REGION || 'us-east-1'}`);
    console.log(`   • Photos Bucket: ${STORAGE_CONFIG.buckets.photos}`);
    console.log(`   • CloudFront Domain: ${STORAGE_CONFIG.cloudfrontDomain || 'Not configured'}`);

  } catch (error) {
    console.error('❌ Configuration validation failed:', error);
    throw error;
  }
}

/**
 * Tests basic upload and download functionality.
 */
async function testUploadDownload(): Promise<void> {
  console.log('\n📤 Testing S3 upload/download functionality...');

  const testKey = `test/connection-test-${Date.now()}.jpg`;
  const testBuffer = createTestImageBuffer();

  try {
    // Test upload
    console.log('   Uploading test file...');
    const uploadResult = await storageService.uploadFile(
      testBuffer,
      testKey,
      'image/jpeg',
      'photos',
      {
        testFile: 'true',
        timestamp: new Date().toISOString(),
        purpose: 'connection-test'
      }
    );

    console.log('✅ Upload successful:');
    console.log(`   • S3 URL: ${uploadResult.s3Url}`);
    console.log(`   • CDN URL: ${uploadResult.cdnUrl}`);
    console.log(`   • File Size: ${uploadResult.fileSize} bytes`);
    console.log(`   • ETag: ${uploadResult.etag}`);

    // Test existence check
    console.log('   Checking file existence...');
    const exists = await storageService.objectExists(testKey, 'photos');
    if (exists) {
      console.log('✅ File existence check passed');
    } else {
      throw new Error('File existence check failed');
    }

    // Test download
    console.log('   Downloading test file...');
    const { buffer: downloadedBuffer } = await storageService.downloadFile(testKey, 'photos');

    if (Buffer.compare(testBuffer, downloadedBuffer) === 0) {
      console.log('✅ Download successful - file content matches');
    } else {
      throw new Error('Downloaded content does not match uploaded content');
    }

    // Cleanup - delete test file
    console.log('   Cleaning up test file...');
    await storageService.deleteFile(testKey, 'photos');

    // Verify deletion
    const existsAfterDelete = await storageService.objectExists(testKey, 'photos');
    if (!existsAfterDelete) {
      console.log('✅ File deletion successful');
    } else {
      console.warn('⚠️  File may still exist after deletion (eventual consistency)');
    }

  } catch (error) {
    console.error('❌ Upload/download test failed:', error);

    // Try to clean up on error
    try {
      await storageService.deleteFile(testKey, 'photos');
    } catch (cleanupError) {
      console.warn('⚠️  Could not clean up test file:', cleanupError);
    }

    throw error;
  }
}

/**
 * Tests presigned URL generation.
 */
async function testPresignedUrls(): Promise<void> {
  console.log('\n🔗 Testing presigned URL generation...');

  try {
    const testKey = `test/presigned-test-${Date.now()}.jpg`;
    const presignedUrl = await storageService.generatePresignedUploadUrl(
      testKey,
      'image/jpeg',
      'photos',
      300 // 5 minutes
    );

    console.log('✅ Presigned URL generated successfully:');
    console.log(`   • URL Length: ${presignedUrl.length} characters`);
    console.log(`   • Contains Signature: ${presignedUrl.includes('X-Amz-Signature') ? 'Yes' : 'No'}`);
    console.log(`   • Contains Expiration: ${presignedUrl.includes('X-Amz-Expires') ? 'Yes' : 'No'}`);

    // Don't actually test the upload via presigned URL in this script
    // to avoid leaving test objects in production buckets

  } catch (error) {
    console.error('❌ Presigned URL test failed:', error);
    throw error;
  }
}

/**
 * Tests multi-format upload functionality.
 */
async function testMultiFormatUpload(): Promise<void> {
  console.log('\n🎨 Testing multi-format upload functionality...');

  const testKeyPrefix = `test/multiformat-test-${Date.now()}`;
  const testBuffer = createTestImageBuffer();

  // Simulate different format buffers (in real use, these would be processed images)
  const formatBuffers = {
    jpeg: testBuffer,
    webp: testBuffer, // Would be actual WebP in production
    avif: testBuffer, // Would be actual AVIF in production
  };

  try {
    const result = await storageService.uploadMultiFormat(
      formatBuffers,
      testKeyPrefix,
      'photos',
      {
        testFile: 'true',
        multiFormat: 'true',
        timestamp: new Date().toISOString()
      }
    );

    console.log('✅ Multi-format upload successful:');
    console.log(`   • Formats uploaded: ${Object.keys(result.formats).join(', ')}`);
    console.log(`   • Primary format: ${Object.keys(result.formats).find(f => result.formats[f as keyof typeof result.formats] === result.primary)}`);
    console.log(`   • Total size: ${result.totalSize} bytes`);
    console.log(`   • Primary CDN URL: ${result.primary.cdnUrl}`);

    // Cleanup - delete all format files
    const keysToDelete = Object.values(result.formats).map(format => format.key);
    await storageService.deleteFiles(keysToDelete, 'photos');
    console.log('✅ Multi-format files cleaned up successfully');

  } catch (error) {
    console.error('❌ Multi-format upload test failed:', error);

    // Try to clean up on error
    try {
      const possibleKeys = Object.keys(formatBuffers).map(format => `${testKeyPrefix}.${format}`);
      await storageService.deleteFiles(possibleKeys, 'photos');
    } catch (cleanupError) {
      console.warn('⚠️  Could not clean up multi-format test files:', cleanupError);
    }

    throw error;
  }
}

/**
 * Runs all S3 connection and functionality tests.
 */
async function runAllTests(): Promise<void> {
  console.log('🧪 Starting S3 Connection and Upload Tests\n');

  const tests = [
    { name: 'Configuration Validation', fn: testS3Configuration },
    { name: 'Upload/Download Functionality', fn: testUploadDownload },
    { name: 'Presigned URL Generation', fn: testPresignedUrls },
    { name: 'Multi-Format Upload', fn: testMultiFormatUpload },
  ];

  const results = {
    passed: 0,
    failed: 0,
    errors: [] as string[],
  };

  for (const test of tests) {
    try {
      await test.fn();
      results.passed++;
      console.log(`✅ ${test.name} - PASSED\n`);
    } catch (error) {
      results.failed++;
      const errorMessage = error instanceof Error ? error.message : String(error);
      results.errors.push(`${test.name}: ${errorMessage}`);
      console.error(`❌ ${test.name} - FAILED: ${errorMessage}\n`);
    }
  }

  // Summary
  console.log('📊 Test Results Summary:');
  console.log(`   • Total Tests: ${tests.length}`);
  console.log(`   • Passed: ${results.passed}`);
  console.log(`   • Failed: ${results.failed}`);

  if (results.failed > 0) {
    console.log('\n❌ Failed Tests:');
    results.errors.forEach(error => console.log(`   • ${error}`));
    console.log('\n💡 Next Steps:');
    console.log('   1. Verify AWS credentials are configured correctly');
    console.log('   2. Check S3 bucket exists and has proper permissions');
    console.log('   3. Ensure CloudFront distribution is set up (optional)');
    console.log('   4. Review environment variables in .env file');

    process.exit(1);
  } else {
    console.log('\n🎉 All tests passed! S3 integration is working correctly.');
    console.log('✅ Ready for Phase 2: Image Processing Pipeline');
  }
}

/**
 * Main execution when run as script.
 */
if (require.main === module) {
  runAllTests()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Test execution failed:', error);
      process.exit(1);
    });
}

export { runAllTests, testS3Configuration, testUploadDownload, testPresignedUrls, testMultiFormatUpload };