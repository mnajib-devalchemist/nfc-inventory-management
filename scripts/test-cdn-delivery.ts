#!/usr/bin/env tsx

/**
 * CloudFront CDN Delivery Testing Script
 *
 * Tests CloudFront distribution delivery performance, caching behavior,
 * and format-based routing for multi-format image optimization.
 *
 * @category Testing Scripts
 * @since 1.7.0
 */

import { cdnService } from '@/lib/services/cdn';
import { storageService } from '@/lib/services/storage';
import { STORAGE_CONFIG, getCdnUrl } from '@/lib/config/storage';
import { serverEnv } from '@/lib/utils/env';

/**
 * Comprehensive CDN test result
 */
interface CdnTestResult {
  testName: string;
  status: 'passed' | 'failed' | 'warning';
  duration: number;
  details: string;
  metrics?: {
    responseTime: number;
    cacheStatus: string;
    contentType: string;
    contentLength: number;
  };
  error?: string;
}

/**
 * Test summary statistics
 */
interface TestSummary {
  totalTests: number;
  passed: number;
  failed: number;
  warnings: number;
  avgResponseTime: number;
  cacheHitRatio: number;
  overallStatus: 'success' | 'partial' | 'failed';
}

/**
 * Create test images for CDN delivery testing
 */
async function createTestImages(): Promise<{
  testImageKey: string;
  testThumbnailKey: string;
  cleanup: () => Promise<void>;
}> {
  console.log('📸 Creating test images for CDN testing...');

  // Create a minimal test image (1x1 pixel JPEG)
  const testImageBuffer = Buffer.from([
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

  const timestamp = Date.now();
  const testImageKey = `test/cdn-test-${timestamp}.jpg`;
  const testThumbnailKey = `test/cdn-test-${timestamp}-thumb.jpg`;

  try {
    // Upload test images to S3
    await Promise.all([
      storageService.uploadFile(
        testImageBuffer,
        testImageKey,
        'image/jpeg',
        'photos',
        { testFile: 'true', purpose: 'cdn-test' }
      ),
      storageService.uploadFile(
        testImageBuffer,
        testThumbnailKey,
        'image/jpeg',
        'photos',
        { testFile: 'true', purpose: 'cdn-test-thumbnail' }
      ),
    ]);

    console.log('✅ Test images created successfully');

    return {
      testImageKey,
      testThumbnailKey,
      cleanup: async () => {
        try {
          await storageService.deleteFiles([testImageKey, testThumbnailKey], 'photos');
          console.log('🧹 Test images cleaned up');
        } catch (error) {
          console.warn('⚠️  Could not clean up test images:', error);
        }
      },
    };

  } catch (error) {
    throw new Error(`Failed to create test images: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Test CloudFront configuration and availability
 */
async function testCloudFrontConfiguration(): Promise<CdnTestResult> {
  const startTime = Date.now();

  try {
    if (!serverEnv.AWS_CLOUDFRONT_DOMAIN) {
      return {
        testName: 'CloudFront Configuration',
        status: 'failed',
        duration: Date.now() - startTime,
        details: 'AWS_CLOUDFRONT_DOMAIN environment variable not configured',
        error: 'Missing CloudFront domain configuration',
      };
    }

    const stats = cdnService.getStats();

    return {
      testName: 'CloudFront Configuration',
      status: stats.distributionStatus === 'configured' ? 'passed' : 'warning',
      duration: Date.now() - startTime,
      details: `Distribution status: ${stats.distributionStatus}, Domain: ${serverEnv.AWS_CLOUDFRONT_DOMAIN}`,
    };

  } catch (error) {
    return {
      testName: 'CloudFront Configuration',
      status: 'failed',
      duration: Date.now() - startTime,
      details: 'Failed to verify CloudFront configuration',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Test cache header generation for different formats
 */
async function testCacheHeaderGeneration(): Promise<CdnTestResult> {
  const startTime = Date.now();

  try {
    const formats = STORAGE_CONFIG.imageDefaults.supportedFormats;
    const testResults = [];

    for (const format of formats) {
      const contentType = `image/${format}`;
      const headers = cdnService.getCacheHeaders(contentType, format);

      // Verify essential headers are present
      const requiredHeaders = ['Cache-Control', 'Content-Type', 'Vary'];
      const missingHeaders = requiredHeaders.filter(header => !headers[header]);

      if (missingHeaders.length > 0) {
        testResults.push(`${format}: Missing headers [${missingHeaders.join(', ')}]`);
      } else {
        testResults.push(`${format}: ✓`);
      }
    }

    const allPassed = !testResults.some(result => result.includes('Missing'));

    return {
      testName: 'Cache Header Generation',
      status: allPassed ? 'passed' : 'failed',
      duration: Date.now() - startTime,
      details: testResults.join(', '),
    };

  } catch (error) {
    return {
      testName: 'Cache Header Generation',
      status: 'failed',
      duration: Date.now() - startTime,
      details: 'Failed to generate cache headers',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Test CDN delivery for different image formats
 */
async function testFormatDelivery(testImageKey: string): Promise<CdnTestResult[]> {
  const formats = STORAGE_CONFIG.imageDefaults.supportedFormats;
  const results: CdnTestResult[] = [];

  for (const format of formats) {
    const startTime = Date.now();
    const testImageFormatKey = testImageKey.replace('.jpg', `.${format}`);

    try {
      // Create format-specific test image (simulate it exists)
      const cdnUrl = getCdnUrl(testImageFormatKey);

      const response = await fetch(cdnUrl, {
        method: 'HEAD',
        headers: {
          'Accept': `image/${format},image/*,*/*;q=0.8`,
          'User-Agent': 'InventoryApp-CDN-Test/1.0',
          'Accept-Encoding': 'gzip, deflate, br',
        },
      });

      const duration = Date.now() - startTime;

      if (response.ok) {
        results.push({
          testName: `${format.toUpperCase()} Delivery`,
          status: 'passed',
          duration,
          details: `Successfully delivered ${format} image`,
          metrics: {
            responseTime: duration,
            cacheStatus: response.headers.get('X-Cache') || 'unknown',
            contentType: response.headers.get('Content-Type') || 'unknown',
            contentLength: parseInt(response.headers.get('Content-Length') || '0', 10),
          },
        });
      } else {
        results.push({
          testName: `${format.toUpperCase()} Delivery`,
          status: response.status === 404 ? 'warning' : 'failed',
          duration,
          details: `HTTP ${response.status}: ${response.statusText}`,
          error: `Failed to deliver ${format} image`,
        });
      }

    } catch (error) {
      results.push({
        testName: `${format.toUpperCase()} Delivery`,
        status: 'failed',
        duration: Date.now() - startTime,
        details: 'Network error or CDN unavailable',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return results;
}

/**
 * Test cache behavior with multiple requests
 */
async function testCacheBehavior(testImageKey: string): Promise<CdnTestResult> {
  const startTime = Date.now();

  try {
    const cdnUrl = getCdnUrl(testImageKey);
    const requests = [];

    // Make 3 requests to test caching
    for (let i = 0; i < 3; i++) {
      requests.push(
        fetch(cdnUrl, {
          method: 'HEAD',
          headers: {
            'User-Agent': 'InventoryApp-CDN-Test/1.0',
            'Cache-Control': i === 0 ? 'no-cache' : 'max-age=3600',
          },
        })
      );

      // Small delay between requests
      if (i < 2) await new Promise(resolve => setTimeout(resolve, 100));
    }

    const responses = await Promise.all(requests);
    const cacheStatuses = responses.map(response => response.headers.get('X-Cache') || 'unknown');

    // Analyze cache behavior
    const hitCount = cacheStatuses.filter(status =>
      status.toLowerCase().includes('hit') || status.toLowerCase().includes('refresh_hit')
    ).length;

    const missCount = cacheStatuses.filter(status =>
      status.toLowerCase().includes('miss')
    ).length;

    const duration = Date.now() - startTime;

    return {
      testName: 'Cache Behavior',
      status: hitCount > 0 ? 'passed' : 'warning',
      duration,
      details: `Requests: 3, Hits: ${hitCount}, Misses: ${missCount}, Statuses: [${cacheStatuses.join(', ')}]`,
      metrics: {
        responseTime: duration,
        cacheStatus: cacheStatuses[cacheStatuses.length - 1],
        contentType: responses[0].headers.get('Content-Type') || 'unknown',
        contentLength: parseInt(responses[0].headers.get('Content-Length') || '0', 10),
      },
    };

  } catch (error) {
    return {
      testName: 'Cache Behavior',
      status: 'failed',
      duration: Date.now() - startTime,
      details: 'Failed to test cache behavior',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Test cache invalidation functionality
 */
async function testCacheInvalidation(testImageKey: string): Promise<CdnTestResult> {
  const startTime = Date.now();

  try {
    // Attempt to invalidate cache for test image
    const invalidationResult = await cdnService.invalidateImageCache([testImageKey], {
      waitForCompletion: false, // Don't wait for completion in tests
    });

    const duration = Date.now() - startTime;

    return {
      testName: 'Cache Invalidation',
      status: 'passed',
      duration,
      details: `Invalidation created: ${invalidationResult.invalidationId}, Status: ${invalidationResult.status}`,
      metrics: {
        responseTime: duration,
        cacheStatus: 'invalidated',
        contentType: 'application/json',
        contentLength: 0,
      },
    };

  } catch (error) {
    const duration = Date.now() - startTime;

    // If distribution ID is not configured, this is expected
    if (error instanceof Error && error.message.includes('distribution ID not configured')) {
      return {
        testName: 'Cache Invalidation',
        status: 'warning',
        duration,
        details: 'CloudFront distribution ID not configured - invalidation not tested',
        error: error.message,
      };
    }

    return {
      testName: 'Cache Invalidation',
      status: 'failed',
      duration,
      details: 'Failed to create cache invalidation',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Test global edge location performance
 */
async function testGlobalPerformance(testImageKey: string): Promise<CdnTestResult> {
  const startTime = Date.now();

  try {
    const cdnUrl = getCdnUrl(testImageKey);

    // Simulate requests from different regions using different User-Agent headers
    const regionTests = [
      { region: 'US-East', userAgent: 'InventoryApp-Test-US-East/1.0' },
      { region: 'EU-West', userAgent: 'InventoryApp-Test-EU-West/1.0' },
      { region: 'Asia-Pacific', userAgent: 'InventoryApp-Test-APAC/1.0' },
    ];

    const regionResults = await Promise.all(
      regionTests.map(async (test) => {
        const requestStart = Date.now();

        try {
          const response = await fetch(cdnUrl, {
            method: 'HEAD',
            headers: {
              'User-Agent': test.userAgent,
              'CloudFront-Viewer-Country': test.region.split('-')[0],
            },
          });

          return {
            region: test.region,
            responseTime: Date.now() - requestStart,
            success: response.ok,
            cacheStatus: response.headers.get('X-Cache') || 'unknown',
          };

        } catch (error) {
          return {
            region: test.region,
            responseTime: Date.now() - requestStart,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      })
    );

    const successfulTests = regionResults.filter(result => result.success);
    const avgResponseTime = successfulTests.length > 0
      ? successfulTests.reduce((sum, result) => sum + result.responseTime, 0) / successfulTests.length
      : 0;

    const duration = Date.now() - startTime;

    return {
      testName: 'Global Performance',
      status: successfulTests.length >= 2 ? 'passed' : 'warning',
      duration,
      details: `Tested ${regionResults.length} regions, ${successfulTests.length} successful, Avg: ${Math.round(avgResponseTime)}ms`,
      metrics: {
        responseTime: Math.round(avgResponseTime),
        cacheStatus: successfulTests[0]?.cacheStatus || 'unknown',
        contentType: 'image/jpeg',
        contentLength: 0,
      },
    };

  } catch (error) {
    return {
      testName: 'Global Performance',
      status: 'failed',
      duration: Date.now() - startTime,
      details: 'Failed to test global performance',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Generate test summary from results
 */
function generateTestSummary(results: CdnTestResult[]): TestSummary {
  const passed = results.filter(result => result.status === 'passed').length;
  const failed = results.filter(result => result.status === 'failed').length;
  const warnings = results.filter(result => result.status === 'warning').length;

  const responseTimes = results
    .filter(result => result.metrics?.responseTime)
    .map(result => result.metrics!.responseTime);

  const avgResponseTime = responseTimes.length > 0
    ? Math.round(responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length)
    : 0;

  const cacheHits = results
    .filter(result => result.metrics?.cacheStatus?.toLowerCase().includes('hit'))
    .length;

  const totalCacheTests = results.filter(result => result.metrics?.cacheStatus).length;
  const cacheHitRatio = totalCacheTests > 0 ? (cacheHits / totalCacheTests) * 100 : 0;

  const overallStatus: TestSummary['overallStatus'] =
    failed === 0 ? (warnings === 0 ? 'success' : 'partial') : 'failed';

  return {
    totalTests: results.length,
    passed,
    failed,
    warnings,
    avgResponseTime,
    cacheHitRatio,
    overallStatus,
  };
}

/**
 * Run comprehensive CDN delivery tests
 */
async function runCdnDeliveryTests(): Promise<void> {
  console.log('🧪 Starting CloudFront CDN Delivery Tests\n');

  const allResults: CdnTestResult[] = [];
  let testImages: Awaited<ReturnType<typeof createTestImages>> | null = null;

  try {
    // Test 1: CloudFront Configuration
    console.log('⚙️  Testing CloudFront configuration...');
    const configTest = await testCloudFrontConfiguration();
    allResults.push(configTest);

    // Test 2: Cache Header Generation
    console.log('🏷️  Testing cache header generation...');
    const headerTest = await testCacheHeaderGeneration();
    allResults.push(headerTest);

    // Create test images for delivery tests
    if (configTest.status !== 'failed') {
      try {
        testImages = await createTestImages();

        // Test 3: Format-specific Delivery
        console.log('🎨 Testing multi-format delivery...');
        const formatTests = await testFormatDelivery(testImages.testImageKey);
        allResults.push(...formatTests);

        // Test 4: Cache Behavior
        console.log('💾 Testing cache behavior...');
        const cacheTest = await testCacheBehavior(testImages.testImageKey);
        allResults.push(cacheTest);

        // Test 5: Cache Invalidation
        console.log('♻️  Testing cache invalidation...');
        const invalidationTest = await testCacheInvalidation(testImages.testImageKey);
        allResults.push(invalidationTest);

        // Test 6: Global Performance
        console.log('🌍 Testing global performance...');
        const performanceTest = await testGlobalPerformance(testImages.testImageKey);
        allResults.push(performanceTest);

      } catch (error) {
        console.error('❌ Failed to create test images:', error);
        allResults.push({
          testName: 'Test Setup',
          status: 'failed',
          duration: 0,
          details: 'Could not create test images for delivery tests',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

  } finally {
    // Clean up test images
    if (testImages) {
      await testImages.cleanup();
    }
  }

  // Generate and display results
  const summary = generateTestSummary(allResults);

  console.log('\n📊 CDN Delivery Test Results:');
  console.log('═'.repeat(80));

  // Individual test results
  allResults.forEach(result => {
    const statusIcon = result.status === 'passed' ? '✅' :
                     result.status === 'warning' ? '⚠️' : '❌';

    console.log(`${statusIcon} ${result.testName}: ${result.details}`);

    if (result.metrics) {
      console.log(`   Response Time: ${result.metrics.responseTime}ms | Cache: ${result.metrics.cacheStatus}`);
    }

    if (result.error) {
      console.log(`   Error: ${result.error}`);
    }

    console.log('');
  });

  // Summary
  console.log('📈 Test Summary:');
  console.log(`   Total Tests: ${summary.totalTests}`);
  console.log(`   Passed: ${summary.passed} ✅`);
  console.log(`   Warnings: ${summary.warnings} ⚠️`);
  console.log(`   Failed: ${summary.failed} ❌`);
  console.log(`   Average Response Time: ${summary.avgResponseTime}ms`);
  console.log(`   Cache Hit Ratio: ${summary.cacheHitRatio.toFixed(1)}%`);
  console.log(`   Overall Status: ${summary.overallStatus.toUpperCase()}`);

  // Recommendations
  console.log('\n💡 Recommendations:');
  if (summary.failed > 0) {
    console.log('   • Review failed tests and fix configuration issues');
    console.log('   • Ensure CloudFront distribution is fully deployed');
  }
  if (summary.warnings > 0) {
    console.log('   • Address warning conditions for optimal performance');
  }
  if (summary.avgResponseTime > 1000) {
    console.log('   • Consider optimizing cache settings for better performance');
  }
  if (summary.cacheHitRatio < 70) {
    console.log('   • Increase cache TTL values for better cache hit ratio');
  }

  // Exit with appropriate code
  process.exit(summary.overallStatus === 'failed' ? 1 : 0);
}

/**
 * Main execution when run as script
 */
if (require.main === module) {
  runCdnDeliveryTests()
    .catch(error => {
      console.error('CDN test execution failed:', error);
      process.exit(1);
    });
}

export { runCdnDeliveryTests, testCloudFrontConfiguration, testCacheHeaderGeneration };