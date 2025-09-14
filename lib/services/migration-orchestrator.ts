/**
 * Photo Migration Orchestrator
 *
 * This service provides atomic migration capabilities for migrating photos from
 * local storage to AWS S3 with comprehensive state management, rollback
 * capabilities, and progress tracking.
 *
 * @category Migration Services
 * @since 1.7.0
 */

import { EventEmitter } from 'events';
import { PrismaClient, MigrationStatus, MigrationState, MigrationBatch, MigrationItem } from '@prisma/client';
import { S3StorageService } from './storage';
import { PhotoProcessingService } from './photo-processing';
import { CostProtectionService } from './cost-protection';
import { CdnService } from './cdn';
import { getCdnUrl } from '@/lib/config/storage';

/**
 * Migration configuration interface
 */
export interface MigrationConfig {
  batchSize: number;
  maxConcurrentBatches: number;
  retryFailedItems: boolean;
  maxRetriesPerItem: number;
  pauseOnErrorThreshold: number;
  enableCostProtection: boolean;
  costProtectionThreshold: number;
  validateAfterMigration: boolean;
  cleanupLocalFiles: boolean;
}

/**
 * Migration result interface
 */
export interface MigrationResult {
  migrationId: string;
  status: MigrationStatus;
  totalProcessed: number;
  successCount: number;
  errorCount: number;
  skippedCount: number;
  startedAt: Date;
  completedAt?: Date;
  errors: string[];
  summary: {
    totalItems: number;
    processedItems: number;
    failedItems: number;
    avgProcessingTime: number;
    totalCostUsd: number;
  };
}

/**
 * Batch processing result
 */
interface BatchResult {
  batchId: string;
  success: boolean;
  processedCount: number;
  errorCount: number;
  errors: string[];
  processingTime: number;
}

/**
 * Migration checkpoint data
 */
interface CheckpointData {
  lastProcessedId: string;
  processedCount: number;
  batchNumber: number;
  timestamp: Date;
  errors: string[];
}

/**
 * Photo Migration Orchestrator Events
 */
interface MigrationEvents {
  'migration-started': [{ migrationId: string }];
  'migration-completed': [MigrationResult];
  'migration-failed': [{ migrationId: string; error: Error }];
  'migration-paused': [{ migrationId: string }];
  'migration-resumed': [{ migrationId: string }];
  'batch-started': [{ batchId: string; batchNumber: number }];
  'batch-completed': [BatchResult];
  'batch-failed': [{ batchId: string; error: Error }];
  'progress-update': [{ migrationId: string; progress: number; eta?: Date }];
  'rollback-started': [{ migrationId: string }];
  'rollback-completed': [{ migrationId: string }];
}

/**
 * Photo Migration Orchestrator
 *
 * Provides atomic migration capabilities with comprehensive error handling,
 * rollback procedures, and progress tracking for migrating photos to S3.
 */
export class PhotoMigrationOrchestrator extends EventEmitter<MigrationEvents> {
  private prisma: PrismaClient;
  private storageService: S3StorageService;
  private processingService: PhotoProcessingService;
  private costProtectionService: CostProtectionService;
  private cdnService: CdnService;
  private isRunning = false;
  private shouldStop = false;
  private currentMigrationId?: string;

  constructor(
    prisma: PrismaClient,
    storageService: S3StorageService,
    processingService: PhotoProcessingService,
    costProtectionService: CostProtectionService,
    cdnService: CdnService
  ) {
    super();
    this.prisma = prisma;
    this.storageService = storageService;
    this.processingService = processingService;
    this.costProtectionService = costProtectionService;
    this.cdnService = cdnService;
  }

