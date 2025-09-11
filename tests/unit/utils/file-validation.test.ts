/**
 * @jest-environment jsdom
 */

import { validateImageFile, generateSecureFilename, validateMultipleImageFiles } from '@/lib/utils/file-validation';

// Mock image loading for testing
global.Image = class MockImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  width = 0;
  height = 0;
  
  set src(value: string) {
    // Simulate successful image load for valid images
    setTimeout(() => {
      if (value.includes('valid-image')) {
        this.width = 800;
        this.height = 600;
        this.onload?.();
      } else {
        this.onerror?.();
      }
    }, 10);
  }
} as any;

// Mock URL methods
global.URL.createObjectURL = jest.fn(() => 'valid-image-blob-url');
global.URL.revokeObjectURL = jest.fn();

/**
 * Create mock file for testing
 */
function createMockFile(name: string, type: string, size: number, content?: ArrayBuffer): File {
  const mockFile = new File([''], name, { type });
  
  // Mock file properties
  Object.defineProperty(mockFile, 'size', { value: size, writable: false });
  Object.defineProperty(mockFile, 'name', { value: name, writable: false });
  Object.defineProperty(mockFile, 'type', { value: type, writable: false });
  
  if (content) {
    mockFile.slice = jest.fn(() => ({
      arrayBuffer: () => Promise.resolve(content)
    } as any));
  } else {
    // Create proper JPEG header for valid files
    const jpegHeader = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0]);
    mockFile.slice = jest.fn(() => ({
      arrayBuffer: () => Promise.resolve(jpegHeader.buffer)
    } as any));
  }
  
  return mockFile;
}

