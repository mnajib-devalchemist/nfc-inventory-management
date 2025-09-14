/**
 * S3 Storage Service Unit Tests
 *
 * Tests for S3 operations including upload, download, deletion,
 * and comprehensive error handling with retry logic.
 *
 * @category Unit Tests
 * @since 1.7.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { S3StorageService, S3ErrorType, S3OperationError } from '@/lib/services/storage';

// Mock AWS S3 client
const mockS3Client = {
  send: vi.fn()
};

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn(() => mockS3Client),
  PutObjectCommand: vi.fn(),
  GetObjectCommand: vi.fn(),
  DeleteObjectCommand: vi.fn(),
  DeleteObjectsCommand: vi.fn(),
  HeadObjectCommand: vi.fn(),
  HeadBucketCommand: vi.fn(),
  ListObjectsV2Command: vi.fn(),
  CreateBucketCommand: vi.fn(),
  PutBucketLifecycleConfigurationCommand: vi.fn(),
}));

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn()
}));

describe('S3StorageService', () => {
  let storageService: S3StorageService;

  beforeEach(() => {
    vi.clearAllMocks();
    storageService = new S3StorageService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('File Upload Operations', () => {
    it('should upload file successfully', async () => {
      const mockResponse = {
        ETag: '"mock-etag"',
        VersionId: 'mock-version'
      };

      mockS3Client.send.mockResolvedValue(mockResponse);

      const buffer = Buffer.from('test file content');
      const key = 'items/123/photos/test.jpg';
      const contentType = 'image/jpeg';

      const result = await storageService.uploadFile(buffer, key, contentType);

      expect(result).toEqual({
        key,
        bucket: expect.any(String),
        cdnUrl: expect.stringContaining(key),
        s3Url: expect.stringContaining(key),
        fileSize: buffer.length,
        contentType,
        etag: '"mock-etag"',
        uploadedAt: expect.any(Date)
      });
    });

    it('should handle upload failures with retry logic', async () => {
      const networkError = new Error('Network timeout');
      networkError.name = 'TimeoutError';

      // Fail twice, succeed on third try
      mockS3Client.send
        .mockRejectedValueOnce(networkError)
        .mockRejectedValueOnce(networkError)
        .mockResolvedValue({ ETag: '"success-etag"' });

      const buffer = Buffer.from('test content');
      const result = await storageService.uploadFile(buffer, 'test.jpg', 'image/jpeg');

      expect(result.etag).toBe('"success-etag"');
      expect(mockS3Client.send).toHaveBeenCalledTimes(3); // 2 retries + 1 success
    });

    it('should throw S3OperationError after max retries exceeded', async () => {
      const persistentError = new Error('Persistent network failure');
      persistentError.name = 'NetworkingError';

      mockS3Client.send.mockRejectedValue(persistentError);

      await expect(
        storageService.uploadFile(Buffer.from('test'), 'test.jpg', 'image/jpeg')
      ).rejects.toThrow(S3OperationError);

      // Should retry 3 times (network failure strategy)
      expect(mockS3Client.send).toHaveBeenCalledTimes(4); // Initial + 3 retries
    });
  });

  describe('File Download Operations', () => {
    it('should download file successfully', async () => {
      const mockStreamData = Buffer.from('downloaded file content');
      const mockResponse = {
        Body: {
          transformToByteArray: vi.fn().mockResolvedValue(mockStreamData)
        },
        ContentType: 'image/jpeg',
        ContentLength: mockStreamData.length,
        ETag: '"download-etag"'
      };

      mockS3Client.send.mockResolvedValue(mockResponse);

      const result = await storageService.downloadFile('test.jpg');

      expect(result.data).toEqual(mockStreamData);
      expect(result.contentType).toBe('image/jpeg');
      expect(result.fileSize).toBe(mockStreamData.length);
    });

    it('should handle file not found error', async () => {
      const notFoundError = new Error('The specified key does not exist');
      notFoundError.name = 'NoSuchKey';

      mockS3Client.send.mockRejectedValue(notFoundError);

      await expect(
        storageService.downloadFile('non-existent.jpg')
      ).rejects.toThrow(S3OperationError);
    });
  });

  describe('File Deletion Operations', () => {
    it('should delete single file successfully', async () => {
      const mockResponse = {
        DeleteMarker: true,
        VersionId: 'delete-version'
      };

      mockS3Client.send.mockResolvedValue(mockResponse);

      const result = await storageService.deleteFile('test.jpg');

      expect(result.deleted).toBe(true);
      expect(result.key).toBe('test.jpg');
    });

    it('should delete multiple files in batch', async () => {
      const mockResponse = {
        Deleted: [
          { Key: 'file1.jpg' },
          { Key: 'file2.jpg' }
        ],
        Errors: []
      };

      mockS3Client.send.mockResolvedValue(mockResponse);

      const keys = ['file1.jpg', 'file2.jpg'];
      const result = await storageService.deleteFiles(keys);

      expect(result.deleted).toEqual(keys);
      expect(result.failed).toEqual([]);
      expect(result.totalDeleted).toBe(2);
    });

    it('should handle partial deletion failures', async () => {
      const mockResponse = {
        Deleted: [
          { Key: 'file1.jpg' }
        ],
        Errors: [
          {
            Key: 'file2.jpg',
            Code: 'AccessDenied',
            Message: 'Access denied for file2.jpg'
          }
        ]
      };

      mockS3Client.send.mockResolvedValue(mockResponse);

      const result = await storageService.deleteFiles(['file1.jpg', 'file2.jpg']);

      expect(result.deleted).toEqual(['file1.jpg']);
      expect(result.failed).toEqual(['file2.jpg']);
      expect(result.errors).toHaveLength(1);
    });
  });

  describe('File Existence and Listing', () => {
    it('should check file existence correctly', async () => {
      // File exists
      mockS3Client.send.mockResolvedValue({
        ContentLength: 1000,
        LastModified: new Date()
      });

      const exists = await storageService.fileExists('existing-file.jpg');
      expect(exists).toBe(true);
    });

    it('should return false for non-existent files', async () => {
      const notFoundError = new Error('Not Found');
      notFoundError.name = 'NotFound';

      mockS3Client.send.mockRejectedValue(notFoundError);

      const exists = await storageService.fileExists('non-existent.jpg');
      expect(exists).toBe(false);
    });

    it('should list objects with prefix', async () => {
      const mockResponse = {
        Contents: [
          {
            Key: 'items/123/photo1.jpg',
            Size: 1000,
            LastModified: new Date(),
            ETag: '"etag1"'
          },
          {
            Key: 'items/123/photo2.jpg',
            Size: 2000,
            LastModified: new Date(),
            ETag: '"etag2"'
          }
        ]
      };

      mockS3Client.send.mockResolvedValue(mockResponse);

      const result = await storageService.listObjects('items/123/', {
        maxKeys: 10,
        recursive: true
      });

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        key: 'items/123/photo1.jpg',
        size: 1000,
        lastModified: expect.any(Date),
        etag: '"etag1"'
      });
    });
  });

  describe('Presigned URL Generation', () => {
    it('should generate presigned upload URL', async () => {
      const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
      (getSignedUrl as any).mockResolvedValue('https://presigned-url.example.com');

      const result = await storageService.getPresignedUploadUrl(
        'test-upload.jpg',
        'image/jpeg',
        900 // 15 minutes
      );

      expect(result).toEqual({
        uploadUrl: 'https://presigned-url.example.com',
        key: 'test-upload.jpg',
        expiresIn: 900,
        fields: {
          'Content-Type': 'image/jpeg',
        }
      });
    });

    it('should generate presigned download URL', async () => {
      const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
      (getSignedUrl as any).mockResolvedValue('https://presigned-download.example.com');

      const result = await storageService.getPresignedDownloadUrl('test-download.jpg');

      expect(result.downloadUrl).toBe('https://presigned-download.example.com');
      expect(result.expiresIn).toBe(3600); // Default 1 hour
    });
  });

  describe('Error Classification and Retry Logic', () => {
    it('should classify network errors correctly', async () => {
      const networkError = new Error('Connection timeout');
      networkError.name = 'TimeoutError';

      mockS3Client.send.mockRejectedValue(networkError);

      await expect(
        storageService.uploadFile(Buffer.from('test'), 'test.jpg', 'image/jpeg')
      ).rejects.toThrow(S3OperationError);

      // Should attempt 3 retries for network errors
      expect(mockS3Client.send).toHaveBeenCalledTimes(4);
    });

    it('should not retry non-retryable errors', async () => {
      const accessError = new Error('Access Denied');
      accessError.name = 'AccessDenied';

      mockS3Client.send.mockRejectedValue(accessError);

      await expect(
        storageService.uploadFile(Buffer.from('test'), 'test.jpg', 'image/jpeg')
      ).rejects.toThrow(S3OperationError);

      // Should not retry access denied errors
      expect(mockS3Client.send).toHaveBeenCalledTimes(1);
    });

    it('should handle quota exceeded errors', async () => {
      const quotaError = new Error('SlowDown');
      quotaError.name = 'SlowDown';

      mockS3Client.send.mockRejectedValue(quotaError);

      await expect(
        storageService.uploadFile(Buffer.from('test'), 'test.jpg', 'image/jpeg')
      ).rejects.toThrow(S3OperationError);

      const thrownError = await storageService.uploadFile(Buffer.from('test'), 'test.jpg', 'image/jpeg')
        .catch(err => err);

      expect(thrownError).toBeInstanceOf(S3OperationError);
      expect(thrownError.errorType).toBe(S3ErrorType.QUOTA_EXCEEDED);
    });
  });

  describe('Connection Testing', () => {
    it('should test connection successfully', async () => {
      mockS3Client.send.mockResolvedValue({});

      await expect(
        storageService.testConnection()
      ).resolves.not.toThrow();
    });

    it('should throw error for connection failure', async () => {
      const connectionError = new Error('Invalid credentials');
      connectionError.name = 'InvalidAccessKeyId';

      mockS3Client.send.mockRejectedValue(connectionError);

      await expect(
        storageService.testConnection()
      ).rejects.toThrow(S3OperationError);
    });
  });

  describe('Performance and Optimization', () => {
    it('should handle large file uploads efficiently', async () => {
      const largeBuffer = Buffer.alloc(10 * 1024 * 1024); // 10MB
      mockS3Client.send.mockResolvedValue({ ETag: '"large-file-etag"' });

      const startTime = Date.now();
      const result = await storageService.uploadFile(largeBuffer, 'large-file.jpg', 'image/jpeg');
      const endTime = Date.now();

      expect(result.fileSize).toBe(largeBuffer.length);
      expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds in test
    });

    it('should batch delete operations efficiently', async () => {
      const manyKeys = Array.from({ length: 50 }, (_, i) => `file-${i}.jpg`);

      mockS3Client.send.mockResolvedValue({
        Deleted: manyKeys.map(key => ({ Key: key })),
        Errors: []
      });

      const result = await storageService.deleteFiles(manyKeys);

      expect(result.totalDeleted).toBe(50);
      expect(result.failed).toHaveLength(0);
    });
  });
});