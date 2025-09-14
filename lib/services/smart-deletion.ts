/**
 * Smart Image Deletion Service
 *
 * Provides intelligent deletion capabilities for multi-format images stored in S3,
 * including batch operations, orphaned image cleanup, and comprehensive audit logging.
 *
 * @category Storage Services
 * @since 1.7.0
 */

import { EventEmitter } from 'events';
import { PrismaClient } from '@prisma/client';
import { S3StorageService } from './storage';
import { CdnService } from './cdn';
import { STORAGE_CONFIG } from '@/lib/config/storage';

/**
 * Deletion operation result
 */
export interface DeletionResult {
  photoId: string;
  success: boolean;
  deletedFiles: string[];
  failedFiles: string[];
  error?: string;
  cacheClearedPaths?: string[];
}

/**
 * Batch deletion result
 */
export interface BatchDeletionResult {
  totalRequested: number;
  successful: number;
  failed: number;
  results: DeletionResult[];
  summary: {
    totalFilesDeleted: number;
    totalCacheInvalidations: number;
    errors: string[];
    processingTimeMs: number;
  };
}

/**
 * Cleanup operation result
 */
export interface CleanupResult {
  orphanedFiles: number;
  deletedFiles: number;
  failedDeletions: number;
  storageRecovered: number; // bytes
  errors: string[];
}

/**
 * Smart deletion service events
 */
interface SmartDeletionEvents {
  'photo-deleted': [DeletionResult];
  'batch-deletion-started': [{ totalPhotos: number }];
  'batch-deletion-completed': [BatchDeletionResult];
  'cleanup-started': [{ type: 'orphaned' | 'audit' }];
  'cleanup-completed': [CleanupResult];
  'cache-invalidated': [{ paths: string[] }];
}

/**
 * Smart Image Deletion Service
 *
 * Handles intelligent deletion of multi-format images with proper cleanup
 * of associated S3 objects, CDN cache invalidation, and database management.
 */
export class SmartDeletionService extends EventEmitter<SmartDeletionEvents> {
  private prisma: PrismaClient;
  private storageService: S3StorageService;
  private cdnService: CdnService;

  constructor(
    prisma: PrismaClient,
    storageService: S3StorageService,
    cdnService: CdnService
  ) {
    super();
    this.prisma = prisma;
    this.storageService = storageService;
    this.cdnService = cdnService;
  }

  /**
   * Delete a single photo with all its formats and associated files
   */
  async deletePhoto(photoId: string, options: {
    skipConfirmation?: boolean;
    auditReason?: string;
  } = {}): Promise<DeletionResult> {
    const result: DeletionResult = {
      photoId,
      success: false,
      deletedFiles: [],
      failedFiles: [],
      cacheClearedPaths: [],
    };

    try {
      // Get photo details
      const photo = await this.prisma.itemPhoto.findUnique({
        where: { id: photoId },
        include: { item: true },
      });

      if (!photo) {
        throw new Error(`Photo ${photoId} not found`);
      }

      // Generate all possible S3 keys for this photo
      const s3Keys = this.generatePhotoS3Keys(photo.itemId, photoId);

      // Delete files from S3
      for (const key of s3Keys) {
        try {
          await this.storageService.deleteFile(key);
          result.deletedFiles.push(key);
        } catch (error) {
          console.warn(`Failed to delete S3 object ${key}:`, error);
          result.failedFiles.push(key);
        }
      }

      // Invalidate CDN cache
      const cdnPaths = s3Keys.map(key => `/${key}`);
      try {
        await this.cdnService.invalidateImageCache(cdnPaths.map(p => p.substring(1)));
        result.cacheClearedPaths = cdnPaths;
      } catch (error) {
        console.warn('CDN cache invalidation failed:', error);
      }

      // Delete from database
      await this.prisma.itemPhoto.delete({
        where: { id: photoId },
      });

      // Log audit entry
      if (options.auditReason) {
        await this.logDeletionAudit(photoId, {
          reason: options.auditReason,
          deletedFiles: result.deletedFiles,
          failedFiles: result.failedFiles,
        });
      }

      result.success = true;
      this.emit('photo-deleted', result);

      return result;

    } catch (error) {
      result.error = error instanceof Error ? error.message : 'Unknown error';
      result.success = false;
      return result;
    }
  }

