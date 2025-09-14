/**
 * CloudFront CDN Service
 *
 * Manages CloudFront distribution operations including cache invalidation,
 * format-based routing, and optimized caching headers for multi-format
 * image delivery with global performance optimization.
 *
 * @category CDN Services
 * @since 1.7.0
 */

import {
  CloudFrontClient,
  CreateInvalidationCommand,
  GetInvalidationCommand,
  ListInvalidationsCommand,
  GetDistributionConfigCommand,
  UpdateDistributionCommand,
} from '@aws-sdk/client-cloudfront';
import { s3Client, STORAGE_CONFIG, getCdnUrl, SupportedFormat } from '@/lib/config/storage';
import { serverEnv } from '@/lib/utils/env';
import { performanceConfig, sentryConfig } from '@/lib/config/monitoring';

/**
 * CloudFront invalidation request options
 */
interface InvalidationOptions {
  /** Paths to invalidate (S3 object keys) */
  paths: string[];
  /** Optional caller reference for tracking */
  callerReference?: string;
  /** Whether to wait for invalidation completion */
  waitForCompletion?: boolean;
  /** Timeout for waiting (in milliseconds) */
  timeoutMs?: number;
}

/**
 * Invalidation result with tracking information
 */
interface InvalidationResult {
  invalidationId: string;
  status: string;
  createTime: Date;
  paths: string[];
  callerReference: string;
  distributionId?: string;
}

/**
 * Cache behavior configuration for different content types
 */
interface CacheBehavior {
  pathPattern: string;
  targetOriginId: string;
  viewerProtocolPolicy: 'allow-all' | 'redirect-to-https' | 'https-only';
  cachePolicyId?: string;
  compress: boolean;
  allowedMethods: string[];
  cachedMethods: string[];
  defaultTTL: number;
  maxTTL: number;
  minTTL: number;
  forwardedValues?: {
    queryString: boolean;
    headers: string[];
    cookies: boolean;
  };
}

/**
 * CDN statistics and performance metrics
 */
interface CdnStats {
  totalInvalidations: number;
  pendingInvalidations: number;
  completedInvalidations: number;
  failedInvalidations: number;
  avgInvalidationTime: number;
  cacheHitRatio?: number;
  distributionStatus?: string;
}

/**
 * CloudFront CDN Service implementation
 */
export class CdnService {
  private client: CloudFrontClient;
  private distributionId?: string;
  private invalidationStats = {
    total: 0,
    pending: 0,
    completed: 0,
    failed: 0,
    avgTimeMs: 0,
    totalTimeMs: 0,
  };

  constructor() {
    this.client = new CloudFrontClient({
      region: serverEnv.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: serverEnv.AWS_ACCESS_KEY_ID!,
        secretAccessKey: serverEnv.AWS_SECRET_ACCESS_KEY!,
      },
    });