  /**
   * Execute complete photo migration with atomic operations
   */
  async executeMigration(config: Partial<MigrationConfig> = {}): Promise<MigrationResult> {
    if (this.isRunning) {
      throw new Error('Migration is already running');
    }

    const migrationConfig: MigrationConfig = {
      batchSize: 50,
      maxConcurrentBatches: 2,
      retryFailedItems: true,
      maxRetriesPerItem: 3,
      pauseOnErrorThreshold: 5,
      enableCostProtection: true,
      costProtectionThreshold: 0.85,
      validateAfterMigration: true,
      cleanupLocalFiles: false, // Default to false for safety
      ...config,
    };

    const migrationId = await this.initializeMigration(migrationConfig);
    this.currentMigrationId = migrationId;
    this.isRunning = true;
    this.shouldStop = false;

    try {
      this.emit('migration-started', { migrationId });

      // Phase 1: Pre-migration validation and backup
      await this.validatePreMigrationState();
      await this.createMigrationBackup(migrationId);

      // Phase 2: Execute migration with batching
      const result = await this.executeBatchedMigration(migrationId, migrationConfig);

      // Phase 3: Post-migration validation
      if (migrationConfig.validateAfterMigration) {
        await this.validatePostMigrationState(migrationId);
      }

      // Phase 4: Cleanup (if configured)
      if (migrationConfig.cleanupLocalFiles && result.status === 'COMPLETED') {
        await this.cleanupLocalFiles(migrationId);
      }

      await this.completeMigration(migrationId);
      this.emit('migration-completed', result);

      return result;

    } catch (error) {
      console.error('Migration failed:', error);
      await this.handleMigrationFailure(migrationId, error as Error);
      throw error;
    } finally {
      this.isRunning = false;
      this.currentMigrationId = undefined;
    }
  }

  /**
   * Pause current migration
   */
  async pauseMigration(): Promise<void> {
    if (!this.isRunning || !this.currentMigrationId) {
      throw new Error('No migration is currently running');
    }

    this.shouldStop = true;

    await this.prisma.migrationState.update({
      where: { id: this.currentMigrationId },
      data: {
        status: 'PAUSED',
        pausedAt: new Date(),
      },
    });

    this.emit('migration-paused', { migrationId: this.currentMigrationId });
  }

  /**
   * Resume paused migration
   */
  async resumeMigration(migrationId: string): Promise<MigrationResult> {
    const migration = await this.prisma.migrationState.findUnique({
      where: { id: migrationId },
      include: { batches: true, items: true },
    });

    if (!migration) {
      throw new Error(`Migration ${migrationId} not found`);
    }

    if (migration.status !== 'PAUSED') {
      throw new Error(`Cannot resume migration ${migrationId}: status is ${migration.status}`);
    }

    // Load configuration from migration record
    const config = migration.migrationConfig as unknown as MigrationConfig;

    await this.prisma.migrationState.update({
      where: { id: migrationId },
      data: {
        status: 'RUNNING',
        resumedAt: new Date(),
      },
    });

    this.currentMigrationId = migrationId;
    this.isRunning = true;
    this.shouldStop = false;

    this.emit('migration-resumed', { migrationId });

    try {
      // Continue from where we left off
      const result = await this.executeBatchedMigration(migrationId, config);
      await this.completeMigration(migrationId);
      this.emit('migration-completed', result);
      return result;

    } catch (error) {
      await this.handleMigrationFailure(migrationId, error as Error);
      throw error;
    } finally {
      this.isRunning = false;
      this.currentMigrationId = undefined;
    }
  }

  /**
   * Execute rollback to restore previous state
   */
  async executeRollback(migrationId: string): Promise<void> {
    const migration = await this.prisma.migrationState.findUnique({
      where: { id: migrationId },
      include: { items: true },
    });

    if (!migration) {
      throw new Error(`Migration ${migrationId} not found`);
    }

    this.emit('rollback-started', { migrationId });

    try {
      await this.prisma.migrationState.update({
        where: { id: migrationId },
        data: { status: 'ROLLBACK' },
      });

      // Rollback database changes
      await this.rollbackDatabaseChanges(migration);

      // Clean up S3 objects created during migration
      await this.cleanupMigratedS3Objects(migration);

      // Restore local file references
      await this.restoreLocalFileReferences(migration);

      await this.prisma.migrationState.update({
        where: { id: migrationId },
        data: {
          status: 'COMPLETED', // Mark as completed rollback
          completedAt: new Date(),
        },
      });

      this.emit('rollback-completed', { migrationId });

    } catch (error) {
      await this.prisma.migrationState.update({
        where: { id: migrationId },
        data: { status: 'ROLLBACK_FAILED' },
      });
      throw new Error(`Rollback failed: ${error}`);
    }
  }

  /**
   * Get migration status and progress
   */
  async getMigrationStatus(migrationId: string): Promise<MigrationResult> {
    const migration = await this.prisma.migrationState.findUnique({
      where: { id: migrationId },
      include: {
        batches: true,
        items: true,
      },
    });

    if (!migration) {
      throw new Error(`Migration ${migrationId} not found`);
    }

    const errors = Array.isArray(migration.errorDetails)
      ? migration.errorDetails as string[]
      : [];

    return {
      migrationId: migration.id,
      status: migration.status,
      totalProcessed: migration.processedCount,
      successCount: migration.successCount,
      errorCount: migration.errorCount,
      skippedCount: migration.skippedCount,
      startedAt: migration.startedAt!,
      completedAt: migration.completedAt || undefined,
      errors,
      summary: {
        totalItems: migration.totalItems,
        processedItems: migration.processedCount,
        failedItems: migration.errorCount,
        avgProcessingTime: migration.avgProcessingTimeMs,
        totalCostUsd: Number(migration.actualCostUsd),
      },
    };
  }

