/**
 * Upload State Machine and Retry Logic Tests
 * Tests the upload state management with retry mechanisms
 */

import { jest } from '@jest/globals';

// Mock upload states
enum UploadState {
  IDLE = 'idle',
  VALIDATING = 'validating',
  UPLOADING = 'uploading',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  RETRYING = 'retrying',
  CANCELLED = 'cancelled'
}

// Mock upload state machine
class MockUploadStateMachine {
  private state: UploadState = UploadState.IDLE;
  private retryCount: number = 0;
  private maxRetries: number = 3;
  private backoffMultiplier: number = 2;
  private baseDelay: number = 1000;

  private stateHistory: UploadState[] = [];
  private onStateChange?: (state: UploadState) => void;

  constructor(options?: { maxRetries?: number; baseDelay?: number }) {
    this.maxRetries = options?.maxRetries ?? 3;
    this.baseDelay = options?.baseDelay ?? 1000;
  }

  getCurrentState(): UploadState {
    return this.state;
  }

  getRetryCount(): number {
    return this.retryCount;
  }

  getStateHistory(): UploadState[] {
    return [...this.stateHistory];
  }

  onStateChangeCallback(callback: (state: UploadState) => void): void {
    this.onStateChange = callback;
  }

  private setState(newState: UploadState): void {
    this.stateHistory.push(this.state);
    this.state = newState;
    this.onStateChange?.(newState);
  }

  async startUpload(file: File): Promise<void> {
    if (this.state !== UploadState.IDLE) {
      throw new Error(`Cannot start upload from state: ${this.state}`);
    }

    this.setState(UploadState.VALIDATING);

    // Validate file
    if (!this.validateFile(file)) {
      this.setState(UploadState.FAILED);
      throw new Error('File validation failed');
    }

    this.setState(UploadState.UPLOADING);

    try {
      await this.performUpload(file);
      this.setState(UploadState.PROCESSING);
      await this.processUpload();
      this.setState(UploadState.COMPLETED);
    } catch (error) {
      await this.handleUploadError(error as Error);
    }
  }

  async retry(): Promise<void> {
    if (this.state !== UploadState.FAILED && this.state !== UploadState.RETRYING) {
      throw new Error(`Cannot retry from state: ${this.state}`);
    }

    if (this.retryCount >= this.maxRetries) {
      throw new Error('Maximum retry attempts exceeded');
    }

    this.retryCount++;
    this.setState(UploadState.RETRYING);

    // Exponential backoff
    const delay = this.baseDelay * Math.pow(this.backoffMultiplier, this.retryCount - 1);
    await new Promise(resolve => setTimeout(resolve, delay));

    this.setState(UploadState.UPLOADING);

    try {
      await this.performUpload();
      this.setState(UploadState.PROCESSING);
      await this.processUpload();
      this.setState(UploadState.COMPLETED);
      this.retryCount = 0; // Reset on success
    } catch (error) {
      await this.handleUploadError(error as Error);
    }
  }

  cancel(): void {
    if (this.state === UploadState.COMPLETED || this.state === UploadState.CANCELLED) {
      return; // Cannot cancel completed or already cancelled uploads
    }

    this.setState(UploadState.CANCELLED);
  }

  reset(): void {
    this.state = UploadState.IDLE;
    this.retryCount = 0;
    this.stateHistory = [];
  }

  private validateFile(file: File): boolean {
    // Mock validation logic
    if (!file || file.size === 0) return false;
    if (file.size > 10 * 1024 * 1024) return false; // 10MB limit
    return true;
  }

  private async performUpload(file?: File): Promise<void> {
    // Mock upload implementation
    return new Promise((resolve, reject) => {
      // Simulate network delay
      setTimeout(() => {
        // Mock various failure scenarios for testing
        if (file?.name.includes('network-error')) {
          reject(new Error('Network connection failed'));
        } else if (file?.name.includes('server-error')) {
          reject(new Error('Server internal error'));
        } else if (file?.name.includes('timeout')) {
          reject(new Error('Request timeout'));
        } else {
          resolve();
        }
      }, 100);
    });
  }

