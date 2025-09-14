/**
 * AWS S3 and CloudFront storage configuration.
 *
 * This module provides centralized configuration and client setup for AWS S3
 * storage operations and CloudFront CDN integration used throughout the
 * Digital Inventory Management System.
 *
 * @category Storage Configuration
 * @since 1.7.0
 */

import { S3Client } from '@aws-sdk/client-s3';
import { serverEnv } from '@/lib/utils/env';

/**
 * AWS S3 client instance with configured credentials and region.
 *
 * Uses environment variables from Epic 0 setup for authentication and region.
 * Only instantiated on server-side to protect credentials.
 *
 * @example Server-side S3 operations
 * ```typescript
 * import { s3Client } from '@/lib/config/storage';
 * import { PutObjectCommand } from '@aws-sdk/client-s3';
 *
 * const command = new PutObjectCommand({
 *   Bucket: STORAGE_CONFIG.buckets.photos,
 *   Key: 'items/123/photos/image.jpg',
 *   Body: buffer,
 * });
 *
 * await s3Client.send(command);
 * ```
 */
export const s3Client = new S3Client({
  region: serverEnv.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: serverEnv.AWS_ACCESS_KEY_ID!,
    secretAccessKey: serverEnv.AWS_SECRET_ACCESS_KEY!,
  },
});

/**
 * Comprehensive storage configuration with buckets, CDN, and features.
 *
 * Contains all AWS storage-related configuration including S3 bucket names,
 * CloudFront domain, and feature flags for different storage capabilities.
 *
 * @interface StorageConfig
 * @category Configuration
 */
export const STORAGE_CONFIG = {
  /**
   * S3 bucket configuration for different data types.
   *
   * Uses environment variables with fallback defaults for development.
   * Production buckets should always be specified via environment variables.
   */
  buckets: {
    /** Primary bucket for item photos and thumbnails */
    photos: serverEnv.AWS_S3_BUCKET_NAME || 'inventory-photos-production',
    /** Bucket for data export files */
    exports: 'inventory-exports-production',
    /** Bucket for database and photo backups */
    backups: 'inventory-backups-production',
  },

  /**
   * CloudFront CDN domain for fast global delivery.
   *
   * Used to construct CloudFront URLs for all uploaded images to ensure
   * optimal performance and global availability.
   *
   * @example CloudFront URL construction
   * ```typescript
   * const cdnUrl = `https://${STORAGE_CONFIG.cloudfrontDomain}/items/123/photos/image.jpg`;
   * ```
   */
  cloudfrontDomain: serverEnv.AWS_CLOUDFRONT_DOMAIN,

  /**
   * Storage service features and capabilities.
   *
   * Documents the key features available through the storage infrastructure.
   */
  features: [
    'Automated image optimization pipeline',
    'S3 Glacier for long-term photo archival',
    'CloudFront CDN for global photo delivery',
    'Presigned URLs for secure direct uploads',
    'Multi-format processing (WebP, AVIF, JPEG)',
    'Adaptive quality targeting for 100KB efficiency',
    'Worker thread isolation for CPU-intensive processing',
    'Circuit breaker cost protection',
  ] as const,

  /**
   * Default configuration for image processing operations.
   *
   * Contains standard settings used across all image processing operations
   * to ensure consistency and optimal performance.
   */
  imageDefaults: {
    /** Target file size for adaptive quality processing (in KB) */
    targetSizeKB: 100,
    /** Maximum width for full-size images (in pixels) */
    maxFullWidth: 1200,
    /** Maximum height for full-size images (in pixels) */
    maxFullHeight: 1200,
    /** Thumbnail dimensions (square) */
    thumbnailSize: 150,
    /** Supported image formats in order of preference */
    supportedFormats: ['webp', 'avif', 'jpeg'] as const,
    /** Default JPEG quality for initial processing attempts */
    defaultQuality: 85,
    /** Minimum quality threshold before fallback */
    minQuality: 20,
    /** Progressive encoding for faster loading */
    progressive: true,
    /** Strip EXIF data for privacy and size reduction */
    stripMetadata: true,
  },

  /**
   * S3 bucket lifecycle rules for cost optimization.
   *
   * Defines automated transitions to cheaper storage classes and deletion
   * policies to minimize long-term storage costs.
   */
  lifecycleRules: {
    /** Transition to Intelligent Tiering after 30 days */
    intelligentTiering: {
      days: 30,
      enabled: true,
    },
    /** Transition to Glacier after 90 days */
    glacierTransition: {
      days: 90,
      enabled: true,
    },
    /** Delete incomplete multipart uploads after 7 days */
    cleanupIncompleteUploads: {
      days: 7,
      enabled: true,
    },
  },

  /**
   * Presigned URL configuration for secure uploads.
   *
   * Controls the security and expiration settings for presigned URLs
   * used for direct client-to-S3 uploads.
   */
  presignedUrls: {
    /** Expiration time for upload URLs (15 minutes) */
    uploadExpirationSeconds: 15 * 60,
    /** Maximum file size allowed for uploads (10MB) */
    maxUploadSizeMB: 10,
    /** Allowed content types for uploads */
    allowedContentTypes: [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/avif',
    ],
  },

  /**
   * CloudFront cache configuration for optimal performance.
   *
   * Defines cache behavior settings for different types of content
   * to maximize cache hit rates and minimize origin requests.
   */
  cacheConfig: {
    /** Default TTL for image files (1 day) */
    defaultTTL: 24 * 60 * 60,
    /** Maximum TTL for image files (1 year) */
    maxTTL: 365 * 24 * 60 * 60,
    /** Cache key headers to include in cache decisions */
    cacheHeaders: ['Accept', 'Accept-Encoding'],
    /** Compress responses for bandwidth savings */
    compressionEnabled: true,
  },
} as const;

