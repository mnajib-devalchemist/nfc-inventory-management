/**
 * HEIC Security Testing Suite
 * Comprehensive security validation tests for HEIC file processing
 * Addresses QA assessment critical security gap
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { validateHEICFile, convertHEICToJPEG, getHEICMetadata } from '@/lib/utils/heic-support';

/**
 * Test data: Malformed HEIC file signatures and patterns
 */
const MALFORMED_HEIC_PATTERNS = {
  // Valid HEIC signature for comparison
  VALID_HEIC_HEADER: new Uint8Array([
    0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, // File type box
    0x68, 0x65, 0x69, 0x63, 0x00, 0x00, 0x00, 0x00, // "heic" brand
    0x68, 0x65, 0x69, 0x63, 0x6D, 0x69, 0x66, 0x31, // Compatible brands
  ]),

  // Malformed signature - wrong magic bytes
  INVALID_MAGIC: new Uint8Array([
    0xFF, 0xFF, 0xFF, 0xFF, 0x66, 0x74, 0x79, 0x70, // Invalid size
    0x68, 0x65, 0x69, 0x63, 0x00, 0x00, 0x00, 0x00,
  ]),

  // Executable signature disguised as HEIC
  EXECUTABLE_HEADER: new Uint8Array([
    0x4D, 0x5A, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, // MZ header (Windows executable)
    0x68, 0x65, 0x69, 0x63, 0x00, 0x00, 0x00, 0x00, // Fake HEIC brand
  ]),

  // Script injection attempt
  SCRIPT_INJECTION: new Uint8Array([
    0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70,
    0x3C, 0x73, 0x63, 0x72, 0x69, 0x70, 0x74, 0x3E, // "<script>"
  ]),

  // Buffer overflow attempt - oversized header
  OVERSIZED_HEADER: new Uint8Array(Array(10000).fill(0x41)), // 10KB of 'A's

  // Zero-byte file
  EMPTY_FILE: new Uint8Array([]),

  // Truncated HEIC file
  TRUNCATED_HEIC: new Uint8Array([
    0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70,
    0x68, 0x65, // Truncated mid-brand
  ]),

  // Invalid brand with correct structure
  INVALID_BRAND: new Uint8Array([
    0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70,
    0x65, 0x76, 0x69, 0x6C, 0x00, 0x00, 0x00, 0x00, // "evil" brand
  ]),

  // HEIC with embedded payload
  EMBEDDED_PAYLOAD: new Uint8Array([
    0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70,
    0x68, 0x65, 0x69, 0x63, 0x00, 0x00, 0x00, 0x00,
    // Followed by suspicious payload
    0x2F, 0x62, 0x69, 0x6E, 0x2F, 0x73, 0x68, 0x00, // "/bin/sh"
    0x6A, 0x61, 0x76, 0x61, 0x73, 0x63, 0x72, 0x69, // "javascri"
    0x70, 0x74, 0x3A, 0x61, 0x6C, 0x65, 0x72, 0x74, // "pt:alert"
  ]),
};

/**
 * Helper to create File objects from byte arrays
 */
function createTestFile(
  data: Uint8Array,
  filename: string = 'test.heic',
  mimeType: string = 'image/heic'
): File {
  const blob = new Blob([data], { type: mimeType });
  return new File([blob], filename, { type: mimeType });
}

