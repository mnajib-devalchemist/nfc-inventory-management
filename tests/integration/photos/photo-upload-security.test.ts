/**
 * @jest-environment node
 */

import { uploadPhotoAction, removePhotoAction } from '@/lib/actions/photos';
import { validateImageFile } from '@/lib/utils/file-validation';
import { processPhotoUpload } from '@/lib/utils/photos';
import fs from 'fs/promises';
import path from 'path';

// Mock authentication
jest.mock('@/lib/auth', () => ({
  auth: jest.fn(() => Promise.resolve({
    user: {
      id: 'test-user-123',
      email: 'test@example.com'
    }
  }))
}));

// Mock next/cache
jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
}));

/**
 * Create test file buffer with proper headers
 */
function createTestFileBuffer(type: 'jpeg' | 'png' | 'malicious'): Buffer {
  switch (type) {
    case 'jpeg':
      // Valid JPEG header
      return Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10]);
    case 'png':
      // Valid PNG header
      return Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    case 'malicious':
      // Fake executable signature
      return Buffer.from([0x4D, 0x5A, 0x90, 0x00]); // MZ header (PE executable)
  }
}

/**
 * Create mock FormData with file
 */
function createMockFormData(filename: string, mimeType: string, buffer: Buffer): FormData {
  const formData = new FormData();
  const blob = new Blob([buffer], { type: mimeType });
  const file = new File([blob], filename, { type: mimeType });
  formData.append('photo', file);
  return formData;
}

