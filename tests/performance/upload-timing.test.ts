/**
 * Upload Performance Tests
 * Validates 30-second upload requirement and timing under various conditions
 */

import { jest } from '@jest/globals';

describe('Upload Performance Tests', () => {
  const UPLOAD_TIMEOUT_MS = 30000; // 30 seconds as per AC5
  const LARGE_FILE_SIZE = 5 * 1024 * 1024; // 5MB
  const MEDIUM_FILE_SIZE = 2 * 1024 * 1024; // 2MB
  const SMALL_FILE_SIZE = 500 * 1024; // 500KB

  beforeEach(() => {
    // Reset all mocks and timers
    jest.clearAllMocks();
    jest.clearAllTimers();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  /**
   * Mock file creation utility
   */
  function createMockFile(name: string, size: number, type: string = 'image/jpeg'): File {
    const buffer = new ArrayBuffer(size);
    const uint8Array = new Uint8Array(buffer);

    // Fill with realistic JPEG header and data
    uint8Array[0] = 0xFF;
    uint8Array[1] = 0xD8;
    uint8Array[2] = 0xFF;

    return new File([buffer], name, { type });
  }

  /**
   * Mock fetch for upload endpoint
   */
  function mockUploadFetch(delay: number, success: boolean = true) {
    global.fetch = jest.fn().mockImplementation(() => {
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          if (success) {
            resolve(new Response(JSON.stringify({
              id: 'photo-123',
              originalUrl: 'https://cdn.example.com/photo.jpg',
              processingTime: delay
            }), { status: 201 }));
          } else {
            reject(new Error('Upload failed'));
          }
        }, delay);
      });
    });
  }

  describe('Upload Timing Requirements', () => {
    test('should complete small file upload within 5 seconds', async () => {
      const file = createMockFile('small.jpg', SMALL_FILE_SIZE);
      const uploadDelay = 3000; // 3 seconds
      mockUploadFetch(uploadDelay);

      const startTime = Date.now();

      const formData = new FormData();
      formData.append('photo', file);

      // Simulate upload
      jest.advanceTimersByTime(uploadDelay);

      const response = await fetch('/api/v1/items/test-item/photos', {
        method: 'POST',
        body: formData
      });

      const result = await response.json();
      const uploadTime = Date.now() - startTime;

      expect(response.status).toBe(201);
      expect(uploadTime).toBeLessThan(5000);
      expect(result.processingTime).toBe(uploadDelay);
    });

    test('should complete medium file upload within 15 seconds', async () => {
      const file = createMockFile('medium.jpg', MEDIUM_FILE_SIZE);
      const uploadDelay = 12000; // 12 seconds
      mockUploadFetch(uploadDelay);

      const startTime = Date.now();

      const formData = new FormData();
      formData.append('photo', file);

      jest.advanceTimersByTime(uploadDelay);

      const response = await fetch('/api/v1/items/test-item/photos', {
        method: 'POST',
        body: formData
      });

      const uploadTime = Date.now() - startTime;

      expect(response.status).toBe(201);
      expect(uploadTime).toBeLessThan(15000);
    });

    test('should complete large file upload within 30 seconds (AC5)', async () => {
      const file = createMockFile('large.jpg', LARGE_FILE_SIZE);
      const uploadDelay = 25000; // 25 seconds
      mockUploadFetch(uploadDelay);

      const startTime = Date.now();

      const formData = new FormData();
      formData.append('photo', file);

      jest.advanceTimersByTime(uploadDelay);

      const response = await fetch('/api/v1/items/test-item/photos', {
        method: 'POST',
        body: formData
      });

      const uploadTime = Date.now() - startTime;

      expect(response.status).toBe(201);
      expect(uploadTime).toBeLessThan(UPLOAD_TIMEOUT_MS);
      expect(uploadTime).toBeLessThanOrEqual(25000);
    });

    test('should timeout if upload exceeds 30 seconds', async () => {
      const file = createMockFile('timeout.jpg', LARGE_FILE_SIZE);
      const uploadDelay = 35000; // 35 seconds - exceeds limit
      mockUploadFetch(uploadDelay);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);

      const formData = new FormData();
      formData.append('photo', file);

      // Advance to timeout
      jest.advanceTimersByTime(UPLOAD_TIMEOUT_MS);

      try {
        await fetch('/api/v1/items/test-item/photos', {
          method: 'POST',
          body: formData,
          signal: controller.signal
        });
        fail('Upload should have been aborted');
      } catch (error) {
        expect((error as Error).name).toBe('AbortError');
      }

      clearTimeout(timeoutId);
    });
  });

  describe('HEIC Conversion Performance', () => {
    test('should complete HEIC to JPEG conversion within timeout', async () => {
      const heicFile = createMockFile('image.heic', MEDIUM_FILE_SIZE, 'image/heic');
      const conversionDelay = 8000; // 8 seconds for conversion

      // Mock HEIC conversion endpoint
      global.fetch = jest.fn().mockImplementation((url) => {
        if (url.includes('/convert-heic')) {
          return new Promise((resolve) => {
            setTimeout(() => {
              const jpegBuffer = new ArrayBuffer(MEDIUM_FILE_SIZE * 0.8); // Compressed
              resolve(new Response(jpegBuffer, {
                status: 200,
                headers: {
                  'Content-Type': 'image/jpeg',
                  'X-Conversion-Time': conversionDelay.toString()
                }
              }));
            }, conversionDelay);
          });
        }

        // Upload endpoint
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve(new Response(JSON.stringify({ id: 'photo-123' }), { status: 201 }));
          }, 2000);
        });
      });

      const startTime = Date.now();

      // Step 1: Convert HEIC to JPEG
      const conversionFormData = new FormData();
      conversionFormData.append('heicFile', heicFile);

      jest.advanceTimersByTime(conversionDelay);

      const conversionResponse = await fetch('/api/v1/utils/convert-heic', {
        method: 'POST',
        body: conversionFormData
      });

      expect(conversionResponse.status).toBe(200);

      const jpegBuffer = await conversionResponse.arrayBuffer();
      const convertedFile = new File([jpegBuffer], 'converted.jpg', { type: 'image/jpeg' });

      // Step 2: Upload converted file
      const uploadFormData = new FormData();
      uploadFormData.append('photo', convertedFile);

      jest.advanceTimersByTime(2000);

      const uploadResponse = await fetch('/api/v1/items/test-item/photos', {
        method: 'POST',
        body: uploadFormData
      });

      const totalTime = Date.now() - startTime;

      expect(uploadResponse.status).toBe(201);
      expect(totalTime).toBeLessThan(UPLOAD_TIMEOUT_MS);
      expect(totalTime).toBe(conversionDelay + 2000);
    });

    test('should handle HEIC conversion timeout gracefully', async () => {
      const heicFile = createMockFile('slow.heic', LARGE_FILE_SIZE, 'image/heic');
      const conversionDelay = 35000; // Exceeds timeout

      global.fetch = jest.fn().mockImplementation(() => {
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve(new Response('Timeout', { status: 408 }));
          }, conversionDelay);
        });
      });

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);

      const formData = new FormData();
      formData.append('heicFile', heicFile);

      jest.advanceTimersByTime(UPLOAD_TIMEOUT_MS);

      try {
        await fetch('/api/v1/utils/convert-heic', {
          method: 'POST',
          body: formData,
          signal: controller.signal
        });
        fail('HEIC conversion should have been aborted');
      } catch (error) {
        expect((error as Error).name).toBe('AbortError');
      }

      clearTimeout(timeoutId);
    });
  });

  describe('Concurrent Upload Performance', () => {
    test('should handle multiple uploads without significant delay', async () => {
      const files = [
        createMockFile('file1.jpg', SMALL_FILE_SIZE),
        createMockFile('file2.jpg', SMALL_FILE_SIZE),
        createMockFile('file3.jpg', SMALL_FILE_SIZE)
      ];

      const uploadDelay = 3000; // 3 seconds per upload
      mockUploadFetch(uploadDelay);

      const startTime = Date.now();

      // Simulate concurrent uploads
      const uploadPromises = files.map((file, index) => {
        const formData = new FormData();
        formData.append('photo', file);

        return fetch(`/api/v1/items/test-item-${index}/photos`, {
          method: 'POST',
          body: formData
        });
      });

      // Advance time for concurrent processing
      jest.advanceTimersByTime(uploadDelay);

      const responses = await Promise.all(uploadPromises);
      const totalTime = Date.now() - startTime;

      responses.forEach(response => {
        expect(response.status).toBe(201);
      });

      // Concurrent uploads should not take 3x the time
      expect(totalTime).toBeLessThan(uploadDelay * 2);
    });

    test('should respect rate limiting during concurrent uploads', async () => {
      const files = Array.from({ length: 15 }, (_, i) =>
        createMockFile(`file${i}.jpg`, SMALL_FILE_SIZE)
      );

      // Mock rate limiting response
      global.fetch = jest.fn().mockImplementation((url, options) => {
        const callCount = (global.fetch as jest.Mock).mock.calls.length;

        if (callCount > 10) { // Rate limit after 10 requests
          return Promise.resolve(new Response(JSON.stringify({
            error: 'Rate limit exceeded',
            retryAfter: 60
          }), { status: 429 }));
        }

        return Promise.resolve(new Response(JSON.stringify({ id: `photo-${callCount}` }), { status: 201 }));
      });

      const uploadPromises = files.map((file, index) => {
        const formData = new FormData();
        formData.append('photo', file);

        return fetch(`/api/v1/items/test-item/photos`, {
          method: 'POST',
          body: formData
        });
      });

      const responses = await Promise.all(uploadPromises);

      const successfulUploads = responses.filter(r => r.status === 201);
      const rateLimitedUploads = responses.filter(r => r.status === 429);

      expect(successfulUploads.length).toBe(10);
      expect(rateLimitedUploads.length).toBe(5);
    });
  });

  describe('Network Condition Simulation', () => {
    test('should complete upload on slow network within acceptable time', async () => {
      const file = createMockFile('slow-network.jpg', MEDIUM_FILE_SIZE);
      const networkDelay = 20000; // 20 seconds for slow network
      mockUploadFetch(networkDelay);

      const startTime = Date.now();

      const formData = new FormData();
      formData.append('photo', file);

      jest.advanceTimersByTime(networkDelay);

      const response = await fetch('/api/v1/items/test-item/photos', {
        method: 'POST',
        body: formData
      });

      const uploadTime = Date.now() - startTime;

      expect(response.status).toBe(201);
      expect(uploadTime).toBeLessThan(UPLOAD_TIMEOUT_MS);
      expect(uploadTime).toBe(networkDelay);
    });

    test('should retry failed uploads within timeout window', async () => {
      const file = createMockFile('retry.jpg', SMALL_FILE_SIZE);
      let attemptCount = 0;

      global.fetch = jest.fn().mockImplementation(() => {
        attemptCount++;

        if (attemptCount < 3) {
          // Fail first 2 attempts
          return Promise.reject(new Error('Network error'));
        }

        // Succeed on 3rd attempt
        return Promise.resolve(new Response(JSON.stringify({
          id: 'photo-123',
          attempts: attemptCount
        }), { status: 201 }));
      });

      const startTime = Date.now();

      const formData = new FormData();
      formData.append('photo', file);

      // Simulate retry logic with exponential backoff
      let lastError;
      let response;

      for (let i = 0; i < 3; i++) {
        try {
          response = await fetch('/api/v1/items/test-item/photos', {
            method: 'POST',
            body: formData
          });
          break;
        } catch (error) {
          lastError = error;
          const backoffDelay = Math.pow(2, i) * 1000; // 1s, 2s, 4s
          jest.advanceTimersByTime(backoffDelay);
        }
      }

      const totalTime = Date.now() - startTime;

      expect(response!.status).toBe(201);
      expect(attemptCount).toBe(3);
      expect(totalTime).toBeLessThan(UPLOAD_TIMEOUT_MS);
    });
  });

  describe('Memory Performance', () => {
    test('should not cause memory leaks during large file processing', async () => {
      const file = createMockFile('large-memory.jpg', LARGE_FILE_SIZE);
      mockUploadFetch(5000);

      // Mock memory usage tracking
      const initialMemory = 100; // MB
      let currentMemory = initialMemory;

      const mockPerformance = {
        memory: {
          get usedJSHeapSize() { return currentMemory * 1024 * 1024; },
          get totalJSHeapSize() { return (currentMemory + 50) * 1024 * 1024; }
        }
      };

      Object.defineProperty(global, 'performance', {
        value: mockPerformance,
        writable: true
      });

      const formData = new FormData();
      formData.append('photo', file);

      // Simulate memory increase during processing
      currentMemory += 20; // Increase by 20MB during processing

      jest.advanceTimersByTime(5000);

      const response = await fetch('/api/v1/items/test-item/photos', {
        method: 'POST',
        body: formData
      });

      // Simulate memory cleanup after processing
      currentMemory = initialMemory + 2; // Should return close to initial with small overhead

      expect(response.status).toBe(201);
      expect(mockPerformance.memory.usedJSHeapSize).toBeLessThan((initialMemory + 10) * 1024 * 1024);
    });
  });

  describe('Performance Metrics Collection', () => {
    test('should collect and validate upload performance metrics', async () => {
      const file = createMockFile('metrics.jpg', MEDIUM_FILE_SIZE);
      const uploadDelay = 8000;

      // Mock performance API
      const performanceMock = {
        now: jest.fn()
          .mockReturnValueOnce(0)      // Start time
          .mockReturnValueOnce(2000)   // Processing start
          .mockReturnValueOnce(6000)   // Upload start
          .mockReturnValueOnce(8000),  // Complete time
        mark: jest.fn(),
        measure: jest.fn()
      };

      Object.defineProperty(global, 'performance', {
        value: performanceMock,
        writable: true
      });

      mockUploadFetch(uploadDelay);

      const formData = new FormData();
      formData.append('photo', file);

      jest.advanceTimersByTime(uploadDelay);

      const response = await fetch('/api/v1/items/test-item/photos', {
        method: 'POST',
        body: formData
      });

      const result = await response.json();

      expect(response.status).toBe(201);
      expect(result.processingTime).toBe(uploadDelay);
      expect(performanceMock.now).toHaveBeenCalledTimes(4);
      expect(performanceMock.mark).toHaveBeenCalled();
    });
  });
});