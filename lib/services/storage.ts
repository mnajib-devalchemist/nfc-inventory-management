/**
 * S3StorageService - AWS S3 operations with comprehensive error handling
 *
 * This service handles all S3 storage operations including upload, download, deletion,
 * and presigned URL generation with comprehensive error handling, retry logic,
 * and cost monitoring integration.
 *
 * @category Storage Services
 * @since 1.7.0
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  HeadObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  CreateBucketCommand,
  PutBucketLifecycleConfigurationCommand,
  GetObjectCommandOutput,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { s3Client, STORAGE_CONFIG, getCdnUrl, SupportedFormat, BucketType } from '@/lib/config/storage';
import { performanceConfig, sentryConfig } from '@/lib/config/monitoring';

/**
 * S3 operation error types for specialized error handling.
 */
export enum S3ErrorType {
  NETWORK_FAILURE = 'network_failure',
  ACCESS_DENIED = 'access_denied',
  BUCKET_NOT_FOUND = 'bucket_not_found',
  OBJECT_NOT_FOUND = 'object_not_found',
  QUOTA_EXCEEDED = 'quota_exceeded',
  INVALID_PARAMETERS = 'invalid_parameters',
  TIMEOUT = 'timeout',
  UNKNOWN = 'unknown',
}

/**
 * Custom error class for S3 operations with retry guidance.
 */
export class S3OperationError extends Error {
  constructor(
    message: string,
    public errorType: S3ErrorType,
    public retryable: boolean = false,
    public originalError?: Error
  ) {
    super(message);
    this.name = 'S3OperationError';
  }
}

/**
 * Retry strategy configuration for different error types.
 */
interface RetryStrategy {
  maxRetries: number;
  baseDelayMs: number;
  exponential: boolean;
}

/**
 * Upload result with metadata for cost tracking and validation.
 */
interface UploadResult {
  key: string;
  bucket: string;
  cdnUrl: string;
  s3Url: string;
  fileSize: number;
  contentType: string;
  etag?: string;
  uploadedAt: Date;
}

/**
 * Multi-format upload result for progressive enhancement.
 */
interface MultiFormatUploadResult {
  formats: Record<SupportedFormat, UploadResult>;
  primary: UploadResult;
  totalSize: number;
}

/**
 * S3StorageService class with comprehensive error handling and retry logic.
 */
export class S3StorageService {
  private readonly client: S3Client;
  private readonly retryStrategies = new Map<S3ErrorType, RetryStrategy>([
    [S3ErrorType.NETWORK_FAILURE, { maxRetries: 3, baseDelayMs: 1000, exponential: true }],
    [S3ErrorType.TIMEOUT, { maxRetries: 2, baseDelayMs: 2000, exponential: true }],
    [S3ErrorType.QUOTA_EXCEEDED, { maxRetries: 0, baseDelayMs: 0, exponential: false }],
    [S3ErrorType.ACCESS_DENIED, { maxRetries: 0, baseDelayMs: 0, exponential: false }],
    [S3ErrorType.BUCKET_NOT_FOUND, { maxRetries: 0, baseDelayMs: 0, exponential: false }],
    [S3ErrorType.OBJECT_NOT_FOUND, { maxRetries: 1, baseDelayMs: 500, exponential: false }],
    [S3ErrorType.INVALID_PARAMETERS, { maxRetries: 0, baseDelayMs: 0, exponential: false }],
    [S3ErrorType.UNKNOWN, { maxRetries: 1, baseDelayMs: 1000, exponential: false }],
  ]);

  constructor(client: S3Client = s3Client) {
    this.client = client;
  }