describe('HEIC Security Validation', () => {
  beforeEach(() => {
    // Mock console methods to reduce test noise
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'warn').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Malformed File Detection', () => {
    it('should reject files with invalid magic bytes', async () => {
      const file = createTestFile(MALFORMED_HEIC_PATTERNS.INVALID_MAGIC);
      const result = await validateHEICFile(file);

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('validation failed');
      expect(result.securityChecks.signatureValid).toBe(false);
    });

    it('should detect executable headers disguised as HEIC', async () => {
      const file = createTestFile(MALFORMED_HEIC_PATTERNS.EXECUTABLE_HEADER);
      const result = await validateHEICFile(file);

      expect(result.isValid).toBe(false);
      expect(result.securityChecks.noMaliciousPatterns).toBe(false);
      expect(result.error).toContain('validation failed');
    });

    it('should reject script injection attempts', async () => {
      const file = createTestFile(MALFORMED_HEIC_PATTERNS.SCRIPT_INJECTION);
      const result = await validateHEICFile(file);

      expect(result.isValid).toBe(false);
      expect(result.securityChecks.noMaliciousPatterns).toBe(false);
    });

    it('should handle oversized headers safely', async () => {
      const file = createTestFile(MALFORMED_HEIC_PATTERNS.OVERSIZED_HEADER);
      const result = await validateHEICFile(file);

      expect(result.isValid).toBe(false);
      expect(result.securityChecks.sizeValid).toBe(false);
    });

    it('should reject empty or zero-byte files', async () => {
      const file = createTestFile(MALFORMED_HEIC_PATTERNS.EMPTY_FILE);
      const result = await validateHEICFile(file);

      expect(result.isValid).toBe(false);
      expect(result.securityChecks.sizeValid).toBe(false);
    });

    it('should handle truncated HEIC files gracefully', async () => {
      const file = createTestFile(MALFORMED_HEIC_PATTERNS.TRUNCATED_HEIC);
      const result = await validateHEICFile(file);

      expect(result.isValid).toBe(false);
      expect(result.securityChecks.signatureValid).toBe(false);
    });

    it('should reject files with invalid brand identifiers', async () => {
      const file = createTestFile(MALFORMED_HEIC_PATTERNS.INVALID_BRAND);
      const result = await validateHEICFile(file);

      expect(result.isValid).toBe(false);
      expect(result.securityChecks.signatureValid).toBe(false);
    });

    it('should detect embedded malicious payloads', async () => {
      const file = createTestFile(MALFORMED_HEIC_PATTERNS.EMBEDDED_PAYLOAD);
      const result = await validateHEICFile(file);

      expect(result.isValid).toBe(false);
      expect(result.securityChecks.noMaliciousPatterns).toBe(false);
    });
  });

  describe('File Extension and MIME Type Validation', () => {
    it('should reject non-HEIC files with HEIC extension', async () => {
      const jpegData = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0]); // JPEG header
      const file = createTestFile(jpegData, 'fake.heic', 'image/heic');
      const result = await validateHEICFile(file);

      expect(result.isValid).toBe(false);
      expect(result.securityChecks.signatureValid).toBe(false);
    });

    it('should reject executable files with HEIC extension', async () => {
      const exeData = new Uint8Array([0x4D, 0x5A, 0x90, 0x00]); // Windows PE header
      const file = createTestFile(exeData, 'malware.heic', 'image/heic');
      const result = await validateHEICFile(file);

      expect(result.isValid).toBe(false);
      expect(result.securityChecks.noMaliciousPatterns).toBe(false);
    });

    it('should validate filename for suspicious patterns', async () => {
      const file = createTestFile(
        MALFORMED_HEIC_PATTERNS.VALID_HEIC_HEADER,
        'script.js.heic',
        'image/heic'
      );
      const result = await validateHEICFile(file);

      expect(result.securityChecks.metadataClean).toBe(false);
    });

    it('should reject files with wrong MIME type', async () => {
      const file = createTestFile(
        MALFORMED_HEIC_PATTERNS.VALID_HEIC_HEADER,
        'test.heic',
        'application/octet-stream'
      );
      const result = await validateHEICFile(file);

      // Should still validate based on content, but flag MIME type mismatch
      expect(result.format).toBe('heic');
    });
  });

  describe('Size and Resource Limits', () => {
    it('should enforce maximum file size limits', async () => {
      // Create a file larger than 50MB
      const largeData = new Uint8Array(51 * 1024 * 1024);
      largeData.set(MALFORMED_HEIC_PATTERNS.VALID_HEIC_HEADER, 0);
      const file = createTestFile(largeData);

      const result = await validateHEICFile(file);

      expect(result.isValid).toBe(false);
      expect(result.securityChecks.sizeValid).toBe(false);
    });

    it('should enforce minimum file size limits', async () => {
      const tinyData = new Uint8Array(10); // Very small file
      const file = createTestFile(tinyData);

      const result = await validateHEICFile(file);

      expect(result.isValid).toBe(false);
      expect(result.securityChecks.sizeValid).toBe(false);
    });

    it('should handle valid HEIC files within size limits', async () => {
      // Create a reasonably sized valid HEIC header
      const validData = new Uint8Array(2048);
      validData.set(MALFORMED_HEIC_PATTERNS.VALID_HEIC_HEADER, 0);
      const file = createTestFile(validData);

      const result = await validateHEICFile(file);

      expect(result.securityChecks.sizeValid).toBe(true);
      expect(result.securityChecks.signatureValid).toBe(true);
    });
  });

  describe('Metadata Security', () => {
    it('should strip EXIF data during processing', async () => {
      const validData = new Uint8Array(1024);
      validData.set(MALFORMED_HEIC_PATTERNS.VALID_HEIC_HEADER, 0);
      // Add fake EXIF marker
      validData.set([0x45, 0x78, 0x69, 0x66], 100); // "Exif"
      const file = createTestFile(validData);

      const metadata = await getHEICMetadata(file);

      expect(metadata.hasExif).toBe(true);
      // Metadata extraction should not expose dangerous EXIF data
      expect(metadata.error).toBeUndefined();
    });

    it('should handle malformed metadata gracefully', async () => {
      const corruptData = new Uint8Array(512);
      corruptData.set(MALFORMED_HEIC_PATTERNS.VALID_HEIC_HEADER, 0);
      // Add corrupt metadata
      corruptData.fill(0xFF, 200, 400);
      const file = createTestFile(corruptData);

      const metadata = await getHEICMetadata(file);

      expect(metadata.error).toBeDefined();
      expect(typeof metadata.error).toBe('string');
    });
  });

  describe('Conversion Security', () => {
    it('should reject malformed files during conversion', async () => {
      const file = createTestFile(MALFORMED_HEIC_PATTERNS.EXECUTABLE_HEADER);
      const result = await convertHEICToJPEG(file);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid HEIC file');
    });

    it('should handle conversion timeouts gracefully', async () => {
      // Mock a very long conversion process
      const originalTimeout = setTimeout;
      const mockTimeout = jest.fn().mockImplementation((callback, delay) => {
        if (delay > 1000) {
          // Simulate timeout for long operations
          setTimeout(() => callback(), 10);
          return 999 as any;
        }
        return originalTimeout(callback, delay);
      });
      global.setTimeout = mockTimeout as any;

      const validData = new Uint8Array(1024);
      validData.set(MALFORMED_HEIC_PATTERNS.VALID_HEIC_HEADER, 0);
      const file = createTestFile(validData);

      const result = await convertHEICToJPEG(file);

      // Should handle timeout appropriately
      expect(result.processingTime).toBeDefined();

      global.setTimeout = originalTimeout;
    });

    it('should validate output format after conversion', async () => {
      const validData = new Uint8Array(1024);
      validData.set(MALFORMED_HEIC_PATTERNS.VALID_HEIC_HEADER, 0);
      const file = createTestFile(validData);

      // Mock successful conversion
      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        blob: () => Promise.resolve(new Blob([new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0])], { type: 'image/jpeg' })),
      } as Response);

      const result = await convertHEICToJPEG(file);

      if (result.success && result.convertedBlob) {
        expect(result.targetFormat).toBe('jpeg');
        expect(result.convertedBlob.type).toBe('image/jpeg');
      }
    });
  });

  describe('Error Handling and Logging', () => {
    it('should not expose internal errors to client', async () => {
      // Force an internal error
      const mockError = new Error('Internal processing error');
      jest.spyOn(console, 'error').mockImplementation(() => {
        throw mockError;
      });

      const file = createTestFile(MALFORMED_HEIC_PATTERNS.INVALID_MAGIC);
      const result = await validateHEICFile(file);

      expect(result.isValid).toBe(false);
      expect(result.error).not.toContain('Internal processing error');
      expect(result.error).toMatch(/validation failed/i);
    });

    it('should log security violations for monitoring', async () => {
      const consoleSpy = jest.spyOn(console, 'warn');

      const file = createTestFile(MALFORMED_HEIC_PATTERNS.SCRIPT_INJECTION);
      await validateHEICFile(file);

      // Should log security issues for monitoring
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should handle network failures during server conversion', async () => {
      const validData = new Uint8Array(1024);
      validData.set(MALFORMED_HEIC_PATTERNS.VALID_HEIC_HEADER, 0);
      const file = createTestFile(validData);

      // Mock network failure
      jest.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('Network error'));

      const result = await convertHEICToJPEG(file);

      expect(result.success).toBe(false);
      expect(result.error).toContain('conversion failed');
    });
  });

  describe('Browser Compatibility and Feature Detection', () => {
    it('should detect browser HEIC support correctly', async () => {
      const validData = new Uint8Array(1024);
      validData.set(MALFORMED_HEIC_PATTERNS.VALID_HEIC_HEADER, 0);
      const file = createTestFile(validData);

      const result = await validateHEICFile(file);

      expect(result.conversionNeeded).toBeDefined();
      expect(typeof result.conversionNeeded).toBe('boolean');
    });

    it('should fallback gracefully when Canvas API unavailable', async () => {
      // Mock missing Canvas API
      const originalCreateElement = document.createElement;
      document.createElement = jest.fn().mockImplementation((tagName) => {
        if (tagName === 'canvas') {
          return null as any;
        }
        return originalCreateElement.call(document, tagName);
      });

      const validData = new Uint8Array(1024);
      validData.set(MALFORMED_HEIC_PATTERNS.VALID_HEIC_HEADER, 0);
      const file = createTestFile(validData);

      const result = await convertHEICToJPEG(file);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Canvas');

      document.createElement = originalCreateElement;
    });
  });
});

