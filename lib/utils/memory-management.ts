/**
 * Memory Management & Performance Optimization
 * Implements memory monitoring, cleanup strategies, and performance optimizations
 * for camera operations and large file processing
 */

/**
 * Memory usage statistics interface
 */
export interface MemoryStats {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
  usagePercentage: number;
  isHighUsage: boolean;
  isCriticalUsage: boolean;
}

/**
 * Performance metrics interface
 */
export interface PerformanceMetrics {
  memoryUsage: MemoryStats;
  frameRate: number;
  networkType: string;
  isLowEndDevice: boolean;
  batteryLevel?: number;
  isCharging?: boolean;
}

/**
 * Resource cleanup registry
 */
class ResourceCleanupRegistry {
  private resources: Map<string, () => void> = new Map();
  private blobUrls: Set<string> = new Set();
  private intervals: Set<NodeJS.Timeout> = new Set();
  private timeouts: Set<NodeJS.Timeout> = new Set();

  /**
   * Register a cleanup function
   */
  register(id: string, cleanup: () => void): void {
    this.resources.set(id, cleanup);
  }

  /**
   * Register a blob URL for cleanup
   */
  registerBlobUrl(url: string): void {
    this.blobUrls.add(url);
  }

  /**
   * Register an interval for cleanup
   */
  registerInterval(interval: NodeJS.Timeout): void {
    this.intervals.add(interval);
  }

  /**
   * Register a timeout for cleanup
   */
  registerTimeout(timeout: NodeJS.Timeout): void {
    this.timeouts.add(timeout);
  }

  /**
   * Clean up a specific resource
   */
  cleanup(id: string): void {
    const cleanup = this.resources.get(id);
    if (cleanup) {
      try {
        cleanup();
        this.resources.delete(id);
      } catch (error) {
        console.error(`❌ Error cleaning up resource ${id}:`, error);
      }
    }
  }

  /**
   * Clean up all resources
   */
  cleanupAll(): void {
    // Clean up registered resources
    for (const [id, cleanup] of this.resources) {
      try {
        cleanup();
      } catch (error) {
        console.error(`❌ Error cleaning up resource ${id}:`, error);
      }
    }
    this.resources.clear();

    // Clean up blob URLs
    for (const url of this.blobUrls) {
      try {
        URL.revokeObjectURL(url);
      } catch (error) {
        console.error(`❌ Error revoking blob URL:`, error);
      }
    }
    this.blobUrls.clear();

    // Clean up intervals
    for (const interval of this.intervals) {
      clearInterval(interval);
    }
    this.intervals.clear();

    // Clean up timeouts
    for (const timeout of this.timeouts) {
      clearTimeout(timeout);
    }
    this.timeouts.clear();

    console.log('🧹 All resources cleaned up');
  }

  /**
   * Get registry statistics
   */
  getStats(): {
    resourceCount: number;
    blobUrlCount: number;
    intervalCount: number;
    timeoutCount: number;
  } {
    return {
      resourceCount: this.resources.size,
      blobUrlCount: this.blobUrls.size,
      intervalCount: this.intervals.size,
      timeoutCount: this.timeouts.size,
    };
  }
}

/**
 * Global resource cleanup registry
 */
export const resourceCleanup = new ResourceCleanupRegistry();

/**
 * Memory monitoring class
 */
export class MemoryMonitor {
  private static instance: MemoryMonitor | null = null;
  private isMonitoring = false;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private callbacks: Array<(stats: MemoryStats) => void> = [];
  private lastStats: MemoryStats | null = null;

  private constructor() {}

  /**
   * Get singleton instance
   */
  static getInstance(): MemoryMonitor {
    if (!MemoryMonitor.instance) {
      MemoryMonitor.instance = new MemoryMonitor();
    }
    return MemoryMonitor.instance;
  }

  /**
   * Start memory monitoring
   */
  startMonitoring(intervalMs: number = 5000): void {
    if (this.isMonitoring) return;

    this.isMonitoring = true;
    this.monitoringInterval = setInterval(() => {
      const stats = this.getCurrentMemoryStats();
      this.lastStats = stats;

      // Notify callbacks
      this.callbacks.forEach(callback => {
        try {
          callback(stats);
        } catch (error) {
          console.error('❌ Memory monitor callback error:', error);
        }
      });

      // Automatic cleanup if memory usage is high
      if (stats.isHighUsage) {
        console.warn('⚠️ High memory usage detected, triggering cleanup');
        this.triggerMemoryCleanup();
      }

      if (stats.isCriticalUsage) {
        console.error('🚨 Critical memory usage detected!');
        this.triggerEmergencyCleanup();
      }
    }, intervalMs);

    resourceCleanup.registerInterval(this.monitoringInterval);
    console.log('📊 Memory monitoring started');
  }

  /**
   * Stop memory monitoring
   */
  stopMonitoring(): void {
    if (!this.isMonitoring) return;

    this.isMonitoring = false;
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    console.log('📊 Memory monitoring stopped');
  }