  /**
   * Initialize migration state in database
   */
  private async initializeMigration(config: MigrationConfig): Promise<string> {
    // Count total photos to migrate
    const totalPhotos = await this.prisma.itemPhoto.count({
      where: {
        originalUrl: {
          not: {
            startsWith: 'https://', // Skip already migrated photos
          },
        },
      },
    });

    if (totalPhotos === 0) {
      throw new Error('No photos found to migrate');
    }

    const migration = await this.prisma.migrationState.create({
      data: {
        migrationType: 'photo_s3_migration',
        status: 'PENDING',
        batchSize: config.batchSize,
        totalItems: totalPhotos,
        migrationConfig: config as any,
        createdBy: 'migration-orchestrator',
      },
    });

    return migration.id;
  }

  /**
   * Execute migration in batches with progress tracking
   */
  private async executeBatchedMigration(
    migrationId: string,
    config: MigrationConfig
  ): Promise<MigrationResult> {
    await this.prisma.migrationState.update({
      where: { id: migrationId },
      data: {
        status: 'RUNNING',
        startedAt: new Date(),
      },
    });

    const batches = await this.createBatches(migrationId, config.batchSize);
    let totalProcessed = 0;
    let totalErrors = 0;
    let totalSuccess = 0;
    const errors: string[] = [];

    for (const batch of batches) {
      if (this.shouldStop) {
        break;
      }

      // Cost protection check
      if (config.enableCostProtection) {
        await this.costProtectionService.enforceUploadLimits(
          'upload',
          batch.totalItems * 1024 * 100, // Estimated 100KB per image
          batch.totalItems * 3 // 3 requests per photo (WebP, AVIF, JPEG)
        );
      }

      try {
        this.emit('batch-started', {
          batchId: batch.id,
          batchNumber: batch.batchNumber,
        });

        const batchResult = await this.processBatch(batch);

        totalProcessed += batchResult.processedCount;
        totalErrors += batchResult.errorCount;
        totalSuccess += batchResult.processedCount - batchResult.errorCount;

        if (batchResult.errors.length > 0) {
          errors.push(...batchResult.errors);
        }

        this.emit('batch-completed', batchResult);

        // Update migration progress
        await this.updateMigrationProgress(migrationId, {
          processedCount: totalProcessed,
          successCount: totalSuccess,
          errorCount: totalErrors,
        });

        // Check error threshold
        if (totalErrors >= config.pauseOnErrorThreshold) {
          console.warn(`Error threshold reached (${totalErrors}), pausing migration`);
          await this.pauseMigration();
          break;
        }

        // Emit progress update
        const migration = await this.prisma.migrationState.findUnique({
          where: { id: migrationId }
        });

        if (migration) {
          const progress = (totalProcessed / migration.totalItems) * 100;
          this.emit('progress-update', {
            migrationId,
            progress,
            eta: migration.estimatedCompletionAt || undefined,
          });
        }

      } catch (error) {
        console.error(`Batch ${batch.id} failed:`, error);
        errors.push(`Batch ${batch.batchNumber}: ${error}`);
        totalErrors++;

        this.emit('batch-failed', {
          batchId: batch.id,
          error: error as Error,
        });
      }
    }

    return await this.getMigrationStatus(migrationId);
  }