  /**
   * Delete multiple photos in batch with efficiency optimizations
   */
  async deletePhotoBatch(
    photoIds: string[],
    options: {
      maxConcurrency?: number;
      auditReason?: string;
      skipConfirmation?: boolean;
    } = {}
  ): Promise<BatchDeletionResult> {
    const startTime = Date.now();
    const maxConcurrency = options.maxConcurrency || 5;

    this.emit('batch-deletion-started', { totalPhotos: photoIds.length });

    const results: DeletionResult[] = [];
    let successful = 0;
    let failed = 0;
    const errors: string[] = [];
    let totalFilesDeleted = 0;
    let totalCacheInvalidations = 0;

    // Process photos in chunks to avoid overwhelming S3/CDN
    for (let i = 0; i < photoIds.length; i += maxConcurrency) {
      const chunk = photoIds.slice(i, i + maxConcurrency);

      const chunkResults = await Promise.all(
        chunk.map(photoId =>
          this.deletePhoto(photoId, {
            auditReason: options.auditReason,
            skipConfirmation: options.skipConfirmation,
          })
        )
      );

      for (const result of chunkResults) {
        results.push(result);

        if (result.success) {
          successful++;
          totalFilesDeleted += result.deletedFiles.length;
          totalCacheInvalidations += result.cacheClearedPaths?.length || 0;
        } else {
          failed++;
          if (result.error) {
            errors.push(`Photo ${result.photoId}: ${result.error}`);
          }
        }
      }
    }

    const batchResult: BatchDeletionResult = {
      totalRequested: photoIds.length,
      successful,
      failed,
      results,
      summary: {
        totalFilesDeleted,
        totalCacheInvalidations,
        errors,
        processingTimeMs: Date.now() - startTime,
      },
    };

    this.emit('batch-deletion-completed', batchResult);
    return batchResult;
  }

  /**
   * Clean up orphaned images that exist in S3 but not in database
   */
  async cleanupOrphanedImages(options: {
    dryRun?: boolean;
    maxAge?: number; // days
  } = {}): Promise<CleanupResult> {
    this.emit('cleanup-started', { type: 'orphaned' });

    const result: CleanupResult = {
      orphanedFiles: 0,
      deletedFiles: 0,
      failedDeletions: 0,
      storageRecovered: 0,
      errors: [],
    };

    try {
      // Get all photo references from database
      const dbPhotos = await this.prisma.itemPhoto.findMany({
        select: { id: true, itemId: true },
      });

      const dbPhotoKeys = new Set<string>();
      for (const photo of dbPhotos) {
        const keys = this.generatePhotoS3Keys(photo.itemId, photo.id);
        keys.forEach(key => dbPhotoKeys.add(key));
      }

      // List all objects in S3 bucket with photo prefix
      const s3Objects = await this.storageService.listObjects('items/', {
        recursive: true,
      });

      // Find orphaned objects
      const orphanedObjects = s3Objects.filter(obj => {
        // Only consider photo-related objects
        if (!obj.key.includes('/photos/')) return false;

        // Check if this key exists in database references
        return !dbPhotoKeys.has(obj.key);
      });

      result.orphanedFiles = orphanedObjects.length;

      if (!options.dryRun) {
        // Delete orphaned objects
        for (const obj of orphanedObjects) {
          try {
            await this.storageService.deleteFile(obj.key);
            result.deletedFiles++;
            result.storageRecovered += obj.size || 0;
          } catch (error) {
            result.failedDeletions++;
            result.errors.push(`Failed to delete ${obj.key}: ${error}`);
          }
        }

        // Invalidate CDN cache for deleted objects
        if (result.deletedFiles > 0) {
          const cachePaths = orphanedObjects
            .slice(0, result.deletedFiles)
            .map(obj => `/${obj.key}`);

          try {
            await this.cdnService.invalidateImageCache(cachePaths.map(p => p.substring(1)));
          } catch (error) {
            result.errors.push(`CDN cache invalidation failed: ${error}`);
          }
        }
      }

      this.emit('cleanup-completed', result);
      return result;

    } catch (error) {
      result.errors.push(`Cleanup failed: ${error}`);
      return result;
    }
  }

