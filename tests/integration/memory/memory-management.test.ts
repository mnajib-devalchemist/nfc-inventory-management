/**
 * Memory Management Tests
 * Tests memory cleanup and automatic resource management
 */

import { jest } from '@jest/globals';

describe('Memory Management Tests', () => {
  let mockPerformance: any;
  let originalRequestIdleCallback: any;
  let originalCancelIdleCallback: any;

  beforeEach(() => {
    // Mock Performance API
    mockPerformance = {
      memory: {
        usedJSHeapSize: 50 * 1024 * 1024, // 50MB initial
        totalJSHeapSize: 100 * 1024 * 1024, // 100MB total
        jsHeapSizeLimit: 2 * 1024 * 1024 * 1024 // 2GB limit
      },
      now: jest.fn(() => Date.now()),
      mark: jest.fn(),
      measure: jest.fn(),
      getEntriesByType: jest.fn(() => [])
    };

    Object.defineProperty(global, 'performance', {
      value: mockPerformance,
      writable: true
    });

    // Mock requestIdleCallback
    originalRequestIdleCallback = global.requestIdleCallback;
    originalCancelIdleCallback = global.cancelIdleCallback;

    global.requestIdleCallback = jest.fn((callback) => {
      setTimeout(() => callback({ didTimeout: false, timeRemaining: () => 50 }), 0);
      return 1;
    });

    global.cancelIdleCallback = jest.fn();

    // Mock WeakMap and WeakSet for cleanup tracking
    global.WeakMap = jest.fn(() => ({
      set: jest.fn(),
      get: jest.fn(),
      has: jest.fn(),
      delete: jest.fn()
    })) as any;

    global.WeakSet = jest.fn(() => ({
      add: jest.fn(),
      has: jest.fn(),
      delete: jest.fn()
    })) as any;
  });

  afterEach(() => {
    global.requestIdleCallback = originalRequestIdleCallback;
    global.cancelIdleCallback = originalCancelIdleCallback;
    jest.clearAllMocks();
  });

  describe('Memory Monitoring', () => {
    test('should monitor memory usage during photo processing', () => {
      const memoryMonitor = {
        getCurrentUsage: () => mockPerformance.memory.usedJSHeapSize,
        getMemoryPressure: () => {
          const used = mockPerformance.memory.usedJSHeapSize;
          const total = mockPerformance.memory.totalJSHeapSize;
          return used / total;
        },
        isMemoryPressureHigh: () => {
          return memoryMonitor.getMemoryPressure() > 0.8;
        }
      };

      expect(memoryMonitor.getCurrentUsage()).toBe(50 * 1024 * 1024);
      expect(memoryMonitor.getMemoryPressure()).toBe(0.5);
      expect(memoryMonitor.isMemoryPressureHigh()).toBe(false);

      // Simulate high memory usage
      mockPerformance.memory.usedJSHeapSize = 85 * 1024 * 1024;

      expect(memoryMonitor.getMemoryPressure()).toBe(0.85);
      expect(memoryMonitor.isMemoryPressureHigh()).toBe(true);
    });

    test('should detect memory leaks in photo processing', async () => {
      const initialMemory = mockPerformance.memory.usedJSHeapSize;
      const memorySnapshots: number[] = [];

      const processPhotos = async (photoCount: number) => {
        for (let i = 0; i < photoCount; i++) {
          // Simulate photo processing that should clean up
          const photoData = new ArrayBuffer(1024 * 1024); // 1MB
          const processedData = new Uint8Array(photoData);

          // Process photo (mock)
          processedData.fill(255);

          // Take memory snapshot
          memorySnapshots.push(mockPerformance.memory.usedJSHeapSize);

          // Simulate memory increase during processing
          mockPerformance.memory.usedJSHeapSize += 1024 * 1024;

          // Simulate cleanup
          if (i % 5 === 4) {
            // Trigger garbage collection simulation
            mockPerformance.memory.usedJSHeapSize = Math.max(
              initialMemory,
              mockPerformance.memory.usedJSHeapSize - (5 * 1024 * 1024)
            );
          }
        }
      };

      await processPhotos(20);

      // Memory should not have grown unboundedly
      const finalMemory = mockPerformance.memory.usedJSHeapSize;
      const memoryGrowth = finalMemory - initialMemory;

      expect(memoryGrowth).toBeLessThan(10 * 1024 * 1024); // Should not grow more than 10MB
    });

    test('should trigger cleanup when memory pressure is high', async () => {
      const cleanupTasks: string[] = [];

      const memoryManager = {
        cleanup: {
          images: jest.fn(() => cleanupTasks.push('images')),
          caches: jest.fn(() => cleanupTasks.push('caches')),
          eventListeners: jest.fn(() => cleanupTasks.push('eventListeners')),
          timers: jest.fn(() => cleanupTasks.push('timers'))
        },
        performCleanup: async function() {
          if (mockPerformance.memory.usedJSHeapSize / mockPerformance.memory.totalJSHeapSize > 0.8) {
            this.cleanup.images();
            this.cleanup.caches();
            this.cleanup.eventListeners();
            this.cleanup.timers();

            // Simulate memory reduction after cleanup
            mockPerformance.memory.usedJSHeapSize = Math.max(
              30 * 1024 * 1024,
              mockPerformance.memory.usedJSHeapSize * 0.6
            );
          }
        }
      };

      // Simulate high memory usage
      mockPerformance.memory.usedJSHeapSize = 85 * 1024 * 1024;

      await memoryManager.performCleanup();

      expect(cleanupTasks).toEqual(['images', 'caches', 'eventListeners', 'timers']);
      expect(mockPerformance.memory.usedJSHeapSize).toBeLessThan(85 * 1024 * 1024);
    });
  });

  describe('Canvas Memory Management', () => {
    test('should properly dispose of canvas resources', () => {
      const canvasManager = {
        activeCanvases: new Set<HTMLCanvasElement>(),

        createCanvas: (width: number, height: number): HTMLCanvasElement => {
          const canvas = {
            width,
            height,
            getContext: jest.fn(() => ({
              clearRect: jest.fn(),
              drawImage: jest.fn(),
              getImageData: jest.fn(),
              putImageData: jest.fn()
            })),
            remove: jest.fn(),
            style: {},
            toBlob: jest.fn(),
            toDataURL: jest.fn()
          } as any;

          canvasManager.activeCanvases.add(canvas);
          return canvas;
        },

        disposeCanvas: (canvas: HTMLCanvasElement): void => {
          if (canvasManager.activeCanvases.has(canvas)) {
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.clearRect(0, 0, canvas.width, canvas.height);
            }
            canvas.width = 0;
            canvas.height = 0;
            canvas.remove?.();
            canvasManager.activeCanvases.delete(canvas);
          }
        },

        disposeAllCanvases: (): void => {
          canvasManager.activeCanvases.forEach(canvas => {
            canvasManager.disposeCanvas(canvas);
          });
        },

        getActiveCanvasCount: (): number => {
          return canvasManager.activeCanvases.size;
        }
      };

      // Create multiple canvases
      const canvas1 = canvasManager.createCanvas(1920, 1080);
      const canvas2 = canvasManager.createCanvas(1280, 720);
      const canvas3 = canvasManager.createCanvas(640, 480);

      expect(canvasManager.getActiveCanvasCount()).toBe(3);

      // Dispose individual canvas
      canvasManager.disposeCanvas(canvas1);
      expect(canvasManager.getActiveCanvasCount()).toBe(2);
      expect(canvas1.width).toBe(0);
      expect(canvas1.height).toBe(0);

      // Dispose all canvases
      canvasManager.disposeAllCanvases();
      expect(canvasManager.getActiveCanvasCount()).toBe(0);
    });

    test('should limit concurrent canvas usage', () => {
      const canvasPool = {
        maxCanvases: 3,
        pool: [] as HTMLCanvasElement[],
        inUse: new Set<HTMLCanvasElement>(),

        acquire: (width: number, height: number): HTMLCanvasElement | null => {
          if (canvasPool.inUse.size >= canvasPool.maxCanvases) {
            return null; // Pool exhausted
          }

          let canvas = canvasPool.pool.find(c => c.width === width && c.height === height);

          if (!canvas) {
            canvas = {
              width,
              height,
              getContext: jest.fn(() => ({
                clearRect: jest.fn(),
                drawImage: jest.fn()
              }))
            } as any;
          } else {
            canvasPool.pool = canvasPool.pool.filter(c => c !== canvas);
          }

          canvasPool.inUse.add(canvas);
          return canvas;
        },

        release: (canvas: HTMLCanvasElement): void => {
          if (canvasPool.inUse.has(canvas)) {
            canvasPool.inUse.delete(canvas);

            // Clear canvas for reuse
            const ctx = canvas.getContext('2d');
            ctx?.clearRect(0, 0, canvas.width, canvas.height);

            canvasPool.pool.push(canvas);
          }
        },

        getAvailableCount: (): number => {
          return canvasPool.maxCanvases - canvasPool.inUse.size;
        }
      };

      // Acquire canvases up to limit
      const canvas1 = canvasPool.acquire(1920, 1080);
      const canvas2 = canvasPool.acquire(1280, 720);
      const canvas3 = canvasPool.acquire(640, 480);

      expect(canvas1).not.toBeNull();
      expect(canvas2).not.toBeNull();
      expect(canvas3).not.toBeNull();
      expect(canvasPool.getAvailableCount()).toBe(0);

      // Try to acquire one more (should fail)
      const canvas4 = canvasPool.acquire(800, 600);
      expect(canvas4).toBeNull();

      // Release one canvas
      canvasPool.release(canvas1!);
      expect(canvasPool.getAvailableCount()).toBe(1);

      // Should be able to acquire again
      const canvas5 = canvasPool.acquire(800, 600);
      expect(canvas5).not.toBeNull();
    });
  });

  describe('Image Data Memory Management', () => {
    test('should manage ImageData objects efficiently', () => {
      const imageDataManager = {
        cache: new Map<string, ImageData>(),
        maxCacheSize: 50 * 1024 * 1024, // 50MB
        currentCacheSize: 0,

        createImageData: (width: number, height: number): ImageData => {
          const data = new Uint8ClampedArray(width * height * 4);
          return { data, width, height } as ImageData;
        },

        cacheImageData: (key: string, imageData: ImageData): void => {
          const size = imageData.data.byteLength;

          // Check if adding this would exceed cache limit
          if (imageDataManager.currentCacheSize + size > imageDataManager.maxCacheSize) {
            imageDataManager.evictLeastRecentlyUsed();
          }

          imageDataManager.cache.set(key, imageData);
          imageDataManager.currentCacheSize += size;
        },

        getImageData: (key: string): ImageData | undefined => {
          return imageDataManager.cache.get(key);
        },

        evictLeastRecentlyUsed: (): void => {
          // Evict half the cache (simple LRU simulation)
          const entries = Array.from(imageDataManager.cache.entries());
          const toEvict = entries.slice(0, Math.floor(entries.length / 2));

          toEvict.forEach(([key, imageData]) => {
            imageDataManager.cache.delete(key);
            imageDataManager.currentCacheSize -= imageData.data.byteLength;
          });
        },

        clearCache: (): void => {
          imageDataManager.cache.clear();
          imageDataManager.currentCacheSize = 0;
        },

        getCacheStats: () => ({
          size: imageDataManager.currentCacheSize,
          count: imageDataManager.cache.size,
          utilization: imageDataManager.currentCacheSize / imageDataManager.maxCacheSize
        })
      };

      // Add images to cache
      const image1 = imageDataManager.createImageData(1920, 1080);
      const image2 = imageDataManager.createImageData(1280, 720);
      const image3 = imageDataManager.createImageData(640, 480);

      imageDataManager.cacheImageData('image1', image1);
      imageDataManager.cacheImageData('image2', image2);
      imageDataManager.cacheImageData('image3', image3);

      const stats = imageDataManager.getCacheStats();
      expect(stats.count).toBe(3);
      expect(stats.size).toBeGreaterThan(0);

      // Clear cache
      imageDataManager.clearCache();
      const clearedStats = imageDataManager.getCacheStats();
      expect(clearedStats.count).toBe(0);
      expect(clearedStats.size).toBe(0);
    });

    test('should handle memory pressure during image processing', async () => {
      const memoryPressureHandler = {
        processingQueue: [] as Array<{ id: string; priority: number }>,
        activeProcessing: new Set<string>(),

        queueImage: (id: string, priority: number = 1): void => {
          memoryPressureHandler.processingQueue.push({ id, priority });
          memoryPressureHandler.processingQueue.sort((a, b) => b.priority - a.priority);
        },

        processNext: async (): Promise<boolean> => {
          if (mockPerformance.memory.usedJSHeapSize / mockPerformance.memory.totalJSHeapSize > 0.9) {
            // Memory pressure too high, pause processing
            return false;
          }

          const next = memoryPressureHandler.processingQueue.shift();
          if (!next) return false;

          memoryPressureHandler.activeProcessing.add(next.id);

          // Simulate processing
          await new Promise(resolve => setTimeout(resolve, 10));

          memoryPressureHandler.activeProcessing.delete(next.id);
          return true;
        },

        pauseProcessing: (): void => {
          // Stop all active processing
          memoryPressureHandler.activeProcessing.clear();
        },

        getQueueSize: (): number => {
          return memoryPressureHandler.processingQueue.length;
        }
      };

      // Queue multiple images
      memoryPressureHandler.queueImage('img1', 3);
      memoryPressureHandler.queueImage('img2', 1);
      memoryPressureHandler.queueImage('img3', 2);

      expect(memoryPressureHandler.getQueueSize()).toBe(3);

      // Process with normal memory
      let processed = await memoryPressureHandler.processNext();
      expect(processed).toBe(true);
      expect(memoryPressureHandler.getQueueSize()).toBe(2);

      // Simulate high memory pressure
      mockPerformance.memory.usedJSHeapSize = 95 * 1024 * 1024;

      processed = await memoryPressureHandler.processNext();
      expect(processed).toBe(false); // Should refuse to process
      expect(memoryPressureHandler.getQueueSize()).toBe(2); // Queue unchanged
    });
  });

  describe('Event Listener Memory Management', () => {
    test('should track and cleanup event listeners', () => {
      const eventListenerManager = {
        listeners: new Map<EventTarget, Map<string, EventListener[]>>(),

        addEventListener: (target: EventTarget, type: string, listener: EventListener): void => {
          if (!eventListenerManager.listeners.has(target)) {
            eventListenerManager.listeners.set(target, new Map());
          }

          const targetListeners = eventListenerManager.listeners.get(target)!;
          if (!targetListeners.has(type)) {
            targetListeners.set(type, []);
          }

          targetListeners.get(type)!.push(listener);
          target.addEventListener(type, listener);
        },

        removeEventListener: (target: EventTarget, type: string, listener: EventListener): void => {
          const targetListeners = eventListenerManager.listeners.get(target);
          if (targetListeners) {
            const typeListeners = targetListeners.get(type);
            if (typeListeners) {
              const index = typeListeners.indexOf(listener);
              if (index > -1) {
                typeListeners.splice(index, 1);
                target.removeEventListener(type, listener);
              }
            }
          }
        },

        cleanupTarget: (target: EventTarget): void => {
          const targetListeners = eventListenerManager.listeners.get(target);
          if (targetListeners) {
            targetListeners.forEach((listeners, type) => {
              listeners.forEach(listener => {
                target.removeEventListener(type, listener);
              });
            });
            eventListenerManager.listeners.delete(target);
          }
        },

        cleanupAll: (): void => {
          eventListenerManager.listeners.forEach((targetListeners, target) => {
            eventListenerManager.cleanupTarget(target);
          });
        },

        getListenerCount: (): number => {
          let count = 0;
          eventListenerManager.listeners.forEach(targetListeners => {
            targetListeners.forEach(listeners => {
              count += listeners.length;
            });
          });
          return count;
        }
      };

      // Mock EventTarget
      const mockTarget = {
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn()
      } as any;

      const listener1 = jest.fn();
      const listener2 = jest.fn();

      // Add listeners
      eventListenerManager.addEventListener(mockTarget, 'click', listener1);
      eventListenerManager.addEventListener(mockTarget, 'change', listener2);

      expect(eventListenerManager.getListenerCount()).toBe(2);
      expect(mockTarget.addEventListener).toHaveBeenCalledTimes(2);

      // Remove specific listener
      eventListenerManager.removeEventListener(mockTarget, 'click', listener1);
      expect(eventListenerManager.getListenerCount()).toBe(1);
      expect(mockTarget.removeEventListener).toHaveBeenCalledWith('click', listener1);

      // Cleanup all for target
      eventListenerManager.cleanupTarget(mockTarget);
      expect(eventListenerManager.getListenerCount()).toBe(0);
      expect(mockTarget.removeEventListener).toHaveBeenCalledWith('change', listener2);
    });
  });

  describe('Timer Memory Management', () => {
    test('should track and cleanup timers', () => {
      const timerManager = {
        timers: new Set<number>(),

        setTimeout: (callback: () => void, delay: number): number => {
          const timerId = window.setTimeout(() => {
            timerManager.timers.delete(timerId);
            callback();
          }, delay);
          timerManager.timers.add(timerId);
          return timerId;
        },

        setInterval: (callback: () => void, delay: number): number => {
          const timerId = window.setInterval(callback, delay);
          timerManager.timers.add(timerId);
          return timerId;
        },

        clearTimeout: (timerId: number): void => {
          if (timerManager.timers.has(timerId)) {
            window.clearTimeout(timerId);
            timerManager.timers.delete(timerId);
          }
        },

        clearInterval: (timerId: number): void => {
          if (timerManager.timers.has(timerId)) {
            window.clearInterval(timerId);
            timerManager.timers.delete(timerId);
          }
        },

        clearAllTimers: (): void => {
          timerManager.timers.forEach(timerId => {
            window.clearTimeout(timerId);
            window.clearInterval(timerId);
          });
          timerManager.timers.clear();
        },

        getActiveTimerCount: (): number => {
          return timerManager.timers.size;
        }
      };

      // Mock window timers
      let timerId = 1;
      window.setTimeout = jest.fn(() => timerId++);
      window.setInterval = jest.fn(() => timerId++);
      window.clearTimeout = jest.fn();
      window.clearInterval = jest.fn();

      // Create timers
      const timeout1 = timerManager.setTimeout(() => {}, 1000);
      const timeout2 = timerManager.setTimeout(() => {}, 2000);
      const interval1 = timerManager.setInterval(() => {}, 500);

      expect(timerManager.getActiveTimerCount()).toBe(3);

      // Clear specific timer
      timerManager.clearTimeout(timeout1);
      expect(timerManager.getActiveTimerCount()).toBe(2);
      expect(window.clearTimeout).toHaveBeenCalledWith(timeout1);

      // Clear all timers
      timerManager.clearAllTimers();
      expect(timerManager.getActiveTimerCount()).toBe(0);
    });
  });

  describe('Automatic Cleanup on Page Unload', () => {
    test('should cleanup resources on beforeunload', () => {
      const cleanupCallbacks: (() => void)[] = [];

      const lifecycleManager = {
        addCleanupCallback: (callback: () => void): void => {
          cleanupCallbacks.push(callback);
        },

        performCleanup: (): void => {
          cleanupCallbacks.forEach(callback => {
            try {
              callback();
            } catch (error) {
              console.error('Cleanup error:', error);
            }
          });
          cleanupCallbacks.length = 0;
        }
      };

      const mockCleanup1 = jest.fn();
      const mockCleanup2 = jest.fn();

      lifecycleManager.addCleanupCallback(mockCleanup1);
      lifecycleManager.addCleanupCallback(mockCleanup2);

      // Simulate page unload
      lifecycleManager.performCleanup();

      expect(mockCleanup1).toHaveBeenCalled();
      expect(mockCleanup2).toHaveBeenCalled();
    });

    test('should handle cleanup errors gracefully', () => {
      const cleanupCallbacks: (() => void)[] = [];
      const cleanupErrors: Error[] = [];

      const lifecycleManager = {
        addCleanupCallback: (callback: () => void): void => {
          cleanupCallbacks.push(callback);
        },

        performCleanup: (): void => {
          cleanupCallbacks.forEach(callback => {
            try {
              callback();
            } catch (error) {
              cleanupErrors.push(error as Error);
            }
          });
          cleanupCallbacks.length = 0;
        },

        getCleanupErrors: (): Error[] => {
          return [...cleanupErrors];
        }
      };

      const goodCleanup = jest.fn();
      const badCleanup = jest.fn(() => {
        throw new Error('Cleanup failed');
      });

      lifecycleManager.addCleanupCallback(goodCleanup);
      lifecycleManager.addCleanupCallback(badCleanup);
      lifecycleManager.addCleanupCallback(goodCleanup);

      lifecycleManager.performCleanup();

      expect(goodCleanup).toHaveBeenCalledTimes(2);
      expect(badCleanup).toHaveBeenCalled();
      expect(lifecycleManager.getCleanupErrors()).toHaveLength(1);
      expect(lifecycleManager.getCleanupErrors()[0].message).toBe('Cleanup failed');
    });
  });
});