  /**
   * Get current memory statistics
   */
  getCurrentMemoryStats(): MemoryStats {
    if (typeof window === 'undefined' || !('performance' in window) || !(performance as any).memory) {
      return {
        usedJSHeapSize: 0,
        totalJSHeapSize: 0,
        jsHeapSizeLimit: 0,
        usagePercentage: 0,
        isHighUsage: false,
        isCriticalUsage: false,
      };
    }

    const memory = (performance as any).memory;
    const usagePercentage = (memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100;

    return {
      usedJSHeapSize: memory.usedJSHeapSize,
      totalJSHeapSize: memory.totalJSHeapSize,
      jsHeapSizeLimit: memory.jsHeapSizeLimit,
      usagePercentage,
      isHighUsage: usagePercentage > 70, // 70% threshold
      isCriticalUsage: usagePercentage > 90, // 90% threshold
    };
  }

  /**
   * Get last recorded memory stats
   */
  getLastStats(): MemoryStats | null {
    return this.lastStats;
  }

  /**
   * Subscribe to memory updates
   */
  subscribe(callback: (stats: MemoryStats) => void): () => void {
    this.callbacks.push(callback);
    return () => {
      const index = this.callbacks.indexOf(callback);
      if (index > -1) {
        this.callbacks.splice(index, 1);
      }
    };
  }

  /**
   * Trigger memory cleanup
   */
  private triggerMemoryCleanup(): void {
    // Force garbage collection if available
    if ('gc' in window && typeof (window as any).gc === 'function') {
      try {
        (window as any).gc();
      } catch (error) {
        // Ignore errors - gc() might not be available
      }
    }

    // Clean up registered resources
    resourceCleanup.cleanupAll();
  }

  /**
   * Trigger emergency cleanup
   */
  private triggerEmergencyCleanup(): void {
    this.triggerMemoryCleanup();

    // Additional emergency measures
    // Clear any large caches or temporary data
    this.clearImageCaches();
    this.clearBlobUrls();
  }

  /**
   * Clear image caches
   */
  private clearImageCaches(): void {
    // Clear any cached images or canvases
    const images = document.querySelectorAll('img[src^="blob:"]');
    images.forEach(img => {
      if (img instanceof HTMLImageElement && img.src.startsWith('blob:')) {
        URL.revokeObjectURL(img.src);
        img.src = '';
      }
    });

    // Clear any canvas elements that might be holding large amounts of data
    const canvases = document.querySelectorAll('canvas');
    canvases.forEach(canvas => {
      if (canvas instanceof HTMLCanvasElement) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
      }
    });
  }

  /**
   * Clear blob URLs
   */
  private clearBlobUrls(): void {
    resourceCleanup.cleanupAll();
  }
}

/**
 * Performance optimization utilities
 */
export class PerformanceOptimizer {
  /**
   * Detect device capabilities
   */
  static getDeviceCapabilities(): PerformanceMetrics {
    const memoryStats = MemoryMonitor.getInstance().getCurrentMemoryStats();

    return {
      memoryUsage: memoryStats,
      frameRate: this.getFrameRate(),
      networkType: this.getNetworkType(),
      isLowEndDevice: this.isLowEndDevice(),
      batteryLevel: this.getBatteryLevel(),
      isCharging: this.isCharging(),
    };
  }

  /**
   * Estimate frame rate
   */
  private static getFrameRate(): number {
    // Simple frame rate estimation
    if (typeof window === 'undefined') return 60;

    let frameCount = 0;
    let lastTime = performance.now();

    const measureFrameRate = () => {
      frameCount++;
      const currentTime = performance.now();
      if (currentTime - lastTime >= 1000) {
        const fps = frameCount;
        frameCount = 0;
        lastTime = currentTime;
        return fps;
      }
      requestAnimationFrame(measureFrameRate);
      return 60; // Default assumption
    };

    return measureFrameRate();
  }

  /**
   * Get network type
   */
  private static getNetworkType(): string {
    if (typeof navigator === 'undefined' || !('connection' in navigator)) {
      return 'unknown';
    }

    const connection = (navigator as any).connection;
    return connection?.effectiveType || connection?.type || 'unknown';
  }

  /**
   * Detect low-end device
   */
  private static isLowEndDevice(): boolean {
    if (typeof navigator === 'undefined') return false;

    // Check device memory
    if ('deviceMemory' in navigator) {
      return (navigator as any).deviceMemory < 4; // Less than 4GB RAM
    }

    // Check hardware concurrency
    if ('hardwareConcurrency' in navigator) {
      return navigator.hardwareConcurrency < 4; // Less than 4 cores
    }

    // Fallback to user agent detection
    const userAgent = (navigator as any).userAgent?.toLowerCase() || '';
    const lowEndKeywords = ['mobile', 'android', 'webos', 'iphone', 'ipad', 'ipod'];
    return lowEndKeywords.some(keyword => userAgent.includes(keyword));
  }