/**
 * Validates that required storage environment variables are present.
 *
 * Throws descriptive errors if critical configuration is missing,
 * helping developers identify configuration issues quickly.
 *
 * @throws {Error} When required environment variables are missing
 *
 * @example Validate storage config on startup
 * ```typescript
 * import { validateStorageConfig } from '@/lib/config/storage';
 *
 * // Call during application initialization
 * validateStorageConfig();
 * ```
 */
export const validateStorageConfig = (): void => {
  const requiredVars = [
    { name: 'AWS_ACCESS_KEY_ID', value: serverEnv.AWS_ACCESS_KEY_ID },
    { name: 'AWS_SECRET_ACCESS_KEY', value: serverEnv.AWS_SECRET_ACCESS_KEY },
    { name: 'AWS_S3_BUCKET_NAME', value: serverEnv.AWS_S3_BUCKET_NAME },
  ];

  const missing = requiredVars.filter(({ value }) => !value);

  if (missing.length > 0) {
    const missingNames = missing.map(({ name }) => name).join(', ');
    throw new Error(
      `Missing required AWS environment variables: ${missingNames}. ` +
      'Please configure these variables for S3 storage functionality.'
    );
  }

  console.log('✅ Storage configuration validated successfully');
};

/**
 * Gets the appropriate CDN URL for a given S3 object key.
 *
 * Constructs CloudFront URLs when available, falls back to direct S3 URLs
 * for development or when CloudFront is not configured.
 *
 * @param key - S3 object key (path within bucket)
 * @returns Full URL for accessing the object
 *
 * @example Get CDN URL for an image
 * ```typescript
 * const imageUrl = getCdnUrl('items/123/photos/image.webp');
 * console.log(imageUrl); // https://d1234567.cloudfront.net/items/123/photos/image.webp
 * ```
 */
export const getCdnUrl = (key: string): string => {
  if (STORAGE_CONFIG.cloudfrontDomain) {
    return `https://${STORAGE_CONFIG.cloudfrontDomain}/${key}`;
  }

  // Fallback to direct S3 URL for development
  const region = serverEnv.AWS_REGION || 'us-east-1';
  const bucket = STORAGE_CONFIG.buckets.photos;
  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
};

/**
 * Type definitions for storage-related operations.
 */
export type StorageConfig = typeof STORAGE_CONFIG;
export type SupportedFormat = typeof STORAGE_CONFIG.imageDefaults.supportedFormats[number];
export type BucketType = keyof typeof STORAGE_CONFIG.buckets;