  /**
   * Uploads a file to S3 with comprehensive error handling and retry logic.
   *
   * @param buffer - File data to upload
   * @param key - S3 object key (path within bucket)
   * @param contentType - MIME type of the file
   * @param bucketType - Type of bucket to upload to (photos, exports, backups)
   * @param metadata - Optional metadata to attach to the object
   * @returns Promise resolving to upload result with URLs and metadata
   *
   * @throws {S3OperationError} When upload fails after retries
   *
   * @example Upload an image file
   * ```typescript
   * const result = await storageService.uploadFile(
   *   imageBuffer,
   *   'items/123/photos/image.jpg',
   *   'image/jpeg',
   *   'photos',
   *   { userId: '456', itemId: '123' }
   * );
   * console.log(`Image uploaded: ${result.cdnUrl}`);
   * ```
   */
  async uploadFile(
    buffer: Buffer,
    key: string,
    contentType: string,
    bucketType: BucketType = 'photos',
    metadata?: Record<string, string>
  ): Promise<UploadResult> {
    return await performanceConfig.measureOperation(
      `s3_upload_${bucketType}`,
      async () => {
        const bucket = STORAGE_CONFIG.buckets[bucketType];

        return await this.executeWithRetry(async () => {
          const command = new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: buffer,
            ContentType: contentType,
            Metadata: metadata,
            // Enable server-side encryption
            ServerSideEncryption: 'AES256',
            // Cache control for CDN optimization
            CacheControl: `max-age=${STORAGE_CONFIG.cacheConfig.defaultTTL}`,
          });

          const response = await this.client.send(command);

          const result: UploadResult = {
            key,
            bucket,
            cdnUrl: getCdnUrl(key),
            s3Url: `https://${bucket}.s3.amazonaws.com/${key}`,
            fileSize: buffer.length,
            contentType,
            etag: response.ETag,
            uploadedAt: new Date(),
          };

          return result;
        }, 'uploadFile');
      }
    );
  }

  /**
   * Uploads multiple format versions of an image for progressive enhancement.
   *
   * @param formatBuffers - Map of format to buffer data
   * @param keyPrefix - Base S3 key prefix (without format extension)
   * @param bucketType - Type of bucket to upload to
   * @param metadata - Optional metadata to attach to all objects
   * @returns Promise resolving to multi-format upload results
   *
   * @example Upload WebP, AVIF, and JPEG versions
   * ```typescript
   * const formats = {
   *   webp: webpBuffer,
   *   avif: avifBuffer,
   *   jpeg: jpegBuffer,
   * };
   *
   * const result = await storageService.uploadMultiFormat(
   *   formats,
   *   'items/123/photos/image',
   *   'photos'
   * );
   * ```
   */
  async uploadMultiFormat(
    formatBuffers: Partial<Record<SupportedFormat, Buffer>>,
    keyPrefix: string,
    bucketType: BucketType = 'photos',
    metadata?: Record<string, string>
  ): Promise<MultiFormatUploadResult> {
    const uploads: Promise<[SupportedFormat, UploadResult]>[] = [];

    for (const [format, buffer] of Object.entries(formatBuffers) as [SupportedFormat, Buffer][]) {
      if (buffer) {
        const key = `${keyPrefix}.${format}`;
        const contentType = this.getContentTypeForFormat(format);

        uploads.push(
          this.uploadFile(buffer, key, contentType, bucketType, {
            ...metadata,
            format,
          }).then(result => [format, result] as [SupportedFormat, UploadResult])
        );
      }
    }

    const results = await Promise.all(uploads);
    const formats: Record<SupportedFormat, UploadResult> = {} as any;
    let totalSize = 0;
    let primary: UploadResult | null = null;

    for (const [format, result] of results) {
      formats[format] = result;
      totalSize += result.fileSize;

      // Set primary format (prefer WebP, then AVIF, then JPEG)
      if (!primary || this.isPreferredFormat(format, Object.keys(formats)[0] as SupportedFormat)) {
        primary = result;
      }
    }

    if (!primary) {
      throw new S3OperationError(
        'No successful uploads for multi-format operation',
        S3ErrorType.UNKNOWN,
        false
      );
    }

    return {
      formats,
      primary,
      totalSize,
    };
  }

  /**
   * Generates a presigned URL for secure direct uploads.
   *
   * @param key - S3 object key for the upload
   * @param contentType - MIME type of the file to upload
   * @param bucketType - Type of bucket for the upload
   * @param expiresIn - URL expiration time in seconds
   * @returns Promise resolving to presigned upload URL
   *
   * @throws {S3OperationError} When presigned URL generation fails
   *
   * @example Generate upload URL for client
   * ```typescript
   * const uploadUrl = await storageService.generatePresignedUploadUrl(
   *   'items/123/photos/temp-upload.jpg',
   *   'image/jpeg',
   *   'photos'
   * );
   * // Send uploadUrl to client for direct upload
   * ```
   */
  async generatePresignedUploadUrl(
    key: string,
    contentType: string,
    bucketType: BucketType = 'photos',
    expiresIn: number = STORAGE_CONFIG.presignedUrls.uploadExpirationSeconds
  ): Promise<string> {
    return await this.executeWithRetry(async () => {
      const bucket = STORAGE_CONFIG.buckets[bucketType];

      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: contentType,
        ServerSideEncryption: 'AES256',
      });

      return await getSignedUrl(this.client, command, { expiresIn });
    }, 'generatePresignedUploadUrl');
  }

  /**
   * Downloads a file from S3.
   *
   * @param key - S3 object key to download
   * @param bucketType - Type of bucket to download from
   * @returns Promise resolving to file buffer and metadata
   *
   * @throws {S3OperationError} When download fails
   */
  async downloadFile(
    key: string,
    bucketType: BucketType = 'photos'
  ): Promise<{ buffer: Buffer; metadata: GetObjectCommandOutput }> {
    return await this.executeWithRetry(async () => {
      const bucket = STORAGE_CONFIG.buckets[bucketType];

      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      });

      const response = await this.client.send(command);

      if (!response.Body) {
        throw new S3OperationError(
          `No content returned for key: ${key}`,
          S3ErrorType.OBJECT_NOT_FOUND,
          false
        );
      }

      const buffer = Buffer.from(await response.Body.transformToByteArray());

      return { buffer, metadata: response };
    }, 'downloadFile');
  }

  /**
   * Deletes a single file from S3.
   *
   * @param key - S3 object key to delete
   * @param bucketType - Type of bucket to delete from
   * @returns Promise resolving when deletion is complete
   *
   * @throws {S3OperationError} When deletion fails
   */
  async deleteFile(key: string, bucketType: BucketType = 'photos'): Promise<void> {
    await this.executeWithRetry(async () => {
      const bucket = STORAGE_CONFIG.buckets[bucketType];

      const command = new DeleteObjectCommand({
        Bucket: bucket,
        Key: key,
      });

      await this.client.send(command);
    }, 'deleteFile');
  }

  /**
   * Deletes multiple files from S3 in batch for efficiency.
   *
   * @param keys - Array of S3 object keys to delete
   * @param bucketType - Type of bucket to delete from
   * @returns Promise resolving to deletion results
   *
   * @throws {S3OperationError} When batch deletion fails
   */
  async deleteFiles(keys: string[], bucketType: BucketType = 'photos'): Promise<void> {
    if (keys.length === 0) return;

    await this.executeWithRetry(async () => {
      const bucket = STORAGE_CONFIG.buckets[bucketType];

      // S3 batch delete supports up to 1000 objects per request
      const batchSize = 1000;
      const batches = [];

      for (let i = 0; i < keys.length; i += batchSize) {
        batches.push(keys.slice(i, i + batchSize));
      }

      for (const batch of batches) {
        const command = new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: {
            Objects: batch.map(key => ({ Key: key })),
            Quiet: true, // Don't return successful deletions, only errors
          },
        });

        const response = await this.client.send(command);

        // Check for any deletion errors
        if (response.Errors && response.Errors.length > 0) {
          const errorKeys = response.Errors.map(err => err.Key).join(', ');
          throw new S3OperationError(
            `Failed to delete some objects: ${errorKeys}`,
            S3ErrorType.UNKNOWN,
            true
          );
        }
      }
    }, 'deleteFiles');
  }

  /**
   * Checks if an object exists in S3.
   *
   * @param key - S3 object key to check
   * @param bucketType - Type of bucket to check
   * @returns Promise resolving to true if object exists
   */
  async objectExists(key: string, bucketType: BucketType = 'photos'): Promise<boolean> {
    try {
      await this.executeWithRetry(async () => {
        const bucket = STORAGE_CONFIG.buckets[bucketType];

        const command = new HeadObjectCommand({
          Bucket: bucket,
          Key: key,
        });

        await this.client.send(command);
      }, 'objectExists');

      return true;
    } catch (error) {
      if (error instanceof S3OperationError && error.errorType === S3ErrorType.OBJECT_NOT_FOUND) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Sets up S3 bucket lifecycle rules for cost optimization.
   *
   * @param bucketType - Type of bucket to configure
   * @returns Promise resolving when lifecycle rules are applied
   *
   * @throws {S3OperationError} When lifecycle configuration fails
   */
  async configureBucketLifecycle(bucketType: BucketType = 'photos'): Promise<void> {
    await this.executeWithRetry(async () => {
      const bucket = STORAGE_CONFIG.buckets[bucketType];
      const rules = STORAGE_CONFIG.lifecycleRules;

      const command = new PutBucketLifecycleConfigurationCommand({
        Bucket: bucket,
        LifecycleConfiguration: {
          Rules: [
            // Transition to Intelligent Tiering
            ...(rules.intelligentTiering.enabled ? [{
              ID: 'IntelligentTiering',
              Status: 'Enabled' as const,
              Filter: { Prefix: '' },
              Transitions: [{
                Days: rules.intelligentTiering.days,
                StorageClass: 'INTELLIGENT_TIERING' as const,
              }],
            }] : []),

            // Transition to Glacier
            ...(rules.glacierTransition.enabled ? [{
              ID: 'GlacierTransition',
              Status: 'Enabled' as const,
              Filter: { Prefix: '' },
              Transitions: [{
                Days: rules.glacierTransition.days,
                StorageClass: 'GLACIER' as const,
              }],
            }] : []),

            // Clean up incomplete multipart uploads
            ...(rules.cleanupIncompleteUploads.enabled ? [{
              ID: 'CleanupIncompleteUploads',
              Status: 'Enabled' as const,
              Filter: { Prefix: '' },
              AbortIncompleteMultipartUpload: {
                DaysAfterInitiation: rules.cleanupIncompleteUploads.days,
              },
            }] : []),
          ],
        },
      });

      await this.client.send(command);
    }, 'configureBucketLifecycle');
  }

  /**
   * Executes an S3 operation with automatic retry logic based on error type.
   */
  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationName: string
  ): Promise<T> {
    let lastError: Error | null = null;
    let attempt = 0;

    while (attempt <= 3) { // Max 3 total attempts
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        const s3Error = this.classifyError(error as Error);
        const strategy = this.retryStrategies.get(s3Error.errorType);

        if (!strategy || !s3Error.retryable || attempt >= strategy.maxRetries) {
          // Report non-retryable errors or exhausted retries
          sentryConfig.reportError(s3Error, {
            operation: operationName,
            attempt,
            errorType: s3Error.errorType,
          });

          throw s3Error;
        }

        // Calculate delay for retry
        const delay = strategy.exponential
          ? strategy.baseDelayMs * Math.pow(2, attempt)
          : strategy.baseDelayMs;

        console.warn(
          `S3 operation ${operationName} failed (attempt ${attempt + 1}), retrying in ${delay}ms:`,
          s3Error.message
        );

        await this.sleep(delay);
        attempt++;
      }
    }

    // This should never be reached, but TypeScript needs it
    throw lastError || new Error('Unknown error in retry loop');
  }

  /**
   * Classifies AWS errors into specific error types for targeted handling.
   */
  private classifyError(error: Error): S3OperationError {
    const message = error.message.toLowerCase();
    const name = error.name;

    // Network and timeout errors
    if (message.includes('network') || message.includes('enotfound') || name === 'NetworkingError') {
      return new S3OperationError('Network connection failed', S3ErrorType.NETWORK_FAILURE, true, error);
    }

    if (message.includes('timeout') || name === 'TimeoutError') {
      return new S3OperationError('Request timed out', S3ErrorType.TIMEOUT, true, error);
    }

    // Access and authentication errors
    if (message.includes('access denied') || message.includes('forbidden') || name === 'AccessDenied') {
      return new S3OperationError('Access denied to S3 resource', S3ErrorType.ACCESS_DENIED, false, error);
    }

    // Resource not found errors
    if (message.includes('nosuchbucket') || name === 'NoSuchBucket') {
      return new S3OperationError('S3 bucket not found', S3ErrorType.BUCKET_NOT_FOUND, false, error);
    }

    if (message.includes('nosuchkey') || message.includes('not found') || name === 'NoSuchKey') {
      return new S3OperationError('S3 object not found', S3ErrorType.OBJECT_NOT_FOUND, true, error);
    }

    // Quota and limit errors
    if (message.includes('quota') || message.includes('limit') || name === 'ServiceLimit') {
      return new S3OperationError('S3 service limit exceeded', S3ErrorType.QUOTA_EXCEEDED, false, error);
    }

    // Parameter validation errors
    if (message.includes('invalidrequest') || message.includes('validation') || name === 'InvalidRequest') {
      return new S3OperationError('Invalid request parameters', S3ErrorType.INVALID_PARAMETERS, false, error);
    }

    // Default to unknown error with limited retry
    return new S3OperationError(
      `Unknown S3 error: ${error.message}`,
      S3ErrorType.UNKNOWN,
      true,
      error
    );
  }

  /**
   * Helper method to get content type for supported formats.
   */
  private getContentTypeForFormat(format: SupportedFormat): string {
    const contentTypes = {
      webp: 'image/webp',
      avif: 'image/avif',
      jpeg: 'image/jpeg',
    };
    return contentTypes[format];
  }

  /**
   * Helper method to determine preferred format order.
   */
  private isPreferredFormat(newFormat: SupportedFormat, currentFormat: SupportedFormat): boolean {
    const preference = ['webp', 'avif', 'jpeg'];
    return preference.indexOf(newFormat) < preference.indexOf(currentFormat);
  }

  /**
   * Check if a file exists in S3
   */
  async fileExists(key: string): Promise<boolean> {
    try {
      const command = new HeadObjectCommand({
        Bucket: STORAGE_CONFIG.buckets.photos,
        Key: key,
      });

      await s3Client.send(command);
      return true;
    } catch (error: any) {
      if (error.name === 'NotFound') {
        return false;
      }
      throw new S3OperationError(
        `Failed to check existence of ${key}`,
        S3ErrorType.ACCESS_DENIED,
        false,
        error
      );
    }
  }

  /**
   * List objects in S3 bucket with optional prefix
   */
  async listObjects(prefix?: string, options: {
    maxKeys?: number;
    recursive?: boolean;
  } = {}): Promise<Array<{
    key: string;
    size?: number;
    lastModified?: Date;
    etag?: string;
  }>> {
    try {
      const command = new ListObjectsV2Command({
        Bucket: STORAGE_CONFIG.buckets.photos,
        Prefix: prefix,
        MaxKeys: options.maxKeys || 1000,
        Delimiter: options.recursive ? undefined : '/',
      });

      const response = await s3Client.send(command);

      return (response.Contents || []).map(obj => ({
        key: obj.Key!,
        size: obj.Size,
        lastModified: obj.LastModified,
        etag: obj.ETag,
      }));

    } catch (error: any) {
      throw new S3OperationError(
        `Failed to list objects with prefix ${prefix}`,
        S3ErrorType.ACCESS_DENIED,
        false,
        error
      );
    }
  }

  /**
   * Test S3 connection and permissions
   */
  async testConnection(): Promise<void> {
    try {
      const command = new HeadBucketCommand({
        Bucket: STORAGE_CONFIG.buckets.photos,
      });

      await s3Client.send(command);
    } catch (error: any) {
      throw new S3OperationError(
        'Failed to test S3 connection',
        S3ErrorType.ACCESS_DENIED,
        false,
        error
      );
    }
  }

  /**
   * Helper method for async delays.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Singleton instance of S3StorageService for application use.
 *
 * @example Using the storage service
 * ```typescript
 * import { storageService } from '@/lib/services/storage';
 *
 * const result = await storageService.uploadFile(
 *   buffer,
 *   'items/123/photo.jpg',
 *   'image/jpeg'
 * );
 * ```
 */
export const storageService = new S3StorageService();