  private async processUpload(): Promise<void> {
    // Mock processing delay
    return new Promise((resolve) => {
      setTimeout(resolve, 50);
    });
  }

  private async handleUploadError(error: Error): Promise<void> {
    if (this.retryCount < this.maxRetries && this.isRetryableError(error)) {
      this.setState(UploadState.FAILED);
      // Auto-retry logic could be implemented here
    } else {
      this.setState(UploadState.FAILED);
    }
  }

  private isRetryableError(error: Error): boolean {
    const retryableErrors = ['Network connection failed', 'Request timeout', 'Server internal error'];
    return retryableErrors.some(msg => error.message.includes(msg));
  }
}

describe('Upload State Machine Tests', () => {
  let stateMachine: MockUploadStateMachine;
  let stateChanges: UploadState[];

  beforeEach(() => {
    stateMachine = new MockUploadStateMachine();
    stateChanges = [];

    stateMachine.onStateChangeCallback((state) => {
      stateChanges.push(state);
    });
  });

  describe('State Transitions', () => {
    test('should follow correct state flow for successful upload', async () => {
      const file = new File(['test data'], 'test.jpg', { type: 'image/jpeg' });

      await stateMachine.startUpload(file);

      expect(stateMachine.getCurrentState()).toBe(UploadState.COMPLETED);
      expect(stateChanges).toEqual([
        UploadState.VALIDATING,
        UploadState.UPLOADING,
        UploadState.PROCESSING,
        UploadState.COMPLETED
      ]);
    });

    test('should handle validation failure', async () => {
      const invalidFile = new File([], '', { type: '' }); // Empty file

      await expect(stateMachine.startUpload(invalidFile)).rejects.toThrow('File validation failed');

      expect(stateMachine.getCurrentState()).toBe(UploadState.FAILED);
      expect(stateChanges).toEqual([
        UploadState.VALIDATING,
        UploadState.FAILED
      ]);
    });

    test('should handle upload failure', async () => {
      const file = new File(['test data'], 'network-error.jpg', { type: 'image/jpeg' });

      await stateMachine.startUpload(file);

      expect(stateMachine.getCurrentState()).toBe(UploadState.FAILED);
      expect(stateChanges).toEqual([
        UploadState.VALIDATING,
        UploadState.UPLOADING,
        UploadState.FAILED
      ]);
    });

    test('should prevent invalid state transitions', async () => {
      const file = new File(['test data'], 'test.jpg', { type: 'image/jpeg' });

      // Start first upload
      const uploadPromise = stateMachine.startUpload(file);

      // Try to start another upload while first is in progress
      await expect(stateMachine.startUpload(file)).rejects.toThrow('Cannot start upload from state');

      await uploadPromise;
    });
  });

  describe('Retry Logic', () => {
    test('should retry failed uploads with exponential backoff', async () => {
      const stateMachineWithRetry = new MockUploadStateMachine({ baseDelay: 100 });
      const retryStateChanges: UploadState[] = [];

      stateMachineWithRetry.onStateChangeCallback((state) => {
        retryStateChanges.push(state);
      });

      const file = new File(['test data'], 'network-error.jpg', { type: 'image/jpeg' });

      // Initial upload fails
      await stateMachineWithRetry.startUpload(file);
      expect(stateMachineWithRetry.getCurrentState()).toBe(UploadState.FAILED);

      const startTime = Date.now();

      // First retry
      await stateMachineWithRetry.retry();
      const firstRetryTime = Date.now() - startTime;

      expect(stateMachineWithRetry.getCurrentState()).toBe(UploadState.FAILED);
      expect(stateMachineWithRetry.getRetryCount()).toBe(1);
      expect(firstRetryTime).toBeGreaterThanOrEqual(100); // Base delay

      // Second retry
      const secondRetryStart = Date.now();
      await stateMachineWithRetry.retry();
      const secondRetryTime = Date.now() - secondRetryStart;

      expect(stateMachineWithRetry.getRetryCount()).toBe(2);
      expect(secondRetryTime).toBeGreaterThanOrEqual(200); // 100 * 2^1
    });

    test('should succeed after retries', async () => {
      const file = new File(['test data'], 'test.jpg', { type: 'image/jpeg' });

      // Mock a file that fails initially but succeeds on retry
      const originalPerformUpload = (stateMachine as any).performUpload;
      let uploadAttempts = 0;

      (stateMachine as any).performUpload = jest.fn().mockImplementation(() => {
        uploadAttempts++;
        if (uploadAttempts === 1) {
          return Promise.reject(new Error('Network connection failed'));
        }
        return Promise.resolve();
      });

      // Initial upload fails
      await stateMachine.startUpload(file);
      expect(stateMachine.getCurrentState()).toBe(UploadState.FAILED);

      // Retry succeeds
      await stateMachine.retry();
      expect(stateMachine.getCurrentState()).toBe(UploadState.COMPLETED);
      expect(stateMachine.getRetryCount()).toBe(0); // Reset after success
    });

    test('should respect maximum retry limit', async () => {
      const stateMachineWithLimitedRetries = new MockUploadStateMachine({ maxRetries: 2 });
      const file = new File(['test data'], 'network-error.jpg', { type: 'image/jpeg' });

      // Initial upload fails
      await stateMachineWithLimitedRetries.startUpload(file);

      // First retry
      await stateMachineWithLimitedRetries.retry();
      expect(stateMachineWithLimitedRetries.getRetryCount()).toBe(1);

      // Second retry
      await stateMachineWithLimitedRetries.retry();
      expect(stateMachineWithLimitedRetries.getRetryCount()).toBe(2);

      // Third retry should fail
      await expect(stateMachineWithLimitedRetries.retry()).rejects.toThrow('Maximum retry attempts exceeded');
    });

    test('should not retry non-retryable errors', async () => {
      const file = new File(['test data'], 'validation-error.jpg', { type: 'image/jpeg' });

      // Mock a non-retryable error
      (stateMachine as any).performUpload = jest.fn().mockRejectedValue(new Error('File format not supported'));
      (stateMachine as any).isRetryableError = jest.fn().mockReturnValue(false);

      await stateMachine.startUpload(file);
      expect(stateMachine.getCurrentState()).toBe(UploadState.FAILED);

      // Should not be able to retry
      await expect(stateMachine.retry()).rejects.toThrow('Cannot retry from state');
    });
  });

  describe('Cancellation', () => {
    test('should cancel upload in progress', async () => {
      const file = new File(['test data'], 'test.jpg', { type: 'image/jpeg' });

      // Start upload and cancel immediately
      const uploadPromise = stateMachine.startUpload(file);
      stateMachine.cancel();

      expect(stateMachine.getCurrentState()).toBe(UploadState.CANCELLED);

      // Upload promise should still resolve/reject, but state remains cancelled
      await uploadPromise.catch(() => {}); // Ignore the result
      expect(stateMachine.getCurrentState()).toBe(UploadState.CANCELLED);
    });

    test('should not cancel completed uploads', async () => {
      const file = new File(['test data'], 'test.jpg', { type: 'image/jpeg' });

      await stateMachine.startUpload(file);
      expect(stateMachine.getCurrentState()).toBe(UploadState.COMPLETED);

      stateMachine.cancel();
      expect(stateMachine.getCurrentState()).toBe(UploadState.COMPLETED); // Should remain completed
    });

    test('should handle cancellation during retry', async () => {
      const file = new File(['test data'], 'network-error.jpg', { type: 'image/jpeg' });

      await stateMachine.startUpload(file);
      expect(stateMachine.getCurrentState()).toBe(UploadState.FAILED);

      // Start retry and cancel
      const retryPromise = stateMachine.retry();
      stateMachine.cancel();

      expect(stateMachine.getCurrentState()).toBe(UploadState.CANCELLED);

      await retryPromise.catch(() => {}); // Ignore retry result
      expect(stateMachine.getCurrentState()).toBe(UploadState.CANCELLED);
    });
  });

  describe('State History', () => {
    test('should maintain state history', async () => {
      const file = new File(['test data'], 'test.jpg', { type: 'image/jpeg' });

      await stateMachine.startUpload(file);

      const history = stateMachine.getStateHistory();
      expect(history).toEqual([
        UploadState.IDLE,
        UploadState.IDLE,
        UploadState.VALIDATING,
        UploadState.UPLOADING,
        UploadState.PROCESSING
      ]);
    });

    test('should include retry states in history', async () => {
      const file = new File(['test data'], 'network-error.jpg', { type: 'image/jpeg' });

      await stateMachine.startUpload(file);
      await stateMachine.retry();

      const history = stateMachine.getStateHistory();
      expect(history).toContain(UploadState.FAILED);
      expect(history).toContain(UploadState.RETRYING);
    });
  });

  describe('State Machine Reset', () => {
    test('should reset state machine to initial state', async () => {
      const file = new File(['test data'], 'network-error.jpg', { type: 'image/jpeg' });

      await stateMachine.startUpload(file);
      await stateMachine.retry();

      expect(stateMachine.getCurrentState()).toBe(UploadState.FAILED);
      expect(stateMachine.getRetryCount()).toBeGreaterThan(0);
      expect(stateMachine.getStateHistory().length).toBeGreaterThan(0);

      stateMachine.reset();

      expect(stateMachine.getCurrentState()).toBe(UploadState.IDLE);
      expect(stateMachine.getRetryCount()).toBe(0);
      expect(stateMachine.getStateHistory()).toEqual([]);
    });
  });

  describe('Error Handling', () => {
    test('should handle different error types appropriately', async () => {
      const testCases = [
        { filename: 'network-error.jpg', expectedRetryable: true },
        { filename: 'server-error.jpg', expectedRetryable: true },
        { filename: 'timeout.jpg', expectedRetryable: true },
        { filename: 'auth-error.jpg', expectedRetryable: false }
      ];

      for (const testCase of testCases) {
        const localStateMachine = new MockUploadStateMachine();
        const file = new File(['test data'], testCase.filename, { type: 'image/jpeg' });

        if (!testCase.expectedRetryable) {
          // Mock non-retryable error
          (localStateMachine as any).isRetryableError = jest.fn().mockReturnValue(false);
        }

        await localStateMachine.startUpload(file);
        expect(localStateMachine.getCurrentState()).toBe(UploadState.FAILED);

        if (testCase.expectedRetryable) {
          // Should be able to retry
          await expect(localStateMachine.retry()).resolves.not.toThrow();
        } else {
          // Should not be able to retry
          await expect(localStateMachine.retry()).rejects.toThrow();
        }
      }
    });
  });

  describe('Concurrent Upload Handling', () => {
    test('should handle multiple state machines independently', async () => {
      const stateMachine1 = new MockUploadStateMachine();
      const stateMachine2 = new MockUploadStateMachine();

      const file1 = new File(['test data 1'], 'test1.jpg', { type: 'image/jpeg' });
      const file2 = new File(['test data 2'], 'network-error.jpg', { type: 'image/jpeg' });

      const upload1Promise = stateMachine1.startUpload(file1);
      const upload2Promise = stateMachine2.startUpload(file2);

      await Promise.allSettled([upload1Promise, upload2Promise]);

      expect(stateMachine1.getCurrentState()).toBe(UploadState.COMPLETED);
      expect(stateMachine2.getCurrentState()).toBe(UploadState.FAILED);

      // First state machine should not be affected by second's failure
      expect(stateMachine1.getRetryCount()).toBe(0);
      expect(stateMachine2.getRetryCount()).toBe(0);
    });
  });
});