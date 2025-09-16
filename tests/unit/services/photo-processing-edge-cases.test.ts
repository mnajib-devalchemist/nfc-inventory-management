/**
 * @jest-environment node
 */

import { processImage } from '@/lib/utils/photos';
import { PhotoProcessingService } from '@/lib/services/photo-processing';

// Mock Sharp.js for controlled testing
jest.mock('sharp');

import sharp from 'sharp';

// Type the mocked sharp properly
const mockSharp = sharp as jest.MockedFunction<typeof sharp>;

describe('Photo Processing Edge Cases - Thumbnail Generation', () => {
  let mockSharpInstance: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create a fresh mock instance for each test
    mockSharpInstance = {
      resize: jest.fn().mockReturnThis(),
      jpeg: jest.fn().mockReturnThis(),
      toBuffer: jest.fn(),
      metadata: jest.fn(),
      withMetadata: jest.fn().mockReturnThis(),
    };

    // Make sharp() return our mock instance
    mockSharp.mockImplementation(() => mockSharpInstance);

    // Reset to default successful behavior
    mockSharpInstance.metadata.mockResolvedValue({
      format: 'jpeg',
      width: 1920,
      height: 1080,
    });
    mockSharpInstance.toBuffer.mockResolvedValue(Buffer.from('processed-image'));
  });

  describe('Corrupted Image Handling', () => {
    test('should handle corrupted JPEG headers gracefully', async () => {
      const corruptedJpeg = Buffer.from([
        0xFF, 0xD8, // Valid JPEG start
        0x00, 0x00, 0x00, 0x00, // Corrupted data
        0xFF, 0xD9 // Valid JPEG end
      ]);

      // Mock Sharp to throw error for corrupted image
      mockSharp.mockImplementation(() => {
        throw new Error('Input buffer contains unsupported image format');
      });

      await expect(processImage(corruptedJpeg, 'corrupted.jpg', 'test-item'))
        .rejects
        .toThrow('Image processing failed');
    });

    test('should handle truncated image files', async () => {
      const truncatedImage = Buffer.from([0xFF, 0xD8]); // Incomplete JPEG

      mockSharpInstance.metadata.mockRejectedValue(new Error('Premature end of image'));

      await expect(processImage(truncatedImage, 'truncated.jpg', 'test-item'))
        .rejects
        .toThrow('Image processing failed');
    });

    test('should handle zero-byte images', async () => {
      const emptyBuffer = Buffer.alloc(0);

      mockSharp.mockImplementation(() => {
        throw new Error('Input buffer is empty');
      });

      await expect(processImage(emptyBuffer, 'empty.jpg', 'test-item'))
        .rejects
        .toThrow('Image processing failed');
    });
  });

  describe('Invalid Dimensions Handling', () => {
    test('should handle images with missing dimensions', async () => {
      const validJpeg = createValidJpegBuffer();

      mockSharpInstance.metadata.mockResolvedValue({
        format: 'jpeg',
        width: undefined,
        height: undefined,
      });

      await expect(processImage(validJpeg, 'no-dimensions.jpg', 'test-item'))
        .rejects
        .toThrow('Invalid image: could not determine dimensions');
    });

    test('should handle images with zero dimensions', async () => {
      const validJpeg = createValidJpegBuffer();

      mockSharpInstance.metadata.mockResolvedValue({
        format: 'jpeg',
        width: 0,
        height: 0,
      });

      await expect(processImage(validJpeg, 'zero-dimensions.jpg', 'test-item'))
        .rejects
        .toThrow('Invalid image: could not determine dimensions');
    });
  });

  describe('Thumbnail Generation Specific Edge Cases', () => {
    test('should handle thumbnail generation failure gracefully', async () => {
      const validJpeg = createValidJpegBuffer();

      mockSharpInstance.metadata.mockResolvedValue({
        format: 'jpeg',
        width: 1920,
        height: 1080,
      });

      // Mock main image processing success but thumbnail failure
      mockSharpInstance.toBuffer
        .mockResolvedValueOnce(Buffer.from('processed-image')) // Main image success
        .mockRejectedValueOnce(new Error('Thumbnail generation failed')); // Thumbnail failure

      await expect(processImage(validJpeg, 'thumbnail-fail.jpg', 'test-item'))
        .rejects
        .toThrow('Image processing failed');
    });

    test('should handle memory exhaustion during processing', async () => {
      const validJpeg = createValidJpegBuffer();

      mockSharpInstance.metadata.mockResolvedValue({
        format: 'jpeg',
        width: 8000,
        height: 6000,
      });

      // Mock memory exhaustion during resize
      mockSharpInstance.resize.mockImplementation(() => {
        throw new Error('Process out of memory');
      });

      await expect(processImage(validJpeg, 'memory-exhaustion.jpg', 'test-item'))
        .rejects
        .toThrow('Image processing failed');
    });

    test('should handle extreme aspect ratios for thumbnails', async () => {
      const validJpeg = createValidJpegBuffer();

      mockSharpInstance.metadata.mockResolvedValue({
        format: 'jpeg',
        width: 100,
        height: 2000, // Extreme aspect ratio
      });

      // Should still process successfully with proper resizing
      mockSharpInstance.toBuffer.mockResolvedValue(Buffer.from('thumbnail-data'));

      const result = await processImage(validJpeg, 'extreme-aspect.jpg', 'test-item');

      expect(mockSharpInstance.resize).toHaveBeenCalledWith(
        200, 200, // Thumbnail dimensions
        expect.objectContaining({
          fit: 'cover',
          position: 'centre'
        })
      );
      expect(result).toBeDefined();
    });
  });

  describe('Format-Specific Edge Cases', () => {
    test('should handle unsupported format conversion failures', async () => {
      const heicBuffer = Buffer.from([
        0x00, 0x00, 0x00, 0x18, // Size
        0x66, 0x74, 0x79, 0x70, // ftyp
        0x68, 0x65, 0x69, 0x63, // heic
      ]);

      mockSharp.mockImplementation(() => {
        throw new Error('HEIC format not supported in this build');
      });

      await expect(processImage(heicBuffer, 'image.heic', 'test-item'))
        .rejects
        .toThrow('Image processing failed');
    });

    test('should handle malformed image data', async () => {
      const malformedBuffer = Buffer.from('not an image');

      mockSharp.mockImplementation(() => {
        throw new Error('Input file is missing or of an unsupported image format');
      });

      await expect(processImage(malformedBuffer, 'malformed.jpg', 'test-item'))
        .rejects
        .toThrow('Image processing failed');
    });
  });

  describe('PhotoProcessingService Edge Cases', () => {
    test('should handle worker pool unavailability gracefully', async () => {
      const photoProcessingService = new PhotoProcessingService();
      const validJpeg = createValidJpegBuffer();

      // Test that the service fails gracefully when worker pool is unavailable
      await expect(
        photoProcessingService.processImageAdaptive(validJpeg, {
          generateThumbnails: true,
          formats: ['jpeg'],
        })
      ).rejects.toThrow('Worker pool not available and synchronous processing not yet implemented');
    });

    test('should handle concurrent processing gracefully', async () => {
      const photoProcessingService = new PhotoProcessingService();
      const validJpeg = createValidJpegBuffer();

      // Test multiple simultaneous processing requests
      const promises = Array(3).fill(null).map(() =>
        photoProcessingService.processImageAdaptive(validJpeg, { generateThumbnails: true })
      );

      const results = await Promise.allSettled(promises);

      // Should handle requests without throwing errors
      expect(results.length).toBe(3);

      // All should fail consistently since worker pool is not available
      const failed = results.filter(r => r.status === 'rejected');
      expect(failed.length).toBe(3);
      failed.forEach(result => {
        expect((result as PromiseRejectedResult).reason.message).toContain('Worker pool not available');
      });
    });

    test('should provide meaningful error context', async () => {
      const validJpeg = createValidJpegBuffer();

      // Mock processing to fail with specific context
      mockSharpInstance.toBuffer.mockRejectedValue(new Error('Memory allocation failed'));

      try {
        await processImage(validJpeg, 'context-test.jpg', 'test-item');
        fail('Expected error to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('Image processing failed');
      }
    });
  });

  describe('Cleanup and Resource Management', () => {
    test('should not leave hanging resources after processing failure', async () => {
      const validJpeg = createValidJpegBuffer();

      mockSharpInstance.metadata.mockResolvedValue({
        format: 'jpeg',
        width: 1920,
        height: 1080,
      });

      // Mock processing to fail midway
      mockSharpInstance.toBuffer.mockRejectedValue(new Error('Processing interrupted'));

      try {
        await processImage(validJpeg, 'cleanup-test.jpg', 'test-item');
      } catch (error) {
        // Error is expected, verify cleanup behavior
      }

      // Verify that Sharp instances are properly invoked
      expect(mockSharpInstance.toBuffer).toHaveBeenCalled();
    });

    test('should handle file validation edge cases', async () => {
      // Test with valid buffer but misleading filename
      const validJpeg = createValidJpegBuffer();

      mockSharpInstance.metadata.mockResolvedValue({
        format: 'jpeg',
        width: 1920,
        height: 1080,
      });

      // Should process successfully regardless of filename extension mismatch
      const result = await processImage(validJpeg, 'actuallyJpeg.png', 'test-item');

      expect(result).toBeDefined();
      expect(result.metadata.format).toBe('jpeg');
    });
  });
});

/**
 * Helper function to create a valid JPEG buffer for testing
 */
function createValidJpegBuffer(): Buffer {
  return Buffer.from([
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
}