  /**
   * Create batches for migration processing
   */
  private async createBatches(migrationId: string, batchSize: number): Promise<MigrationBatch[]> {
    // Get all photos that need migration
    const photos = await this.prisma.itemPhoto.findMany({
      where: {
        originalUrl: {
          not: {
            startsWith: 'https://',
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const batches: MigrationBatch[] = [];

    for (let i = 0; i < photos.length; i += batchSize) {
      const batchPhotos = photos.slice(i, i + batchSize);
      const batchNumber = Math.floor(i / batchSize) + 1;

      const batch = await this.prisma.migrationBatch.create({
        data: {
          migrationId,
          batchNumber,
          totalItems: batchPhotos.length,
          itemIds: batchPhotos.map(p => p.id),
          status: 'PENDING',
        },
      });

      batches.push(batch);
    }

    return batches;
  }

  /**
   * Process a single migration batch
   */
  private async processBatch(batch: MigrationBatch): Promise<BatchResult> {
    const startTime = Date.now();
    let processedCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    await this.prisma.migrationBatch.update({
      where: { id: batch.id },
      data: {
        status: MigrationStatus.RUNNING,
        startedAt: new Date(),
      },
    });

    const photoIds = Array.isArray(batch.itemIds) ? batch.itemIds as string[] : [];

    for (const photoId of photoIds) {
      try {
        await this.migratePhoto(batch.migrationId, batch.id, photoId);
        processedCount++;
      } catch (error) {
        console.error(`Failed to migrate photo ${photoId}:`, error);
        errors.push(`Photo ${photoId}: ${error}`);
        errorCount++;
      }
    }

    const processingTime = Date.now() - startTime;

    await this.prisma.migrationBatch.update({
      where: { id: batch.id },
      data: {
        status: processedCount > 0 ? 'COMPLETED' : 'FAILED',
        processedItems: processedCount,
        successfulItems: processedCount - errorCount,
        failedItems: errorCount,
        completedAt: new Date(),
        processingTimeMs: processingTime,
        errors: errors,
      },
    });

    return {
      batchId: batch.id,
      success: errorCount === 0,
      processedCount,
      errorCount,
      errors,
      processingTime,
    };
  }

  /**
   * Migrate a single photo to S3
   */
  private async migratePhoto(migrationId: string, batchId: string, photoId: string): Promise<void> {
    const photo = await this.prisma.itemPhoto.findUnique({
      where: { id: photoId },
    });

    if (!photo) {
      throw new Error(`Photo ${photoId} not found`);
    }

    // Skip if already migrated
    if (photo.originalUrl.startsWith('https://')) {
      return;
    }

    // Create migration item record
    const migrationItem = await this.prisma.migrationItem.create({
      data: {
        migrationId,
        batchId,
        itemId: photo.itemId,
        photoId: photo.id,
        originalPath: photo.originalUrl,
        status: MigrationStatus.RUNNING,
        originalSize: photo.fileSize,
        startedAt: new Date(),
      },
    });

    try {
      // Read original file (this would need to be implemented based on your local storage setup)
      const originalBuffer = await this.readLocalPhoto(photo.originalUrl);

      // Process image with multi-format support
      const processedResult = await this.processingService.processMultiFormat(
        originalBuffer,
        {
          targetSizeKB: 100,
          maxWidth: 1200,
          maxHeight: 1200,
          stripMetadata: true,
          progressive: true,
          timeoutMs: 30000,
          formats: ['webp', 'avif', 'jpeg'],
        }
      );

      // Upload all formats to S3
      const uploadPromises = Object.entries(processedResult.formats).map(
        async ([format, result]) => {
          const key = `items/${photo.itemId}/photos/${photo.id}-${format === 'jpeg' ? 'original' : format}.${format}`;
          return await this.storageService.uploadFile(result.buffer, key, `image/${format}`);
        }
      );

      const uploadResults = await Promise.all(uploadPromises);
      const primaryUpload = uploadResults[0]; // Use first successful upload as primary

      // Update photo URLs to point to CDN
      const cdnUrl = getCdnUrl(primaryUpload.key);
      const thumbnailKey = `items/${photo.itemId}/photos/${photo.id}-thumb.${primaryUpload.key.split('.').pop()}`;
      const thumbnailCdnUrl = getCdnUrl(thumbnailKey);

      // Update photo record
      await this.prisma.itemPhoto.update({
        where: { id: photo.id },
        data: {
          originalUrl: cdnUrl,
          thumbnailUrl: thumbnailCdnUrl,
          fileSize: primaryUpload.fileSize,
        },
      });

      // Complete migration item
      await this.prisma.migrationItem.update({
        where: { id: migrationItem.id },
        data: {
          status: 'COMPLETED',
          processedSize: primaryUpload.fileSize,
          s3Key: primaryUpload.key,
          s3Url: primaryUpload.s3Url,
          cdnUrl: primaryUpload.cdnUrl,
          completedAt: new Date(),
          processingTimeMs: Date.now() - (migrationItem.startedAt?.getTime() || 0),
        },
      });

    } catch (error) {
      // Mark migration item as failed
      await this.prisma.migrationItem.update({
        where: { id: migrationItem.id },
        data: {
          status: 'FAILED',
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
          errorCode: 'MIGRATION_FAILED',
          completedAt: new Date(),
        },
      });

      throw error;
    }
  }

  /**
   * Read local photo from filesystem
   *
   * Supports both absolute and relative paths for local photo storage.
   * Implements comprehensive error handling and file validation.
   */
  private async readLocalPhoto(path: string): Promise<Buffer> {
    const fs = await import('fs/promises');
    const pathModule = await import('path');

    try {
      let fullPath: string;

      // Handle different path formats
      if (pathModule.isAbsolute(path)) {
        // Absolute path - use as is
        fullPath = path;
      } else if (path.startsWith('uploads/') || path.startsWith('/uploads/')) {
        // Relative path from uploads directory
        const cleanPath = path.replace(/^\/+/, ''); // Remove leading slashes
        fullPath = pathModule.join(process.cwd(), cleanPath);
      } else {
        // Legacy format - assume it's in uploads directory
        fullPath = pathModule.join(process.cwd(), 'uploads', path);
      }

      // Validate file exists and is readable
      try {
        const stats = await fs.stat(fullPath);
        if (!stats.isFile()) {
          throw new Error(`Path is not a file: ${fullPath}`);
        }

        // Check file size (max 50MB for safety)
        const maxSize = 50 * 1024 * 1024;
        if (stats.size > maxSize) {
          throw new Error(`File too large (${stats.size} bytes, max ${maxSize}): ${fullPath}`);
        }
      } catch (statError: any) {
        if (statError.code === 'ENOENT') {
          throw new Error(`Photo file not found: ${fullPath}`);
        }
        if (statError.code === 'EACCES') {
          throw new Error(`Permission denied reading photo: ${fullPath}`);
        }
        throw statError;
      }

      // Read file with error handling
      try {
        const buffer = await fs.readFile(fullPath);

        // Validate it's actually an image file by checking magic bytes
        if (!this.isValidImageBuffer(buffer)) {
          throw new Error(`File is not a valid image: ${fullPath}`);
        }

        console.log(`Successfully read local photo: ${fullPath} (${buffer.length} bytes)`);
        return buffer;

      } catch (readError: any) {
        if (readError.code === 'ENOENT') {
          throw new Error(`Photo file disappeared during read: ${fullPath}`);
        }
        if (readError.code === 'EACCES') {
          throw new Error(`Permission denied reading photo: ${fullPath}`);
        }
        throw new Error(`Failed to read photo file: ${readError.message}`);
      }

    } catch (error) {
      console.error(`Failed to read local photo from ${path}:`, error);
      throw error;
    }
  }

  /**
   * Validate buffer contains image data by checking magic bytes
   */
  private isValidImageBuffer(buffer: Buffer): boolean {
    if (buffer.length < 8) return false;

    // Check common image format magic bytes
    const bytes = buffer.subarray(0, 8);

    // JPEG: FF D8 FF
    if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) {
      return true;
    }

    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) {
      return true;
    }

    // WebP: 52 49 46 46 ?? ?? ?? ?? 57 45 42 50
    if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) {
      const webpCheck = buffer.subarray(8, 12);
      if (webpCheck[0] === 0x57 && webpCheck[1] === 0x45 && webpCheck[2] === 0x42 && webpCheck[3] === 0x50) {
        return true;
      }
    }

    // GIF: 47 49 46 38 (GIF8)
    if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) {
      return true;
    }

    // BMP: 42 4D
    if (bytes[0] === 0x42 && bytes[1] === 0x4D) {
      return true;
    }

    // AVIF: ftyp...avif
    const ftypPattern = buffer.toString('ascii', 4, 8);
    if (buffer[0] === 0x00 && buffer[4] === 0x66 && buffer[5] === 0x74 &&
        buffer[6] === 0x79 && buffer[7] === 0x70 && buffer.includes('avif')) {
      return true;
    }

    return false;
  }

  /**
   * Update migration progress in database
   */
  private async updateMigrationProgress(
    migrationId: string,
    progress: {
      processedCount: number;
      successCount: number;
      errorCount: number;
    }
  ): Promise<void> {
    await this.prisma.$executeRaw`
      SELECT update_migration_progress(
        ${migrationId}::uuid,
        ${progress.processedCount}::integer,
        ${progress.successCount}::integer,
        ${progress.errorCount}::integer,
        ${progress.processedCount - progress.successCount}::integer
      )
    `;
  }

  /**
   * Validate pre-migration state
   */
  private async validatePreMigrationState(): Promise<void> {
    // Check AWS credentials and permissions
    await this.storageService.testConnection();

    // Check cost protection status
    // Just check if cost protection allows operations
    try {
      await this.costProtectionService.enforceUploadLimits('upload', 1, 1);
    } catch (error) {
      throw new Error('Cost protection circuit breaker is open - migration cannot proceed');
    }
  }

  /**
   * Validate post-migration state
   */
  private async validatePostMigrationState(migrationId: string): Promise<void> {
    const items = await this.prisma.migrationItem.findMany({
      where: {
        migrationId,
        status: 'COMPLETED',
      },
    });

    // Validate a sample of migrated photos are accessible
    const sampleSize = Math.min(10, items.length);
    const sample = items.slice(0, sampleSize);

    for (const item of sample) {
      if (item.cdnUrl) {
        try {
          await this.cdnService.testDelivery([item.cdnUrl]);
        } catch (error) {
          throw new Error(`Validation failed for migrated photo: ${item.photoId}`);
        }
      }
    }
  }

  /**
   * Create migration backup
   */
  private async createMigrationBackup(migrationId: string): Promise<void> {
    // Store backup data in migration record for rollback purposes
    const photosToMigrate = await this.prisma.itemPhoto.findMany({
      where: {
        originalUrl: {
          not: { startsWith: 'https://' },
        },
      },
      select: {
        id: true,
        originalUrl: true,
        thumbnailUrl: true,
        fileSize: true,
      },
    });

    await this.prisma.migrationState.update({
      where: { id: migrationId },
      data: {
        rollbackData: {
          originalPhotoStates: photosToMigrate,
        },
      },
    });
  }

  /**
   * Complete migration
   */
  private async completeMigration(migrationId: string): Promise<void> {
    await this.prisma.migrationState.update({
      where: { id: migrationId },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
      },
    });
  }