describe('Photo Upload Security Integration Tests (1.3-INT-002)', () => {
  const testItemId = 'test-item-123';
  const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'photos', testItemId);

  beforeEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(uploadDir, { recursive: true, force: true });
    } catch (error) {
      // Directory might not exist, ignore
    }
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(uploadDir, { recursive: true, force: true });
    } catch (error) {
      // Directory might not exist, ignore
    }
  });

  describe('Malicious File Upload Prevention', () => {
    it('should reject executable files (1.3-INT-002)', async () => {
      const maliciousBuffer = createTestFileBuffer('malicious');
      const formData = createMockFormData('malware.exe', 'application/x-msdownload', maliciousBuffer);

      const result = await uploadPhotoAction(testItemId, formData);

      expect(result.success).toBe(false);
      expect(result.error).toContain('validation failed');
    });

    it('should reject script files with image extensions', async () => {
      const scriptContent = Buffer.from('<?php system($_GET["cmd"]); ?>');
      const formData = createMockFormData('shell.php.jpg', 'image/jpeg', scriptContent);

      const result = await uploadPhotoAction(testItemId, formData);

      expect(result.success).toBe(false);
      expect(result.error).toContain('validation failed');
    });

    it('should reject files with null byte injection', async () => {
      const jpegBuffer = createTestFileBuffer('jpeg');
      const formData = createMockFormData('image.jpg\0.exe', 'image/jpeg', jpegBuffer);

      const result = await uploadPhotoAction(testItemId, formData);

      expect(result.success).toBe(false);
      expect(result.error).toContain('validation failed');
    });

    it('should reject directory traversal attempts', async () => {
      const jpegBuffer = createTestFileBuffer('jpeg');
      const formData = createMockFormData('../../etc/passwd.jpg', 'image/jpeg', jpegBuffer);

      const result = await uploadPhotoAction(testItemId, formData);

      expect(result.success).toBe(false);
      expect(result.error).toContain('validation failed');
    });

    it('should reject oversized files', async () => {
      // Create a large buffer (15MB)
      const largeBuffer = Buffer.alloc(15 * 1024 * 1024);
      // Add JPEG header to make it look valid
      largeBuffer.writeUInt8(0xFF, 0);
      largeBuffer.writeUInt8(0xD8, 1);
      largeBuffer.writeUInt8(0xFF, 2);
      largeBuffer.writeUInt8(0xE0, 3);

      const formData = createMockFormData('huge.jpg', 'image/jpeg', largeBuffer);

      const result = await uploadPhotoAction(testItemId, formData);

      expect(result.success).toBe(false);
      expect(result.error).toContain('validation failed');
    });
  });

  describe('Valid File Processing', () => {
    it('should process valid JPEG files securely', async () => {
      const jpegBuffer = createTestFileBuffer('jpeg');
      const formData = createMockFormData('photo.jpg', 'image/jpeg', jpegBuffer);

      // Mock successful processing (since we can't test actual Sharp.js without proper image)
      jest.doMock('@/lib/utils/photos', () => ({
        processPhotoUpload: jest.fn().mockResolvedValue({
          photoUrl: '/uploads/photos/test-item-123/processed.jpg',
          thumbnailUrl: '/uploads/photos/test-item-123/thumb.jpg',
          metadata: {
            width: 800,
            height: 600,
            format: 'jpeg',
            size: 50000,
            thumbnailSize: 5000
          }
        })
      }));

      const result = await uploadPhotoAction(testItemId, formData);

      expect(result.success).toBe(true);
      expect(result.photoUrl).toBeDefined();
      expect(result.thumbnailUrl).toBeDefined();
      expect(result.metadata).toBeDefined();
    });

    it('should process valid PNG files securely', async () => {
      const pngBuffer = createTestFileBuffer('png');
      const formData = createMockFormData('photo.png', 'image/png', pngBuffer);

      // Mock successful processing
      jest.doMock('@/lib/utils/photos', () => ({
        processPhotoUpload: jest.fn().mockResolvedValue({
          photoUrl: '/uploads/photos/test-item-123/processed.jpg',
          thumbnailUrl: '/uploads/photos/test-item-123/thumb.jpg',
          metadata: {
            width: 1024,
            height: 768,
            format: 'jpeg',
            size: 60000,
            thumbnailSize: 6000
          }
        })
      }));

      const result = await uploadPhotoAction(testItemId, formData);

      expect(result.success).toBe(true);
    });
  });

  describe('Authentication and Authorization', () => {
    it('should reject uploads without authentication', async () => {
      // Mock no authentication
      jest.doMock('@/lib/auth', () => ({
        auth: jest.fn(() => Promise.resolve(null))
      }));

      const jpegBuffer = createTestFileBuffer('jpeg');
      const formData = createMockFormData('photo.jpg', 'image/jpeg', jpegBuffer);

      const result = await uploadPhotoAction(testItemId, formData);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Authentication required');
    });

    it('should handle missing file in form data', async () => {
      const formData = new FormData();
      // No file attached

      const result = await uploadPhotoAction(testItemId, formData);

      expect(result.success).toBe(false);
      expect(result.error).toBe('No file provided');
    });

    it('should handle empty file upload', async () => {
      const emptyBuffer = Buffer.alloc(0);
      const formData = createMockFormData('empty.jpg', 'image/jpeg', emptyBuffer);

      const result = await uploadPhotoAction(testItemId, formData);

      expect(result.success).toBe(false);
      expect(result.error).toContain('validation failed');
    });
  });

  describe('Photo Removal Security', () => {
    it('should remove photos securely', async () => {
      const result = await removePhotoAction(testItemId);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Photo removed successfully');
    });

    it('should require authentication for photo removal', async () => {
      // Mock no authentication
      jest.doMock('@/lib/auth', () => ({
        auth: jest.fn(() => Promise.resolve(null))
      }));

      const result = await removePhotoAction(testItemId);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Authentication required');
    });
  });

  describe('File System Security', () => {
    it('should store files in secure directory structure', async () => {
      // Mock successful photo processing
      const mockProcessPhotoUpload = jest.fn().mockResolvedValue({
        photoUrl: `/uploads/photos/${testItemId}/secure_filename.jpg`,
        thumbnailUrl: `/uploads/photos/${testItemId}/secure_filename_thumb.jpg`,
        metadata: { width: 800, height: 600, format: 'jpeg', size: 50000, thumbnailSize: 5000 }
      });

      jest.doMock('@/lib/utils/photos', () => ({
        processPhotoUpload: mockProcessPhotoUpload
      }));

      const jpegBuffer = createTestFileBuffer('jpeg');
      const formData = createMockFormData('photo.jpg', 'image/jpeg', jpegBuffer);

      const result = await uploadPhotoAction(testItemId, formData);

      if (result.success) {
        // Verify secure path structure
        expect(result.photoUrl).toMatch(new RegExp(`^/uploads/photos/${testItemId}/`));
        expect(result.thumbnailUrl).toMatch(new RegExp(`^/uploads/photos/${testItemId}/`));
        
        // Verify no directory traversal
        expect(result.photoUrl).not.toContain('../');
        expect(result.thumbnailUrl).not.toContain('../');
      }
    });

    it('should prevent path traversal in item IDs', async () => {
      const maliciousItemId = '../../../etc/passwd';
      const jpegBuffer = createTestFileBuffer('jpeg');
      const formData = createMockFormData('photo.jpg', 'image/jpeg', jpegBuffer);

      // Should sanitize the item ID or reject the request
      const result = await uploadPhotoAction(maliciousItemId, formData);

      // Either should fail validation or sanitize the path
      if (result.success) {
        expect(result.photoUrl).not.toContain('../');
        expect(result.thumbnailUrl).not.toContain('../');
      }
    });
  });

  describe('Error Handling and Logging', () => {
    it('should handle processing errors gracefully', async () => {
      // Mock processing failure
      jest.doMock('@/lib/utils/photos', () => ({
        processPhotoUpload: jest.fn().mockRejectedValue(new Error('Processing failed'))
      }));

      const jpegBuffer = createTestFileBuffer('jpeg');
      const formData = createMockFormData('photo.jpg', 'image/jpeg', jpegBuffer);

      const result = await uploadPhotoAction(testItemId, formData);

      expect(result.success).toBe(false);
      expect(result.error).toContain('could not be processed');
    });

    it('should handle storage errors gracefully', async () => {
      // Mock storage failure
      jest.doMock('@/lib/utils/photos', () => ({
        processPhotoUpload: jest.fn().mockRejectedValue(new Error('Storage failed'))
      }));

      const jpegBuffer = createTestFileBuffer('jpeg');
      const formData = createMockFormData('photo.jpg', 'image/jpeg', jpegBuffer);

      const result = await uploadPhotoAction(testItemId, formData);

      expect(result.success).toBe(false);
      expect(result.error).toContain('save the image');
    });

    it('should not expose sensitive error details', async () => {
      // Mock internal server error
      jest.doMock('@/lib/utils/photos', () => ({
        processPhotoUpload: jest.fn().mockRejectedValue(new Error('Internal database connection failed'))
      }));

      const jpegBuffer = createTestFileBuffer('jpeg');
      const formData = createMockFormData('photo.jpg', 'image/jpeg', jpegBuffer);

      const result = await uploadPhotoAction(testItemId, formData);

      expect(result.success).toBe(false);
      // Should not expose internal error details
      expect(result.error).not.toContain('database');
      expect(result.error).not.toContain('connection');
    });
  });

  describe('Resource Management', () => {
    it('should clean up temporary files on failure', async () => {
      // Mock processing that creates temp files then fails
      const mockProcessPhotoUpload = jest.fn().mockImplementation(async (file, itemId) => {
        // Simulate creating temp file
        const tempDir = path.join(process.cwd(), 'tmp', itemId);
        await fs.mkdir(tempDir, { recursive: true });
        await fs.writeFile(path.join(tempDir, 'temp.jpg'), 'temp content');
        
        // Then fail
        throw new Error('Processing failed after temp file creation');
      });

      jest.doMock('@/lib/utils/photos', () => ({
        processPhotoUpload: mockProcessPhotoUpload
      }));

      const jpegBuffer = createTestFileBuffer('jpeg');
      const formData = createMockFormData('photo.jpg', 'image/jpeg', jpegBuffer);

      const result = await uploadPhotoAction(testItemId, formData);

      expect(result.success).toBe(false);
      
      // Cleanup should have happened (temp directory should not exist)
      const tempDir = path.join(process.cwd(), 'tmp', testItemId);
      await expect(fs.access(tempDir)).rejects.toThrow();
    });
  });
});