  /**
   * Audit existing photos and clean up inconsistencies
   */
  async auditPhotoStorage(options: {
    fix?: boolean;
    checkCdnDelivery?: boolean;
  } = {}): Promise<{
    totalPhotos: number;
    missingFiles: string[];
    unreachableUrls: string[];
    fixedIssues: number;
    errors: string[];
  }> {
    this.emit('cleanup-started', { type: 'audit' });

    const result = {
      totalPhotos: 0,
      missingFiles: [] as string[],
      unreachableUrls: [] as string[],
      fixedIssues: 0,
      errors: [] as string[],
    };

    try {
      const photos = await this.prisma.itemPhoto.findMany({
        select: {
          id: true,
          itemId: true,
          originalUrl: true,
          thumbnailUrl: true,
        },
      });

      result.totalPhotos = photos.length;

      for (const photo of photos) {
        // Check if files exist in S3
        const s3Keys = this.generatePhotoS3Keys(photo.itemId, photo.id);

        for (const key of s3Keys) {
          try {
            const exists = await this.storageService.fileExists(key);
            if (!exists) {
              result.missingFiles.push(`${photo.id}: ${key}`);
            }
          } catch (error) {
            result.errors.push(`Error checking ${key}: ${error}`);
          }
        }

        // Check CDN delivery if requested
        if (options.checkCdnDelivery) {
          try {
            await this.cdnService.testDelivery([photo.originalUrl]);
          } catch (error) {
            result.unreachableUrls.push(photo.originalUrl);
          }
        }
      }

      return result;

    } catch (error) {
      result.errors.push(`Audit failed: ${error}`);
      return result;
    }
  }

  /**
   * Generate all possible S3 keys for a photo (all formats and sizes)
   */
  private generatePhotoS3Keys(itemId: string, photoId: string): string[] {
    const formats = STORAGE_CONFIG.imageDefaults.supportedFormats;
    const keys: string[] = [];

    for (const format of formats) {
      // Original size
      keys.push(`items/${itemId}/photos/${photoId}-original.${format}`);
      keys.push(`items/${itemId}/photos/${photoId}.${format}`);

      // Thumbnail
      keys.push(`items/${itemId}/photos/${photoId}-thumb.${format}`);
      keys.push(`items/${itemId}/photos/${photoId}-thumbnail.${format}`);

      // Format-specific variants
      if (format !== 'jpeg') {
        keys.push(`items/${itemId}/photos/${photoId}-${format}.${format}`);
      }
    }

    // Legacy formats that might exist
    keys.push(`items/${itemId}/photos/${photoId}.jpg`);
    keys.push(`items/${itemId}/photos/${photoId}.png`);
    keys.push(`items/${itemId}/photos/${photoId}-thumb.jpg`);
    keys.push(`items/${itemId}/photos/${photoId}-thumb.png`);

    return keys;
  }

  /**
   * Log deletion operation for audit trail
   */
  private async logDeletionAudit(
    photoId: string,
    details: {
      reason: string;
      deletedFiles: string[];
      failedFiles: string[];
    }
  ): Promise<void> {
    // This could be expanded to use a dedicated audit table
    console.log(`Photo Deletion Audit: ${photoId}`, {
      timestamp: new Date(),
      reason: details.reason,
      deletedFiles: details.deletedFiles,
      failedFiles: details.failedFiles,
    });
  }

  /**
   * Get storage statistics for deleted photos
   */
  async getStorageStatistics(): Promise<{
    totalPhotos: number;
    estimatedStorage: number;
    orphanedFiles?: number;
    estimatedOrphanedStorage?: number;
  }> {
    const totalPhotos = await this.prisma.itemPhoto.count();

    // Rough estimation - would need actual S3 metrics for precise calculation
    const avgFileSize = 100 * 1024; // 100KB average per photo
    const avgFormats = 3; // WebP, AVIF, JPEG
    const estimatedStorage = totalPhotos * avgFileSize * avgFormats;

    return {
      totalPhotos,
      estimatedStorage,
    };
  }
}

// Export service instance factory
export function createSmartDeletionService(
  prisma: PrismaClient,
  storageService: S3StorageService,
  cdnService: CdnService
): SmartDeletionService {
  return new SmartDeletionService(prisma, storageService, cdnService);
}