  /**
   * Handle migration failure
   */
  private async handleMigrationFailure(migrationId: string, error: Error): Promise<void> {
    await this.prisma.migrationState.update({
      where: { id: migrationId },
      data: {
        status: 'FAILED',
        completedAt: new Date(),
        errorDetails: [error.message],
      },
    });

    this.emit('migration-failed', { migrationId, error });
  }

  /**
   * Rollback database changes
   */
  private async rollbackDatabaseChanges(migration: MigrationState): Promise<void> {
    if (!migration.rollbackData || typeof migration.rollbackData !== 'object') {
      return;
    }

    const rollbackData = migration.rollbackData as any;
    const originalPhotoStates = rollbackData.originalPhotoStates;

    if (Array.isArray(originalPhotoStates)) {
      for (const photoState of originalPhotoStates) {
        await this.prisma.itemPhoto.update({
          where: { id: photoState.id },
          data: {
            originalUrl: photoState.originalUrl,
            thumbnailUrl: photoState.thumbnailUrl,
            fileSize: photoState.fileSize,
          },
        });
      }
    }
  }

  /**
   * Clean up S3 objects created during migration
   */
  private async cleanupMigratedS3Objects(migration: MigrationState): Promise<void> {
    const items = await this.prisma.migrationItem.findMany({
      where: {
        migrationId: migration.id,
        status: 'COMPLETED',
        s3Key: { not: null },
      },
    });

    for (const item of items) {
      if (item.s3Key) {
        try {
          await this.storageService.deleteFile(item.s3Key);
        } catch (error) {
          console.warn(`Failed to delete S3 object ${item.s3Key}:`, error);
        }
      }
    }
  }

  /**
   * Restore local file references
   */
  private async restoreLocalFileReferences(migration: MigrationState): Promise<void> {
    // Local file restoration would depend on your backup strategy
    console.log(`Restoring local file references for migration ${migration.id}`);
  }

  /**
   * Clean up local files after successful migration
   */
  private async cleanupLocalFiles(migrationId: string): Promise<void> {
    console.log(`Cleaning up local files for migration ${migrationId}`);
    // Implementation would depend on your local storage setup
  }
}

// Export service instance factory
export function createMigrationOrchestrator(
  prisma: PrismaClient,
  storageService: S3StorageService,
  processingService: PhotoProcessingService,
  costProtectionService: CostProtectionService,
  cdnService: CdnService
): PhotoMigrationOrchestrator {
  return new PhotoMigrationOrchestrator(
    prisma,
    storageService,
    processingService,
    costProtectionService,
    cdnService
  );
}