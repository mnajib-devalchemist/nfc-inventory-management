/**
 * Worker Thread Pool Manager
 *
 * Manages a pool of worker threads for CPU-intensive operations with memory
 * limits, timeout protection, and automatic recovery from worker failures.
 *
 * @category Worker Thread Management
 * @since 1.7.0
 */

import { Worker } from 'worker_threads';
import { EventEmitter } from 'events';
import { join } from 'path';
import { cpus } from 'os';

/**
 * Worker task interface
 */
interface WorkerTask<T = any> {
  id: string;
  method: string;
  args: any[];
  resolve: (result: T) => void;
  reject: (error: Error) => void;
  timeout?: number;
  createdAt: number;
}

/**
 * Worker instance information
 */
interface WorkerInfo {
  worker: Worker;
  id: string;
  busy: boolean;
  currentTask?: WorkerTask;
  tasksCompleted: number;
  createdAt: number;
  lastUsed: number;
  memoryUsage?: NodeJS.MemoryUsage;
  restartCount: number;
}

/**
 * Worker pool options
 */
interface WorkerPoolOptions {
  /** Maximum number of workers */
  maxWorkers?: number;
  /** Minimum number of workers to keep alive */
  minWorkers?: number;
  /** Default task timeout in milliseconds */
  defaultTimeout?: number;
  /** Memory limit per worker in bytes */
  memoryLimitBytes?: number;
  /** Maximum tasks per worker before restart */
  maxTasksPerWorker?: number;
  /** Worker idle timeout before termination */
  workerIdleTimeoutMs?: number;
  /** Enable worker monitoring */
  enableMonitoring?: boolean;
}

/**
 * Worker pool statistics
 */
interface PoolStats {
  totalWorkers: number;
  busyWorkers: number;
  idleWorkers: number;
  queuedTasks: number;
  completedTasks: number;
  failedTasks: number;
  totalRestarts: number;
  avgTaskDurationMs: number;
  memoryUsage: {
    total: number;
    average: number;
    max: number;
  };
}

/**
 * Worker Thread Pool implementation with comprehensive management
 */
export class WorkerPool extends EventEmitter {
  private workers = new Map<string, WorkerInfo>();
  private taskQueue: WorkerTask[] = [];
  private taskHistory: Array<{ duration: number; completedAt: number }> = [];
  private completedTasks = 0;
  private failedTasks = 0;
  private nextTaskId = 1;
  private nextWorkerId = 1;
  private workerScript: string;
  private options: Required<WorkerPoolOptions>;
  private monitoringInterval?: NodeJS.Timeout;
  private cleanupInterval?: NodeJS.Timeout;

  constructor(workerScript: string, options: WorkerPoolOptions = {}) {
    super();

    this.workerScript = workerScript;
    this.options = {
      maxWorkers: options.maxWorkers ?? Math.min(cpus().length, 4),
      minWorkers: options.minWorkers ?? 1,
      defaultTimeout: options.defaultTimeout ?? 30000, // 30 seconds
      memoryLimitBytes: options.memoryLimitBytes ?? 512 * 1024 * 1024, // 512MB
      maxTasksPerWorker: options.maxTasksPerWorker ?? 100,
      workerIdleTimeoutMs: options.workerIdleTimeoutMs ?? 300000, // 5 minutes
      enableMonitoring: options.enableMonitoring ?? true,
    };

    // Initialize minimum workers
    this.initializePool();

    // Start monitoring if enabled
    if (this.options.enableMonitoring) {
      this.startMonitoring();
    }

    // Start cleanup interval
    this.startCleanupInterval();
  }

