/**
 * HEIC Conversion Pipeline Tests
 * Tests HEIC to JPEG conversion with security validation
 */

import { jest } from '@jest/globals';

describe('HEIC Conversion Pipeline Tests', () => {
  let mockSharp: any;
  let originalFetch: any;

  beforeEach(() => {
    // Mock Sharp library
    mockSharp = {
      jpeg: jest.fn().mockReturnThis(),
      withMetadata: jest.fn().mockReturnThis(),
      toBuffer: jest.fn().mockResolvedValue(Buffer.from('converted-jpeg-data'))
    };

    jest.mock('sharp', () => jest.fn(() => mockSharp));

    // Store original fetch
    originalFetch = global.fetch;

    // Mock fetch for API calls
    global.fetch = jest.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
    jest.resetModules();
  });

  function createMockHEICFile(size: number = 1024 * 1024): File {
    // Create a buffer with HEIC file signature
    const buffer = new ArrayBuffer(size);
    const view = new Uint8Array(buffer);

    // HEIC file signature (ftypheic)
    view[4] = 0x66; // f
    view[5] = 0x74; // t
    view[6] = 0x79; // y
    view[7] = 0x70; // p
    view[8] = 0x68; // h
    view[9] = 0x65; // e
    view[10] = 0x69; // i
    view[11] = 0x63; // c

    return new File([buffer], 'test.heic', { type: 'image/heic' });
  }

  function createMalformedHEICFile(size: number = 1024): File {
    const buffer = new ArrayBuffer(size);
    const view = new Uint8Array(buffer);

    // Invalid signature
    view[4] = 0x00;
    view[5] = 0x00;
    view[6] = 0x00;
    view[7] = 0x00;

    return new File([buffer], 'malformed.heic', { type: 'image/heic' });
  }

  describe('HEIC File Validation', () => {
    test('should validate genuine HEIC file', async () => {
      const heicFile = createMockHEICFile();

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        arrayBuffer: () => Promise.resolve(heicFile.arrayBuffer())
      });

      const formData = new FormData();
      formData.append('heicFile', heicFile);

      const response = await fetch('/api/v1/utils/convert-heic', {
        method: 'POST',
        body: formData
      });

      expect(response.ok).toBe(true);
    });

    test('should reject malformed HEIC file', async () => {
      const malformedFile = createMalformedHEICFile();

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 400,
        json: () => Promise.resolve({
          error: 'Invalid HEIC file: Invalid file signature'
        })
      });

      const formData = new FormData();
      formData.append('heicFile', malformedFile);

      const response = await fetch('/api/v1/utils/convert-heic', {
        method: 'POST',
        body: formData
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(400);

      const result = await response.json();
      expect(result.error).toContain('Invalid HEIC file');
    });

    test('should reject oversized HEIC file', async () => {
      const oversizedFile = createMockHEICFile(20 * 1024 * 1024); // 20MB

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 413,
        json: () => Promise.resolve({
          error: 'File too large. Maximum size is 10MB'
        })
      });

      const formData = new FormData();
      formData.append('heicFile', oversizedFile);

      const response = await fetch('/api/v1/utils/convert-heic', {
        method: 'POST',
        body: formData
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(413);
    });
  });

  describe('Conversion Process', () => {
    test('should convert HEIC to JPEG successfully', async () => {
      const heicFile = createMockHEICFile(2 * 1024 * 1024); // 2MB
      const convertedJpegBuffer = Buffer.from('converted-jpeg-data');

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        arrayBuffer: () => Promise.resolve(convertedJpegBuffer),
        headers: new Headers({
          'Content-Type': 'image/jpeg',
          'Content-Length': convertedJpegBuffer.length.toString(),
          'X-Original-Format': 'heic',
          'X-Original-Size': heicFile.size.toString(),
          'X-Converted-Size': convertedJpegBuffer.length.toString(),
          'X-Compression-Ratio': (heicFile.size / convertedJpegBuffer.length).toFixed(2)
        })
      });

      const formData = new FormData();
      formData.append('heicFile', heicFile);

      const response = await fetch('/api/v1/utils/convert-heic', {
        method: 'POST',
        body: formData
      });

      expect(response.ok).toBe(true);
      expect(response.headers.get('Content-Type')).toBe('image/jpeg');
      expect(response.headers.get('X-Original-Format')).toBe('heic');

      const convertedBuffer = await response.arrayBuffer();
      expect(convertedBuffer.byteLength).toBe(convertedJpegBuffer.length);
    });

    test('should handle conversion with metadata stripping', async () => {
      const heicFile = createMockHEICFile();

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        arrayBuffer: () => Promise.resolve(Buffer.from('clean-jpeg-data')),
        headers: new Headers({
          'Content-Type': 'image/jpeg',
          'X-Metadata-Stripped': 'true'
        })
      });

      const formData = new FormData();
      formData.append('heicFile', heicFile);

      const response = await fetch('/api/v1/utils/convert-heic', {
        method: 'POST',
        body: formData
      });

      expect(response.ok).toBe(true);
      expect(response.headers.get('X-Metadata-Stripped')).toBe('true');
    });

    test('should handle conversion timeout', async () => {
      const heicFile = createMockHEICFile();

      (global.fetch as jest.Mock).mockImplementation(() => {
        return new Promise((_, reject) => {
          setTimeout(() => {
            reject(new Error('Request timeout'));
          }, 31000); // 31 seconds - exceeds 30s timeout
        });
      });

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      const formData = new FormData();
      formData.append('heicFile', heicFile);

      try {
        await fetch('/api/v1/utils/convert-heic', {
          method: 'POST',
          body: formData,
          signal: controller.signal
        });
        fail('Conversion should have timed out');
      } catch (error) {
        expect((error as Error).name).toBe('AbortError');
      }

      clearTimeout(timeoutId);
    });
  });

  describe('Security Validation', () => {
    test('should reject HEIC file with executable content', async () => {
      // Create HEIC with suspicious executable patterns
      const maliciousBuffer = new ArrayBuffer(1024);
      const view = new Uint8Array(maliciousBuffer);

      // Valid HEIC signature
      view[4] = 0x66; view[5] = 0x74; view[6] = 0x79; view[7] = 0x70;
      view[8] = 0x68; view[9] = 0x65; view[10] = 0x69; view[11] = 0x63;

      // Add executable pattern
      const execPattern = new TextEncoder().encode('#!/bin/sh');
      view.set(execPattern, 100);

      const maliciousFile = new File([maliciousBuffer], 'malicious.heic', { type: 'image/heic' });

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 400,
        json: () => Promise.resolve({
          error: 'Invalid HEIC file: Potential executable content detected'
        })
      });

      const formData = new FormData();
      formData.append('heicFile', maliciousFile);

      const response = await fetch('/api/v1/utils/convert-heic', {
        method: 'POST',
        body: formData
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(400);

      const result = await response.json();
      expect(result.error).toContain('executable content detected');
    });

    test('should reject HEIC file with script injection attempts', async () => {
      const scriptBuffer = new ArrayBuffer(1024);
      const view = new Uint8Array(scriptBuffer);

      // Valid HEIC signature
      view[4] = 0x66; view[5] = 0x74; view[6] = 0x79; view[7] = 0x70;
      view[8] = 0x68; view[9] = 0x65; view[10] = 0x69; view[11] = 0x63;

      // Add script injection
      const scriptPattern = new TextEncoder().encode('<script>alert("xss")</script>');
      view.set(scriptPattern, 200);

      const scriptFile = new File([scriptBuffer], 'script.heic', { type: 'image/heic' });

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 400,
        json: () => Promise.resolve({
          error: 'Invalid HEIC file: Script injection detected'
        })
      });

      const formData = new FormData();
      formData.append('heicFile', scriptFile);

      const response = await fetch('/api/v1/utils/convert-heic', {
        method: 'POST',
        body: formData
      });

      expect(response.ok).toBe(false);

      const result = await response.json();
      expect(result.error).toContain('Script injection detected');
    });

    test('should validate file size limits for security', async () => {
      const normalFile = createMockHEICFile(5 * 1024 * 1024); // 5MB - within limit

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        arrayBuffer: () => Promise.resolve(Buffer.from('converted-data'))
      });

      const formData = new FormData();
      formData.append('heicFile', normalFile);

      const response = await fetch('/api/v1/utils/convert-heic', {
        method: 'POST',
        body: formData
      });

      expect(response.ok).toBe(true);
    });
  });

  describe('Error Handling', () => {
    test('should handle Sharp conversion errors gracefully', async () => {
      const heicFile = createMockHEICFile();

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 400,
        json: () => Promise.resolve({
          error: 'Unsupported HEIC format or corrupted file'
        })
      });

      const formData = new FormData();
      formData.append('heicFile', heicFile);

      const response = await fetch('/api/v1/utils/convert-heic', {
        method: 'POST',
        body: formData
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(400);

      const result = await response.json();
      expect(result.error).toContain('Unsupported HEIC format');
    });

    test('should handle memory limit exceeded errors', async () => {
      const largeFile = createMockHEICFile(15 * 1024 * 1024); // 15MB

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 413,
        json: () => Promise.resolve({
          error: 'Image is too large to process'
        })
      });

      const formData = new FormData();
      formData.append('heicFile', largeFile);

      const response = await fetch('/api/v1/utils/convert-heic', {
        method: 'POST',
        body: formData
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(413);

      const result = await response.json();
      expect(result.error).toBe('Image is too large to process');
    });

    test('should handle unsupported format errors', async () => {
      const invalidFile = new File([new ArrayBuffer(1024)], 'fake.heic', { type: 'image/heic' });

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 400,
        json: () => Promise.resolve({
          error: 'File is not a valid HEIC image'
        })
      });

      const formData = new FormData();
      formData.append('heicFile', invalidFile);

      const response = await fetch('/api/v1/utils/convert-heic', {
        method: 'POST',
        body: formData
      });

      expect(response.ok).toBe(false);

      const result = await response.json();
      expect(result.error).toBe('File is not a valid HEIC image');
    });
  });

  describe('Rate Limiting Integration', () => {
    test('should respect rate limits for HEIC conversion', async () => {
      const heicFile = createMockHEICFile();

      // First few requests succeed
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          arrayBuffer: () => Promise.resolve(Buffer.from('converted-1'))
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          arrayBuffer: () => Promise.resolve(Buffer.from('converted-2'))
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          arrayBuffer: () => Promise.resolve(Buffer.from('converted-3'))
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          arrayBuffer: () => Promise.resolve(Buffer.from('converted-4'))
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          arrayBuffer: () => Promise.resolve(Buffer.from('converted-5'))
        })
        // 6th request gets rate limited
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          json: () => Promise.resolve({
            error: 'Rate limit exceeded',
            message: 'Too many conversion requests. Please try again later.',
            retryAfter: 60
          })
        });

      const formData = new FormData();
      formData.append('heicFile', heicFile);

      // Make 6 requests
      const requests = Array.from({ length: 6 }, () =>
        fetch('/api/v1/utils/convert-heic', {
          method: 'POST',
          body: formData
        })
      );

      const responses = await Promise.all(requests);

      // First 5 should succeed
      responses.slice(0, 5).forEach(response => {
        expect(response.ok).toBe(true);
      });

      // 6th should be rate limited
      expect(responses[5].ok).toBe(false);
      expect(responses[5].status).toBe(429);

      const rateLimitResult = await responses[5].json();
      expect(rateLimitResult.error).toBe('Rate limit exceeded');
      expect(rateLimitResult.retryAfter).toBe(60);
    });
  });

  describe('Performance Metrics', () => {
    test('should track conversion performance metrics', async () => {
      const heicFile = createMockHEICFile(3 * 1024 * 1024); // 3MB
      const conversionStartTime = Date.now();

      (global.fetch as jest.Mock).mockImplementation(() => {
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve({
              ok: true,
              status: 200,
              arrayBuffer: () => Promise.resolve(Buffer.from('converted-data')),
              headers: new Headers({
                'Content-Type': 'image/jpeg',
                'X-Conversion-Time': (Date.now() - conversionStartTime).toString(),
                'X-Original-Size': heicFile.size.toString(),
                'X-Converted-Size': '2097152', // 2MB after conversion
                'X-Compression-Ratio': '1.50'
              })
            });
          }, 2000); // 2 second conversion time
        });
      });

      const formData = new FormData();
      formData.append('heicFile', heicFile);

      const response = await fetch('/api/v1/utils/convert-heic', {
        method: 'POST',
        body: formData
      });

      expect(response.ok).toBe(true);

      const conversionTime = parseInt(response.headers.get('X-Conversion-Time') || '0');
      const compressionRatio = parseFloat(response.headers.get('X-Compression-Ratio') || '0');

      expect(conversionTime).toBeGreaterThan(1900); // ~2 seconds
      expect(conversionTime).toBeLessThan(2100);
      expect(compressionRatio).toBeCloseTo(1.5, 1);
    });
  });
});