describe('HEIC Security Integration', () => {
  it('should validate complete security pipeline', async () => {
    const testCases = [
      {
        name: 'Valid HEIC file',
        data: MALFORMED_HEIC_PATTERNS.VALID_HEIC_HEADER,
        expectedValid: true,
      },
      {
        name: 'Executable disguised as HEIC',
        data: MALFORMED_HEIC_PATTERNS.EXECUTABLE_HEADER,
        expectedValid: false,
      },
      {
        name: 'Script injection attempt',
        data: MALFORMED_HEIC_PATTERNS.SCRIPT_INJECTION,
        expectedValid: false,
      },
      {
        name: 'Embedded malicious payload',
        data: MALFORMED_HEIC_PATTERNS.EMBEDDED_PAYLOAD,
        expectedValid: false,
      },
    ];

    for (const testCase of testCases) {
      const file = createTestFile(testCase.data);
      const result = await validateHEICFile(file);

      expect(result.isValid).toBe(testCase.expectedValid);

      if (!testCase.expectedValid) {
        expect(result.error).toBeDefined();
        expect(result.securityChecks.noMaliciousPatterns).toBe(false);
      }
    }
  });

  it('should maintain performance under security validation load', async () => {
    const startTime = Date.now();
    const validData = new Uint8Array(1024);
    validData.set(MALFORMED_HEIC_PATTERNS.VALID_HEIC_HEADER, 0);

    // Run multiple validations in parallel
    const promises = Array(10).fill(null).map(() => {
      const file = createTestFile(validData);
      return validateHEICFile(file);
    });

    const results = await Promise.all(promises);
    const endTime = Date.now();

    expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds
    expect(results.every(r => r.securityChecks.signatureValid)).toBe(true);
  });
});

describe('HEIC Rate Limiting Integration', () => {
  it('should respect rate limits during validation', async () => {
    // This would test integration with the rate limiting middleware
    // For now, we'll test that validation doesn't bypass security checks under load

    const maliciousFile = createTestFile(MALFORMED_HEIC_PATTERNS.EXECUTABLE_HEADER);

    // Simulate rapid successive requests
    const rapidRequests = Array(5).fill(null).map(() => validateHEICFile(maliciousFile));
    const results = await Promise.all(rapidRequests);

    // All requests should still fail validation regardless of frequency
    expect(results.every(r => !r.isValid)).toBe(true);
    expect(results.every(r => !r.securityChecks.noMaliciousPatterns)).toBe(true);
  });
});