  /**
   * Execute a task in the worker pool
   *
   * @param method - Worker method to call
   * @param args - Arguments to pass to the method
   * @param timeout - Task timeout override
   * @returns Promise resolving to task result
   *
   * @example Execute image processing task
   * ```typescript
   * const result = await pool.exec('processAdaptive', [buffer, options], 45000);
   * ```
   */
  async exec<T = any>(method: string, args: any[] = [], timeout?: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const task: WorkerTask<T> = {
        id: `task-${this.nextTaskId++}`,
        method,
        args,
        resolve,
        reject,
        timeout: timeout ?? this.options.defaultTimeout,
        createdAt: Date.now(),
      };

      this.taskQueue.push(task);
      this.processQueue();

      // Set task timeout
      const timeoutHandle = setTimeout(() => {
        this.handleTaskTimeout(task);
      }, task.timeout);

      // Clear timeout when task completes
      const originalResolve = resolve;
      const originalReject = reject;

      task.resolve = (result: T) => {
        clearTimeout(timeoutHandle);
        originalResolve(result);
      };

      task.reject = (error: Error) => {
        clearTimeout(timeoutHandle);
        originalReject(error);
      };
    });
  }

  /**
   * Get current pool statistics
   */
  getStats(): PoolStats {
    const workers = Array.from(this.workers.values());
    const memoryUsages = workers
      .map(w => w.memoryUsage?.rss || 0)
      .filter(usage => usage > 0);

    const avgDuration = this.taskHistory.length > 0
      ? this.taskHistory.reduce((sum, task) => sum + task.duration, 0) / this.taskHistory.length
      : 0;

    return {
      totalWorkers: workers.length,
      busyWorkers: workers.filter(w => w.busy).length,
      idleWorkers: workers.filter(w => !w.busy).length,
      queuedTasks: this.taskQueue.length,
      completedTasks: this.completedTasks,
      failedTasks: this.failedTasks,
      totalRestarts: workers.reduce((sum, w) => sum + w.restartCount, 0),
      avgTaskDurationMs: Math.round(avgDuration),
      memoryUsage: {
        total: memoryUsages.reduce((sum, usage) => sum + usage, 0),
        average: memoryUsages.length > 0 ? Math.round(memoryUsages.reduce((sum, usage) => sum + usage, 0) / memoryUsages.length) : 0,
        max: memoryUsages.length > 0 ? Math.max(...memoryUsages) : 0,
      },
    };
  }

  /**
   * Terminate all workers and clean up
   */
  async terminate(): Promise<void> {
    // Clear intervals
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    // Reject all queued tasks
    for (const task of this.taskQueue) {
      task.reject(new Error('Worker pool terminated'));
    }
    this.taskQueue = [];

    // Terminate all workers
    const terminationPromises = Array.from(this.workers.values()).map(async (workerInfo) => {
      try {
        await workerInfo.worker.terminate();
      } catch (error) {
        console.warn(`Error terminating worker ${workerInfo.id}:`, error);
      }
    });

    await Promise.all(terminationPromises);
    this.workers.clear();

    this.emit('terminated');
  }

  /**
   * Initialize the worker pool with minimum workers
   */
  private initializePool(): void {
    for (let i = 0; i < this.options.minWorkers; i++) {
      this.createWorker();
    }
  }

  /**
   * Create a new worker
   */
  private createWorker(): WorkerInfo {
    const workerId = `worker-${this.nextWorkerId++}`;

    const worker = new Worker(this.workerScript, {
      resourceLimits: {
        maxOldGenerationSizeMb: Math.floor(this.options.memoryLimitBytes / (1024 * 1024)),
        maxYoungGenerationSizeMb: Math.floor(this.options.memoryLimitBytes / (1024 * 1024) / 4),
      },
    });

    const workerInfo: WorkerInfo = {
      worker,
      id: workerId,
      busy: false,
      tasksCompleted: 0,
      createdAt: Date.now(),
      lastUsed: Date.now(),
      restartCount: 0,
    };

    // Set up worker event handlers
    worker.on('message', (message) => this.handleWorkerMessage(workerInfo, message));
    worker.on('error', (error) => this.handleWorkerError(workerInfo, error));
    worker.on('exit', (code) => this.handleWorkerExit(workerInfo, code));

    this.workers.set(workerId, workerInfo);
    this.emit('workerCreated', { workerId, totalWorkers: this.workers.size });

    return workerInfo;
  }

  /**
   * Process the task queue
   */
  private processQueue(): void {
    if (this.taskQueue.length === 0) return;

    // Find available worker
    const availableWorker = Array.from(this.workers.values()).find(w => !w.busy);

    if (availableWorker) {
      const task = this.taskQueue.shift()!;
      this.assignTaskToWorker(availableWorker, task);
    } else if (this.workers.size < this.options.maxWorkers) {
      // Create new worker if below maximum
      const newWorker = this.createWorker();
      // Wait a moment for worker to be ready, then retry
      setTimeout(() => this.processQueue(), 100);
    }
  }

  /**
   * Assign a task to a worker
   */
  private assignTaskToWorker(workerInfo: WorkerInfo, task: WorkerTask): void {
    workerInfo.busy = true;
    workerInfo.currentTask = task;
    workerInfo.lastUsed = Date.now();

    // Send task to worker
    workerInfo.worker.postMessage({
      id: task.id,
      method: task.method,
      args: task.args,
    });

    this.emit('taskStarted', {
      taskId: task.id,
      workerId: workerInfo.id,
      method: task.method,
    });
  }

  /**
   * Handle message from worker
   */
  private handleWorkerMessage(workerInfo: WorkerInfo, message: any): void {
    const { id, result, error } = message;

    // Handle worker ready message
    if (id === 'worker-ready') {
      this.emit('workerReady', { workerId: workerInfo.id });
      this.processQueue();
      return;
    }

    // Handle worker error message
    if (id === 'worker-error') {
      this.emit('workerError', {
        workerId: workerInfo.id,
        error: error || 'Unknown worker error',
      });
      return;
    }

    const task = workerInfo.currentTask;
    if (!task || task.id !== id) {
      console.warn(`Received message for unknown task ${id} from worker ${workerInfo.id}`);
      return;
    }

    // Complete the task
    workerInfo.busy = false;
    workerInfo.currentTask = undefined;
    workerInfo.tasksCompleted++;

    const duration = Date.now() - task.createdAt;
    this.taskHistory.push({ duration, completedAt: Date.now() });

    // Keep only recent task history for memory efficiency
    if (this.taskHistory.length > 1000) {
      this.taskHistory = this.taskHistory.slice(-500);
    }

    if (error) {
      this.failedTasks++;
      const taskError = new Error(error.message || 'Worker task failed');
      taskError.stack = error.stack;
      task.reject(taskError);

      this.emit('taskFailed', {
        taskId: task.id,
        workerId: workerInfo.id,
        error: taskError,
        duration,
      });
    } else {
      this.completedTasks++;
      task.resolve(result);

      this.emit('taskCompleted', {
        taskId: task.id,
        workerId: workerInfo.id,
        duration,
      });
    }

    // Check if worker needs restart due to task limit
    if (workerInfo.tasksCompleted >= this.options.maxTasksPerWorker) {
      this.restartWorker(workerInfo);
    } else {
      // Process next task if available
      this.processQueue();
    }
  }

  /**
   * Handle worker error
   */
  private handleWorkerError(workerInfo: WorkerInfo, error: Error): void {
    console.error(`Worker ${workerInfo.id} error:`, error);

    if (workerInfo.currentTask) {
      this.failedTasks++;
      workerInfo.currentTask.reject(new Error(`Worker error: ${error.message}`));
    }

    this.emit('workerError', {
      workerId: workerInfo.id,
      error,
    });

    // Restart the worker
    this.restartWorker(workerInfo);
  }

  /**
   * Handle worker exit
   */
  private handleWorkerExit(workerInfo: WorkerInfo, code: number): void {
    console.warn(`Worker ${workerInfo.id} exited with code ${code}`);

    if (workerInfo.currentTask) {
      this.failedTasks++;
      workerInfo.currentTask.reject(new Error(`Worker exited with code ${code}`));
    }

    this.workers.delete(workerInfo.id);

    this.emit('workerExited', {
      workerId: workerInfo.id,
      exitCode: code,
    });

    // Create replacement worker if below minimum
    if (this.workers.size < this.options.minWorkers) {
      this.createWorker();
    }
  }

  /**
   * Restart a worker
   */
  private async restartWorker(workerInfo: WorkerInfo): Promise<void> {
    console.log(`Restarting worker ${workerInfo.id}`);

    try {
      await workerInfo.worker.terminate();
    } catch (error) {
      console.warn(`Error terminating worker ${workerInfo.id}:`, error);
    }

    this.workers.delete(workerInfo.id);
    workerInfo.restartCount++;

    // Create replacement worker
    const newWorker = this.createWorker();
    newWorker.restartCount = workerInfo.restartCount;

    this.emit('workerRestarted', {
      oldWorkerId: workerInfo.id,
      newWorkerId: newWorker.id,
      restartCount: newWorker.restartCount,
    });
  }

  /**
   * Handle task timeout
   */
  private handleTaskTimeout(task: WorkerTask): void {
    console.warn(`Task ${task.id} timed out after ${task.timeout}ms`);

    // Find worker handling this task
    const workerInfo = Array.from(this.workers.values()).find(w => w.currentTask?.id === task.id);

    if (workerInfo) {
      // Restart worker due to timeout
      this.restartWorker(workerInfo);
    }

    this.failedTasks++;
    task.reject(new Error(`Task timeout after ${task.timeout}ms`));

    this.emit('taskTimeout', {
      taskId: task.id,
      workerId: workerInfo?.id,
      timeout: task.timeout,
    });
  }

  /**
   * Start monitoring worker health and performance
   */
  private startMonitoring(): void {
    this.monitoringInterval = setInterval(() => {
      const workers = Array.from(this.workers.values());

      for (const workerInfo of workers) {
        // Check memory usage (if available in Node.js version)
        try {
          // Memory monitoring would require additional setup in the worker
          // For now, we'll monitor basic metrics
          const now = Date.now();
          const idleTime = now - workerInfo.lastUsed;

          // Warn about long-running tasks
          if (workerInfo.busy && workerInfo.currentTask) {
            const taskRunTime = now - workerInfo.currentTask.createdAt;
            if (taskRunTime > workerInfo.currentTask.timeout! * 0.8) {
              this.emit('taskWarning', {
                taskId: workerInfo.currentTask.id,
                workerId: workerInfo.id,
                runTime: taskRunTime,
                timeout: workerInfo.currentTask.timeout,
              });
            }
          }

          // Check for idle workers that should be terminated
          if (!workerInfo.busy && idleTime > this.options.workerIdleTimeoutMs && workers.length > this.options.minWorkers) {
            console.log(`Terminating idle worker ${workerInfo.id} (idle for ${idleTime}ms)`);
            this.terminateWorker(workerInfo);
          }
        } catch (error) {
          console.warn(`Error monitoring worker ${workerInfo.id}:`, error);
        }
      }

      // Emit pool statistics
      this.emit('statsUpdate', this.getStats());
    }, 10000); // Monitor every 10 seconds
  }

  /**
   * Start cleanup interval
   */
  private startCleanupInterval(): void {
    this.cleanupInterval = setInterval(() => {
      // Clean up old task history
      const cutoff = Date.now() - 600000; // 10 minutes
      this.taskHistory = this.taskHistory.filter(task => task.completedAt > cutoff);
    }, 60000); // Cleanup every minute
  }

  /**
   * Terminate a specific worker
   */
  private async terminateWorker(workerInfo: WorkerInfo): Promise<void> {
    try {
      await workerInfo.worker.terminate();
    } catch (error) {
      console.warn(`Error terminating worker ${workerInfo.id}:`, error);
    }

    this.workers.delete(workerInfo.id);

    this.emit('workerTerminated', {
      workerId: workerInfo.id,
      reason: 'idle_timeout',
    });
  }
}