  /**
   * Get battery level
   */
  private static getBatteryLevel(): number | undefined {
    if (typeof navigator === 'undefined' || !('getBattery' in navigator)) {
      return undefined;
    }

    // Note: Battery API is deprecated and may not be available
    try {
      (navigator as any).getBattery().then((battery: any) => {
        return battery.level * 100;
      });
    } catch (error) {
      return undefined;
    }

    return undefined;
  }

  /**
   * Check if device is charging
   */
  private static isCharging(): boolean | undefined {
    if (typeof navigator === 'undefined' || !('getBattery' in navigator)) {
      return undefined;
    }

    try {
      (navigator as any).getBattery().then((battery: any) => {
        return battery.charging;
      });
    } catch (error) {
      return undefined;
    }

    return undefined;
  }

  /**
   * Optimize image processing based on device capabilities
   */
  static getOptimalImageSettings(deviceCapabilities: PerformanceMetrics): {
    maxWidth: number;
    maxHeight: number;
    quality: number;
    useWebWorker: boolean;
    chunkSize: number;
  } {
    const { isLowEndDevice, memoryUsage, networkType } = deviceCapabilities;

    if (isLowEndDevice || memoryUsage.isHighUsage) {
      return {
        maxWidth: 1280,
        maxHeight: 720,
        quality: 0.7,
        useWebWorker: false,
        chunkSize: 64 * 1024, // 64KB chunks
      };
    }

    if (networkType === 'slow-2g' || networkType === '2g') {
      return {
        maxWidth: 1600,
        maxHeight: 900,
        quality: 0.75,
        useWebWorker: true,
        chunkSize: 128 * 1024, // 128KB chunks
      };
    }

    return {
      maxWidth: 1920,
      maxHeight: 1080,
      quality: 0.85,
      useWebWorker: true,
      chunkSize: 256 * 1024, // 256KB chunks
    };
  }
}

/**
 * Utility functions for memory management
 */

/**
 * Create a managed blob URL that will be automatically cleaned up
 */
export function createManagedBlobUrl(blob: Blob, id?: string): string {
  const url = URL.createObjectURL(blob);
  resourceCleanup.registerBlobUrl(url);

  if (id) {
    resourceCleanup.register(`blob-${id}`, () => {
      URL.revokeObjectURL(url);
    });
  }

  return url;
}

/**
 * Process large images in chunks to prevent memory overflow
 */
export async function processImageInChunks<T>(
  imageData: ImageData,
  chunkSize: number,
  processor: (chunk: ImageData, offset: number) => Promise<T>
): Promise<T[]> {
  const results: T[] = [];
  const totalPixels = imageData.width * imageData.height;
  const pixelsPerChunk = Math.floor(chunkSize / 4); // 4 bytes per pixel (RGBA)

  for (let offset = 0; offset < totalPixels; offset += pixelsPerChunk) {
    const endOffset = Math.min(offset + pixelsPerChunk, totalPixels);
    const chunkLength = (endOffset - offset) * 4;

    // Create chunk ImageData
    const chunkData = new ImageData(
      new Uint8ClampedArray(imageData.data.buffer, offset * 4, chunkLength),
      Math.min(pixelsPerChunk, imageData.width),
      Math.ceil(chunkLength / 4 / Math.min(pixelsPerChunk, imageData.width))
    );

    const result = await processor(chunkData, offset);
    results.push(result);

    // Yield control to prevent blocking the main thread
    await new Promise(resolve => setTimeout(resolve, 0));
  }

  return results;
}

/**
 * Monitor component memory usage
 */
export function useMemoryMonitor() {
  if (typeof window === 'undefined') {
    return {
      stats: null,
      startMonitoring: () => {},
      stopMonitoring: () => {},
    };
  }

  const monitor = MemoryMonitor.getInstance();

  return {
    stats: monitor.getLastStats(),
    startMonitoring: (interval?: number) => monitor.startMonitoring(interval),
    stopMonitoring: () => monitor.stopMonitoring(),
  };
}

/**
 * Global cleanup function for emergencies
 */
export function emergencyCleanup(): void {
  console.warn('🚨 Emergency memory cleanup triggered');

  const monitor = MemoryMonitor.getInstance();
  monitor.getCurrentMemoryStats(); // This will trigger cleanup if needed

  resourceCleanup.cleanupAll();

  // Force garbage collection if available
  if (typeof window !== 'undefined' && 'gc' in window && typeof (window as any).gc === 'function') {
    try {
      (window as any).gc();
    } catch (error) {
      // Ignore errors
    }
  }
}

/**
 * Initialize memory management system
 */
export function initializeMemoryManagement(): void {
  const monitor = MemoryMonitor.getInstance();
  monitor.startMonitoring(10000); // Monitor every 10 seconds

  // Set up cleanup on page unload
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => {
      resourceCleanup.cleanupAll();
      monitor.stopMonitoring();
    });

    // Set up cleanup on visibility change (mobile backgrounding)
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        // App is being backgrounded, clean up non-essential resources
        resourceCleanup.cleanupAll();
      }
    });
  }

  console.log('🧠 Memory management system initialized');
}