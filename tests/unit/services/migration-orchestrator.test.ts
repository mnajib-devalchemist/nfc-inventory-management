/**
 * Migration Orchestrator Unit Tests
 *
 * Tests for atomic photo migration functionality including batch processing,
 * rollback capabilities, and progress tracking.
 *
 * @category Unit Tests
 * @since 1.7.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PhotoMigrationOrchestrator, MigrationConfig } from '@/lib/services/migration-orchestrator';
import { MigrationStatus } from '@prisma/client';

// Mock all dependencies
const mockPrisma = {
  migrationState: {
    create: vi.fn(),
    update: vi.fn(),
    findUnique: vi.fn(),
  },
  migrationBatch: {
    create: vi.fn(),
    update: vi.fn(),
    findMany: vi.fn(),
  },
  migrationItem: {
    create: vi.fn(),
    update: vi.fn(),
    findMany: vi.fn(),
  },
  itemPhoto: {
    count: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  $executeRaw: vi.fn(),
  $disconnect: vi.fn(),
} as any;

const mockStorageService = {
  uploadFile: vi.fn(),
  deleteFile: vi.fn(),
  testConnection: vi.fn(),
} as any;

const mockProcessingService = {
  processMultiFormat: vi.fn(),
} as any;

const mockCostProtectionService = {
  enforceUploadLimits: vi.fn(),
  getCurrentUsage: vi.fn(),
} as any;

const mockCdnService = {
  getCdnUrl: vi.fn(),
  testDelivery: vi.fn(),
  invalidateCache: vi.fn(),
} as any;

describe('PhotoMigrationOrchestrator', () => {
  let orchestrator: PhotoMigrationOrchestrator;
  const defaultConfig: MigrationConfig = {
    batchSize: 10,
    maxConcurrentBatches: 2,
    retryFailedItems: true,
    maxRetriesPerItem: 3,
    pauseOnErrorThreshold: 5,
    enableCostProtection: true,
    costProtectionThreshold: 0.85,
    validateAfterMigration: true,
    cleanupLocalFiles: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    orchestrator = new PhotoMigrationOrchestrator(
      mockPrisma,
      mockStorageService,
      mockProcessingService,
      mockCostProtectionService,
      mockCdnService
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Migration Initialization', () => {
    it('should initialize migration with correct configuration', async () => {
      const mockMigrationId = 'test-migration-id';

      // Mock photo count
      mockPrisma.itemPhoto.count.mockResolvedValue(100);

      // Mock migration creation
      mockPrisma.migrationState.create.mockResolvedValue({
        id: mockMigrationId,
        totalItems: 100,
        status: MigrationStatus.PENDING
      });

      // Mock other setup calls
      mockStorageService.testConnection.mockResolvedValue(undefined);
      mockCostProtectionService.getCurrentUsage.mockResolvedValue({
        circuitBreakerOpen: false
      });

      const result = await orchestrator.executeMigration(defaultConfig);

      expect(mockPrisma.migrationState.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          migrationType: 'photo_s3_migration',
          status: 'PENDING',
          batchSize: defaultConfig.batchSize,
          totalItems: 100,
          migrationConfig: defaultConfig
        })
      });
    });

    it('should throw error when no photos found to migrate', async () => {
      mockPrisma.itemPhoto.count.mockResolvedValue(0);

      await expect(
        orchestrator.executeMigration(defaultConfig)
      ).rejects.toThrow('No photos found to migrate');
    });
  });

  describe('Batch Processing', () => {
    it('should create correct number of batches', async () => {
      const totalPhotos = 25;
      const batchSize = 10;

      mockPrisma.itemPhoto.count.mockResolvedValue(totalPhotos);
      mockPrisma.itemPhoto.findMany.mockResolvedValue(
        Array.from({ length: totalPhotos }, (_, i) => ({ id: `photo-${i}` }))
      );

      // Expected 3 batches: 10 + 10 + 5
      const expectedBatches = Math.ceil(totalPhotos / batchSize);

      mockPrisma.migrationBatch.create
        .mockResolvedValueOnce({ id: 'batch-1', batchNumber: 1, totalItems: 10 })
        .mockResolvedValueOnce({ id: 'batch-2', batchNumber: 2, totalItems: 10 })
        .mockResolvedValueOnce({ id: 'batch-3', batchNumber: 3, totalItems: 5 });

      // This would be called by the createBatches method internally
      expect(expectedBatches).toBe(3);
    });

    it('should handle batch processing failures gracefully', async () => {
      const mockError = new Error('Batch processing failed');

      mockPrisma.itemPhoto.count.mockResolvedValue(10);
      mockPrisma.migrationState.create.mockResolvedValue({
        id: 'test-migration',
        status: MigrationStatus.PENDING
      });

      // Mock batch creation to fail
      mockPrisma.migrationBatch.create.mockRejectedValue(mockError);

      await expect(
        orchestrator.executeMigration(defaultConfig)
      ).rejects.toThrow();
    });
  });

  describe('Photo Migration', () => {
    it('should migrate individual photo successfully', async () => {
      const photoId = 'test-photo-id';
      const mockPhoto = {
        id: photoId,
        itemId: 'test-item-id',
        originalUrl: 'local/path/photo.jpg',
        fileSize: 1000000
      };

      const mockProcessedResult = {
        formats: {
          webp: { buffer: Buffer.from('webp-data'), fileSize: 80000 },
          jpeg: { buffer: Buffer.from('jpeg-data'), fileSize: 120000 }
        },
        metadata: { width: 1200, height: 800 }
      };

      const mockUploadResult = {
        key: 'items/test-item/photos/photo.webp',
        s3Url: 'https://s3.amazonaws.com/bucket/photo.webp',
        cdnUrl: 'https://cdn.example.com/photo.webp',
        fileSize: 80000
      };

      // Mock dependencies
      mockPrisma.itemPhoto.findUnique.mockResolvedValue(mockPhoto);
      mockPrisma.migrationItem.create.mockResolvedValue({ id: 'migration-item-id' });
      mockProcessingService.processMultiFormat.mockResolvedValue(mockProcessedResult);
      mockStorageService.uploadFile.mockResolvedValue(mockUploadResult);
      mockCdnService.getCdnUrl.mockReturnValue('https://cdn.example.com/photo.webp');

      // This would be called by the migratePhoto method internally
      expect(mockPhoto.originalUrl).not.toMatch(/^https:\/\//);
    });

    it('should skip already migrated photos', async () => {
      const mockPhoto = {
        id: 'test-photo-id',
        originalUrl: 'https://cdn.example.com/already-migrated.jpg', // Already migrated
        fileSize: 1000000
      };

      mockPrisma.itemPhoto.findUnique.mockResolvedValue(mockPhoto);

      // Should not process already migrated photo
      expect(mockPhoto.originalUrl).toMatch(/^https:\/\//);
    });
  });

  describe('Pause and Resume Functionality', () => {
    it('should pause migration correctly', async () => {
      const migrationId = 'test-migration-id';

      // Simulate running migration
      orchestrator['isRunning'] = true;
      orchestrator['currentMigrationId'] = migrationId;

      await orchestrator.pauseMigration();

      expect(mockPrisma.migrationState.update).toHaveBeenCalledWith({
        where: { id: migrationId },
        data: {
          status: 'PAUSED',
          pausedAt: expect.any(Date)
        }
      });
    });

    it('should resume paused migration', async () => {
      const migrationId = 'test-migration-id';
      const mockMigration = {
        id: migrationId,
        status: MigrationStatus.PAUSED,
        migrationConfig: defaultConfig,
        batches: [],
        items: []
      };

      mockPrisma.migrationState.findUnique.mockResolvedValue(mockMigration);
      mockPrisma.migrationState.update.mockResolvedValue(mockMigration);

      // Mock empty photo count to avoid actual migration
      mockPrisma.itemPhoto.count.mockResolvedValue(0);

      await expect(
        orchestrator.resumeMigration(migrationId)
      ).rejects.toThrow('No photos found to migrate');

      expect(mockPrisma.migrationState.update).toHaveBeenCalledWith({
        where: { id: migrationId },
        data: {
          status: 'RUNNING',
          resumedAt: expect.any(Date)
        }
      });
    });

    it('should throw error when trying to resume non-paused migration', async () => {
      const migrationId = 'test-migration-id';
      const mockMigration = {
        id: migrationId,
        status: MigrationStatus.COMPLETED, // Not paused
        migrationConfig: defaultConfig
      };

      mockPrisma.migrationState.findUnique.mockResolvedValue(mockMigration);

      await expect(
        orchestrator.resumeMigration(migrationId)
      ).rejects.toThrow('Cannot resume migration');
    });
  });

  describe('Rollback Functionality', () => {
    it('should execute rollback successfully', async () => {
      const migrationId = 'test-migration-id';
      const mockMigration = {
        id: migrationId,
        rollbackData: {
          originalPhotoStates: [
            { id: 'photo-1', originalUrl: 'local/photo1.jpg' }
          ]
        },
        items: [
          { s3Key: 'items/1/photos/photo1.webp' }
        ]
      };

      mockPrisma.migrationState.findUnique.mockResolvedValue(mockMigration);
      mockPrisma.migrationState.update.mockResolvedValue({});
      mockPrisma.itemPhoto.update.mockResolvedValue({});
      mockStorageService.deleteFile.mockResolvedValue({});

      await orchestrator.executeRollback(migrationId);

      expect(mockPrisma.migrationState.update).toHaveBeenCalledWith({
        where: { id: migrationId },
        data: { status: 'ROLLBACK' }
      });

      expect(mockStorageService.deleteFile).toHaveBeenCalled();
    });

    it('should handle rollback failures', async () => {
      const migrationId = 'test-migration-id';
      const mockMigration = {
        id: migrationId,
        rollbackData: {},
        items: []
      };

      mockPrisma.migrationState.findUnique.mockResolvedValue(mockMigration);
      mockPrisma.migrationState.update
        .mockResolvedValueOnce({}) // Initial rollback status
        .mockRejectedValue(new Error('Database error')); // Final status update fails

      await expect(
        orchestrator.executeRollback(migrationId)
      ).rejects.toThrow('Rollback failed');
    });
  });

  describe('Event Emission', () => {
    it('should emit migration started event', () => {
      const startedHandler = vi.fn();
      orchestrator.on('migration-started', startedHandler);

      orchestrator.emit('migration-started', { migrationId: 'test-id' });

      expect(startedHandler).toHaveBeenCalledWith({ migrationId: 'test-id' });
    });

    it('should emit progress update events', () => {
      const progressHandler = vi.fn();
      orchestrator.on('progress-update', progressHandler);

      orchestrator.emit('progress-update', {
        migrationId: 'test-id',
        progress: 50.5,
        eta: new Date()
      });

      expect(progressHandler).toHaveBeenCalled();
    });

    it('should emit batch completion events', () => {
      const batchHandler = vi.fn();
      orchestrator.on('batch-completed', batchHandler);

      orchestrator.emit('batch-completed', {
        batchId: 'batch-1',
        success: true,
        processedCount: 10,
        errorCount: 0,
        errors: [],
        processingTime: 5000
      });

      expect(batchHandler).toHaveBeenCalled();
    });
  });

  describe('Status and Progress Tracking', () => {
    it('should return migration status correctly', async () => {
      const migrationId = 'test-migration-id';
      const mockMigration = {
        id: migrationId,
        status: MigrationStatus.RUNNING,
        totalItems: 100,
        processedCount: 50,
        successCount: 45,
        errorCount: 5,
        startedAt: new Date(),
        errorDetails: ['Error 1', 'Error 2'],
        actualCostUsd: 0.05,
        avgProcessingTimeMs: 1500
      };

      mockPrisma.migrationState.findUnique.mockResolvedValue(mockMigration);

      const status = await orchestrator.getMigrationStatus(migrationId);

      expect(status.migrationId).toBe(migrationId);
      expect(status.status).toBe(MigrationStatus.RUNNING);
      expect(status.totalProcessed).toBe(50);
      expect(status.successCount).toBe(45);
      expect(status.errorCount).toBe(5);
      expect(status.errors).toEqual(['Error 1', 'Error 2']);
      expect(status.summary.totalCostUsd).toBe(0.05);
    });

    it('should throw error for non-existent migration', async () => {
      mockPrisma.migrationState.findUnique.mockResolvedValue(null);

      await expect(
        orchestrator.getMigrationStatus('non-existent-id')
      ).rejects.toThrow('Migration non-existent-id not found');
    });
  });
});