    // Extract distribution ID from CloudFront domain if available
    if (serverEnv.AWS_CLOUDFRONT_DOMAIN) {
      this.extractDistributionId(serverEnv.AWS_CLOUDFRONT_DOMAIN);
    }
  }

  /**
   * Invalidate cache for specific image paths across all formats
   *
   * @param imagePaths - Array of image paths (without format extensions)
   * @param options - Invalidation options
   * @returns Promise resolving to invalidation result
   *
   * @example Invalidate image cache after update
   * ```typescript
   * await cdnService.invalidateImageCache([
   *   'items/123/photos/image',
   *   'items/123/photos/thumbnail'
   * ], { waitForCompletion: false });
   * ```
   */
  async invalidateImageCache(
    imagePaths: string[],
    options: Partial<InvalidationOptions> = {}
  ): Promise<InvalidationResult> {
    return await performanceConfig.measureOperation(
      'cloudfront_invalidation',
      async () => {
        // Generate all format variations for each path
        const allPaths = this.generateAllFormatPaths(imagePaths);

        const invalidationOptions: InvalidationOptions = {
          paths: allPaths,
          callerReference: options.callerReference ?? `invalidation-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          waitForCompletion: options.waitForCompletion ?? false,
          timeoutMs: options.timeoutMs ?? 300000, // 5 minutes
        };

        try {
          const invalidationResult = await this.createInvalidation(invalidationOptions);

          // Wait for completion if requested
          if (invalidationOptions.waitForCompletion) {
            await this.waitForInvalidationCompletion(
              invalidationResult.invalidationId,
              invalidationOptions.timeoutMs!
            );
          }

          return invalidationResult;

        } catch (error) {
          this.invalidationStats.failed++;

          sentryConfig.reportError(error as Error, {
            operation: 'invalidate_image_cache',
            paths: imagePaths,
            distributionId: this.distributionId,
          });

          throw new Error(
            `CloudFront invalidation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
        }
      }
    );
  }

  /**
   * Invalidate cache for a complete item's images
   *
   * @param itemId - Item ID to invalidate cache for
   * @param imageTypes - Types of images to invalidate (fullsize, thumbnail)
   * @returns Promise resolving to invalidation result
   */
  async invalidateItemCache(
    itemId: string,
    imageTypes: string[] = ['fullsize', 'thumbnail']
  ): Promise<InvalidationResult> {
    const basePaths: string[] = [];

    for (const imageType of imageTypes) {
      // Generate common path patterns for the item
      basePaths.push(`items/${itemId}/photos/*-${imageType}`);
      basePaths.push(`items/${itemId}/${imageType}/*`);
    }

    return await this.invalidateImageCache(basePaths, {
      callerReference: `item-${itemId}-${Date.now()}`,
    });
  }

  /**
   * Get optimized cache headers for different content types
   *
   * @param contentType - MIME type of the content
   * @param format - Image format if applicable
   * @returns Object containing cache headers
   *
   * @example Get cache headers for WebP image
   * ```typescript
   * const headers = cdnService.getCacheHeaders('image/webp', 'webp');
   * // Returns optimized cache headers for WebP delivery
   * ```
   */
  getCacheHeaders(contentType: string, format?: SupportedFormat): Record<string, string> {
    const isImage = contentType.startsWith('image/');
    const baseConfig = STORAGE_CONFIG.cacheConfig;

    // Base cache headers
    const headers: Record<string, string> = {
      'Cache-Control': `public, max-age=${baseConfig.defaultTTL}, s-maxage=${baseConfig.maxTTL}`,
      'Content-Type': contentType,
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
    };

    if (isImage) {
      // Image-specific headers
      headers['Vary'] = 'Accept, Accept-Encoding';
      headers['X-Image-Format'] = format || 'unknown';

      // Format-specific optimizations
      if (format) {
        switch (format) {
          case 'webp':
            headers['Cache-Control'] = `public, max-age=${baseConfig.maxTTL}, s-maxage=${baseConfig.maxTTL}, immutable`;
            headers['X-Content-Type-Options'] = 'nosniff';
            headers['Accept-CH'] = 'Viewport-Width, DPR, Width';
            break;

          case 'avif':
            headers['Cache-Control'] = `public, max-age=${baseConfig.maxTTL}, s-maxage=${baseConfig.maxTTL}, immutable`;
            headers['X-Modern-Format'] = 'avif';
            break;

          case 'jpeg':
            headers['Cache-Control'] = `public, max-age=${baseConfig.defaultTTL}, s-maxage=${baseConfig.maxTTL}`;
            headers['X-Fallback-Format'] = 'jpeg';
            break;
        }

        // Enable compression for all formats
        if (baseConfig.compressionEnabled) {
          headers['Content-Encoding'] = 'identity';
          headers['Vary'] = (headers['Vary'] || '') + ', Accept-Encoding';
        }
      }

      // Progressive image headers
      headers['X-Progressive-Image'] = 'true';
      headers['Link'] = '</static/images/placeholder.svg>; rel=preload; as=image';
    }

    return headers;
  }

  /**
   * Get recommended cache behaviors for CloudFront distribution
   *
   * @returns Array of cache behavior configurations
   */
  getRecommendedCacheBehaviors(): CacheBehavior[] {
    const originId = `S3-${STORAGE_CONFIG.buckets.photos}`;

    return [
      // WebP images - longest cache, modern format
      {
        pathPattern: '*.webp',
        targetOriginId: originId,
        viewerProtocolPolicy: 'redirect-to-https',
        compress: true,
        allowedMethods: ['GET', 'HEAD', 'OPTIONS'],
        cachedMethods: ['GET', 'HEAD'],
        defaultTTL: STORAGE_CONFIG.cacheConfig.maxTTL,
        maxTTL: STORAGE_CONFIG.cacheConfig.maxTTL,
        minTTL: STORAGE_CONFIG.cacheConfig.defaultTTL,
        forwardedValues: {
          queryString: false,
          headers: ['Accept', 'Accept-Encoding', 'CloudFront-Viewer-Country'],
          cookies: false,
        },
      },

      // AVIF images - longest cache, cutting-edge format
      {
        pathPattern: '*.avif',
        targetOriginId: originId,
        viewerProtocolPolicy: 'redirect-to-https',
        compress: true,
        allowedMethods: ['GET', 'HEAD', 'OPTIONS'],
        cachedMethods: ['GET', 'HEAD'],
        defaultTTL: STORAGE_CONFIG.cacheConfig.maxTTL,
        maxTTL: STORAGE_CONFIG.cacheConfig.maxTTL,
        minTTL: STORAGE_CONFIG.cacheConfig.defaultTTL,
        forwardedValues: {
          queryString: false,
          headers: ['Accept', 'Accept-Encoding', 'CloudFront-Viewer-Country'],
          cookies: false,
        },
      },

      // JPEG images - standard cache, fallback format
      {
        pathPattern: '*.jpg',
        targetOriginId: originId,
        viewerProtocolPolicy: 'redirect-to-https',
        compress: true,
        allowedMethods: ['GET', 'HEAD', 'OPTIONS'],
        cachedMethods: ['GET', 'HEAD'],
        defaultTTL: STORAGE_CONFIG.cacheConfig.defaultTTL,
        maxTTL: STORAGE_CONFIG.cacheConfig.maxTTL,
        minTTL: 0,
        forwardedValues: {
          queryString: false,
          headers: ['Accept', 'Accept-Encoding'],
          cookies: false,
        },
      },

      // JPEG alternative extension
      {
        pathPattern: '*.jpeg',
        targetOriginId: originId,
        viewerProtocolPolicy: 'redirect-to-https',
        compress: true,
        allowedMethods: ['GET', 'HEAD', 'OPTIONS'],
        cachedMethods: ['GET', 'HEAD'],
        defaultTTL: STORAGE_CONFIG.cacheConfig.defaultTTL,
        maxTTL: STORAGE_CONFIG.cacheConfig.maxTTL,
        minTTL: 0,
        forwardedValues: {
          queryString: false,
          headers: ['Accept', 'Accept-Encoding'],
          cookies: false,
        },
      },

      // Default behavior for other content
      {
        pathPattern: '*',
        targetOriginId: originId,
        viewerProtocolPolicy: 'redirect-to-https',
        compress: true,
        allowedMethods: ['GET', 'HEAD', 'OPTIONS'],
        cachedMethods: ['GET', 'HEAD'],
        defaultTTL: 3600, // 1 hour
        maxTTL: 86400, // 1 day
        minTTL: 0,
        forwardedValues: {
          queryString: true,
          headers: ['Accept', 'Accept-Encoding'],
          cookies: false,
        },
      },
    ];
  }

  /**
   * Test CDN delivery and caching behavior
   *
   * @param testPaths - Paths to test
   * @returns Promise resolving to test results
   */
  async testCdnDelivery(testPaths: string[]): Promise<{
    results: Array<{
      path: string;
      status: 'success' | 'error';
      responseTime: number;
      cacheStatus?: string;
      contentType?: string;
      error?: string;
    }>;
    summary: {
      totalTests: number;
      successful: number;
      failed: number;
      avgResponseTime: number;
    };
  }> {
    const results = [];
    let totalResponseTime = 0;
    let successful = 0;

    for (const path of testPaths) {
      const startTime = Date.now();

      try {
        const cdnUrl = getCdnUrl(path);

        // Use fetch to test the CDN endpoint
        const response = await fetch(cdnUrl, {
          method: 'HEAD',
          headers: {
            'Accept': 'image/webp,image/avif,image/*,*/*;q=0.8',
            'User-Agent': 'InventoryApp-CDN-Test/1.0',
          },
        });

        const responseTime = Date.now() - startTime;
        totalResponseTime += responseTime;

        if (response.ok) {
          successful++;
          results.push({
            path,
            status: 'success' as const,
            responseTime,
            cacheStatus: response.headers.get('X-Cache') || 'unknown',
            contentType: response.headers.get('Content-Type') || 'unknown',
          });
        } else {
          results.push({
            path,
            status: 'error' as const,
            responseTime,
            error: `HTTP ${response.status}: ${response.statusText}`,
          });
        }

      } catch (error) {
        const responseTime = Date.now() - startTime;
        totalResponseTime += responseTime;

        results.push({
          path,
          status: 'error' as const,
          responseTime,
          error: error instanceof Error ? error.message : 'Network error',
        });
      }
    }

    return {
      results,
      summary: {
        totalTests: testPaths.length,
        successful,
        failed: testPaths.length - successful,
        avgResponseTime: totalResponseTime / testPaths.length,
      },
    };
  }

  /**
   * Get CDN service statistics
   */
  getStats(): CdnStats {
    return {
      totalInvalidations: this.invalidationStats.total,
      pendingInvalidations: this.invalidationStats.pending,
      completedInvalidations: this.invalidationStats.completed,
      failedInvalidations: this.invalidationStats.failed,
      avgInvalidationTime: this.invalidationStats.avgTimeMs,
      distributionStatus: this.distributionId ? 'configured' : 'not_configured',
    };
  }

  /**
   * Create CloudFront invalidation
   */
  private async createInvalidation(options: InvalidationOptions): Promise<InvalidationResult> {
    if (!this.distributionId) {
      throw new Error('CloudFront distribution ID not configured');
    }

    const command = new CreateInvalidationCommand({
      DistributionId: this.distributionId,
      InvalidationBatch: {
        Paths: {
          Quantity: options.paths.length,
          Items: options.paths.map(path => path.startsWith('/') ? path : `/${path}`),
        },
        CallerReference: options.callerReference,
      },
    });

    const startTime = Date.now();
    const response = await this.client.send(command);

    this.invalidationStats.total++;
    this.invalidationStats.pending++;

    if (response.Invalidation) {
      return {
        invalidationId: response.Invalidation.Id!,
        status: response.Invalidation.Status!,
        createTime: response.Invalidation.CreateTime!,
        paths: options.paths,
        callerReference: options.callerReference!,
        distributionId: this.distributionId,
      };
    }

    throw new Error('Invalid CloudFront invalidation response');
  }

  /**
   * Wait for invalidation to complete
   */
  private async waitForInvalidationCompletion(
    invalidationId: string,
    timeoutMs: number
  ): Promise<void> {
    const startTime = Date.now();
    const pollingInterval = 10000; // 10 seconds

    while (Date.now() - startTime < timeoutMs) {
      try {
        const command = new GetInvalidationCommand({
          DistributionId: this.distributionId!,
          Id: invalidationId,
        });

        const response = await this.client.send(command);

        if (response.Invalidation?.Status === 'Completed') {
          this.invalidationStats.completed++;
          this.invalidationStats.pending = Math.max(0, this.invalidationStats.pending - 1);

          // Update average time
          const totalTime = this.invalidationStats.totalTimeMs + (Date.now() - startTime);
          this.invalidationStats.totalTimeMs = totalTime;
          this.invalidationStats.avgTimeMs = totalTime / this.invalidationStats.completed;

          return;
        }

        // Wait before next poll
        await new Promise(resolve => setTimeout(resolve, pollingInterval));

      } catch (error) {
        console.warn(`Error polling invalidation ${invalidationId}:`, error);
        break;
      }
    }

    // If we reach here, either timeout or error occurred
    console.warn(`Invalidation ${invalidationId} did not complete within ${timeoutMs}ms`);
  }

  /**
   * Generate all format variations for given paths
   */
  private generateAllFormatPaths(basePaths: string[]): string[] {
    const allPaths = new Set<string>();
    const formats = STORAGE_CONFIG.imageDefaults.supportedFormats;

    for (const basePath of basePaths) {
      // Add the base path itself
      allPaths.add(basePath);

      // Add format-specific variations
      for (const format of formats) {
        // Handle both with and without existing extensions
        if (basePath.includes('.')) {
          // Replace existing extension
          const pathWithoutExt = basePath.substring(0, basePath.lastIndexOf('.'));
          allPaths.add(`${pathWithoutExt}.${format}`);
        } else {
          // Add extension to path
          allPaths.add(`${basePath}.${format}`);
        }

        // Add wildcard patterns for directories
        if (basePath.endsWith('/*')) {
          const dirPath = basePath.substring(0, basePath.length - 1);
          allPaths.add(`${dirPath}*.${format}`);
        }
      }
    }

    return Array.from(allPaths);
  }

  /**
   * Extract distribution ID from CloudFront domain
   */
  private extractDistributionId(domain: string): void {
    // If domain is a CloudFront distribution domain (d123456789.cloudfront.net)
    const match = domain.match(/^d([a-zA-Z0-9]+)\.cloudfront\.net$/);
    if (match) {
      this.distributionId = match[1].toUpperCase();
    } else {
      // For custom domains, we would need to query CloudFront API
      // For now, we'll assume the distribution ID is set via environment
      console.warn('Custom CloudFront domain detected. Distribution ID should be set via AWS_CLOUDFRONT_DISTRIBUTION_ID environment variable.');
    }
  }

  /**
   * Test delivery of URLs through CDN
   */
  async testDelivery(urls: string[]): Promise<{
    successful: number;
    failed: number;
    results: Array<{
      url: string;
      success: boolean;
      responseTime?: number;
      error?: string;
    }>;
  }> {
    const results = [];
    let successful = 0;
    let failed = 0;

    for (const url of urls) {
      const startTime = Date.now();
      try {
        const response = await fetch(url, { method: 'HEAD' });
        const responseTime = Date.now() - startTime;

        if (response.ok) {
          successful++;
          results.push({
            url,
            success: true,
            responseTime,
          });
        } else {
          failed++;
          results.push({
            url,
            success: false,
            error: `HTTP ${response.status}`,
          });
        }
      } catch (error) {
        failed++;
        results.push({
          url,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return {
      successful,
      failed,
      results,
    };
  }
}

/**
 * Singleton instance of CdnService for application use
 *
 * @example Using the CDN service
 * ```typescript
 * import { cdnService } from '@/lib/services/cdn';
 *
 * // Invalidate cache after image update
 * await cdnService.invalidateImageCache(['items/123/photos/image']);
 *
 * // Get optimized cache headers
 * const headers = cdnService.getCacheHeaders('image/webp', 'webp');
 * ```
 */
export const cdnService = new CdnService();