describe('File Validation Security Tests (1.3-UNIT-003)', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('validateImageFile', () => {
    it('should reject executable files', async () => {
      const maliciousFile = createMockFile('malware.exe', 'application/x-msdownload', 1000);
      const result = await validateImageFile(maliciousFile);
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid file type');
    });

    it('should reject script files', async () => {
      const scriptFile = createMockFile('script.js', 'application/javascript', 1000);
      const result = await validateImageFile(scriptFile);
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid file type');
    });

    it('should reject PHP files', async () => {
      const phpFile = createMockFile('shell.php', 'application/x-httpd-php', 1000);
      const result = await validateImageFile(phpFile);
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid file type');
    });

    it('should enforce file size limits', async () => {
      const oversizedFile = createMockFile('huge.jpg', 'image/jpeg', 15 * 1024 * 1024); // 15MB
      const result = await validateImageFile(oversizedFile);
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('File size too large');
    });

    it('should reject empty files', async () => {
      const emptyFile = createMockFile('empty.jpg', 'image/jpeg', 0);
      const result = await validateImageFile(emptyFile);
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('File is empty');
    });

    it('should validate JPEG files with correct headers', async () => {
      const validJpeg = createMockFile('photo.jpg', 'image/jpeg', 1024 * 1024);
      const result = await validateImageFile(validJpeg);
      
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject files with mismatched extensions', async () => {
      const mismatchedFile = createMockFile('fake.jpg', 'image/png', 1024);
      const result = await validateImageFile(mismatchedFile);
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('does not match file type');
    });

    it('should reject files with double extensions', async () => {
      const doubleExtFile = createMockFile('image.jpg.exe', 'image/jpeg', 1024);
      const result = await validateImageFile(doubleExtFile);
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Unsupported file extension');
    });
  });

  describe('Filename Security (1.3-UNIT-009)', () => {
    it('should reject directory traversal attempts', async () => {
      const traversalFile = createMockFile('../../../etc/passwd', 'image/jpeg', 1024);
      const result = await validateImageFile(traversalFile);
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('dangerous characters');
    });

    it('should reject null byte injection', async () => {
      const nullByteFile = createMockFile('image.jpg\0.exe', 'image/jpeg', 1024);
      const result = await validateImageFile(nullByteFile);
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('dangerous characters');
    });

    it('should reject Windows reserved names', async () => {
      const reservedFile = createMockFile('CON.jpg', 'image/jpeg', 1024);
      const result = await validateImageFile(reservedFile);
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('reserved system name');
    });

    it('should reject files with reserved characters', async () => {
      const invalidCharsFile = createMockFile('image<>.jpg', 'image/jpeg', 1024);
      const result = await validateImageFile(invalidCharsFile);
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('reserved characters');
    });

    it('should reject overly long filenames', async () => {
      const longName = 'a'.repeat(300) + '.jpg';
      const longNameFile = createMockFile(longName, 'image/jpeg', 1024);
      const result = await validateImageFile(longNameFile);
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Filename too long');
    });
  });

  describe('File Header Validation', () => {
    it('should reject files with incorrect magic bytes', async () => {
      const fakeHeader = new Uint8Array([0x00, 0x00, 0x00, 0x00]); // Invalid header
      const fakeFile = createMockFile('fake.jpg', 'image/jpeg', 1024, fakeHeader.buffer);
      
      const result = await validateImageFile(fakeFile);
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('File header does not match');
    });

    it('should accept PNG files with correct headers', async () => {
      const pngHeader = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
      const validPng = createMockFile('photo.png', 'image/png', 1024, pngHeader.buffer);
      
      const result = await validateImageFile(validPng);
      
      expect(result.valid).toBe(true);
    });

    it('should accept WebP files with correct headers', async () => {
      const webpHeader = new Uint8Array([0x52, 0x49, 0x46, 0x46]); // RIFF header
      const validWebp = createMockFile('photo.webp', 'image/webp', 1024, webpHeader.buffer);
      
      const result = await validateImageFile(validWebp);
      
      expect(result.valid).toBe(true);
    });
  });

  describe('generateSecureFilename', () => {
    it('should generate safe filenames', () => {
      const originalName = 'my photo.jpg';
      const secureFilename = generateSecureFilename(originalName, 'item_123');
      
      expect(secureFilename).toMatch(/^item_123_\d+_[a-z0-9]+\.jpg$/);
      expect(secureFilename).not.toContain(' ');
    });

    it('should handle filenames without extensions', () => {
      const originalName = 'photo';
      const secureFilename = generateSecureFilename(originalName);
      
      expect(secureFilename).toMatch(/^\d+_[a-z0-9]+$/);
    });

    it('should prevent directory traversal in generated names', () => {
      const maliciousName = '../../../evil.jpg';
      const secureFilename = generateSecureFilename(maliciousName, 'item_123');
      
      expect(secureFilename).not.toContain('../');
      expect(secureFilename).toMatch(/^item_123_\d+_[a-z0-9]+\.jpg$/);
    });
  });

  describe('validateMultipleImageFiles', () => {
    it('should validate multiple files correctly', async () => {
      const validFile = createMockFile('photo1.jpg', 'image/jpeg', 1024);
      const invalidFile = createMockFile('malware.exe', 'application/x-msdownload', 1024);
      
      const result = await validateMultipleImageFiles([validFile, invalidFile]);
      
      expect(result.validFiles).toHaveLength(1);
      expect(result.invalidFiles).toHaveLength(1);
      expect(result.allValid).toBe(false);
      expect(result.invalidFiles[0].error).toContain('Invalid file type');
    });

    it('should handle all valid files', async () => {
      const file1 = createMockFile('photo1.jpg', 'image/jpeg', 1024);
      const pngHeader = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
      const file2 = createMockFile('photo2.png', 'image/png', 2048, pngHeader.buffer);
      
      const result = await validateMultipleImageFiles([file1, file2]);
      
      expect(result.validFiles).toHaveLength(2);
      expect(result.invalidFiles).toHaveLength(0);
      expect(result.allValid).toBe(true);
    });
  });

  describe('Edge Cases and DoS Prevention', () => {
    it('should handle null/undefined file input', async () => {
      const result = await validateImageFile(null as any);
      
      expect(result.valid).toBe(false);
      expect(result.error).toBe('No file provided');
    });

    it('should handle corrupted file reading', async () => {
      const corruptedFile = createMockFile('corrupted.jpg', 'image/jpeg', 1024);
      // Mock corrupted file that throws during slice
      corruptedFile.slice = jest.fn(() => {
        throw new Error('File read error');
      });
      
      const result = await validateImageFile(corruptedFile);
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Could not read file header');
    });

    it('should timeout on hanging image validation', async () => {
      // Mock hanging image load
      global.Image = class HangingImage {
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        width = 0;
        height = 0;
        
        set src(value: string) {
          // Never call onload or onerror to simulate hanging
        }
      } as any;

      const hangingFile = createMockFile('hanging.jpg', 'image/jpeg', 1024);
      
      // Set a shorter timeout for testing
      const result = await validateImageFile(hangingFile);
      
      // Should timeout and return error
      expect(result.valid).toBe(false);
      expect(result.error).toContain('timeout');
    }, 10000);
  });

  describe('Content Validation', () => {
    it('should reject images with invalid dimensions', async () => {
      // Mock image with zero dimensions
      global.Image = class InvalidDimensionImage {
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        width = 0;
        height = 0;
        
        set src(value: string) {
          setTimeout(() => {
            this.width = 0; // Invalid dimension
            this.height = 0; // Invalid dimension
            this.onload?.();
          }, 10);
        }
      } as any;

      const invalidDimensionFile = createMockFile('invalid.jpg', 'image/jpeg', 1024);
      const result = await validateImageFile(invalidDimensionFile);
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('invalid dimensions');
    });

    it('should reject images with excessive dimensions', async () => {
      // Mock image with huge dimensions
      global.Image = class HugeDimensionImage {
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        width = 0;
        height = 0;
        
        set src(value: string) {
          setTimeout(() => {
            this.width = 15000; // Excessive dimension
            this.height = 15000; // Excessive dimension
            this.onload?.();
          }, 10);
        }
      } as any;

      const hugeDimensionFile = createMockFile('huge.jpg', 'image/jpeg', 1024);
      const result = await validateImageFile(hugeDimensionFile);
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('dimensions too large');
    });
  });
});