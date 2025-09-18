/**
 * Enhanced Upload State Machine with Error Recovery
 * Implements robust state management for complex upload scenarios with
 * retry logic, exponential backoff, and comprehensive error handling
 */

/**
 * Upload states following the state machine pattern
 */
export type UploadState =
  | { status: 'idle' }
  | { status: 'validating'; file: File; progress: number }
  | { status: 'converting'; file: File; progress: number; format: string }
  | { status: 'compressing'; file: File; progress: number; quality: number }
  | { status: 'uploading'; progress: number; pausable: boolean; estimatedTime: number; bytesUploaded: number }
  | { status: 'paused'; resumeToken: string; bytesUploaded: number; totalBytes: number }
  | { status: 'success'; result: UploadResult; optimizations: CompressionStats }
  | { status: 'error'; error: UploadError; retryable: boolean; attempts: number; nextRetryIn?: number };

/**
 * Upload result interface
 */
export interface UploadResult {
  id: string;
  photoUrl: string;
  thumbnailUrl: string;
  metadata: {
    originalSize: number;
    finalSize: number;
    compressionRatio: number;
    format: string;
    dimensions: { width: number; height: number };
    processingTime: number;
  };
}

/**
 * Compression statistics
 */
export interface CompressionStats {
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
  qualityUsed: number;
  method: 'client' | 'server';
  formats: string[];
}

/**
 * Upload error interface
 */
export interface UploadError {
  code: string;
  message: string;
  category: 'network' | 'validation' | 'processing' | 'server' | 'quota' | 'permission';
  details?: any;
  timestamp: number;
  retryable: boolean;
  userFriendlyMessage: string;
}

/**
 * Retry configuration
 */
export interface RetryConfig {
  maxAttempts: number;
  backoffStrategy: 'exponential' | 'linear' | 'fixed';
  baseDelay: number; // milliseconds
  maxDelay: number; // milliseconds
  retryableErrors: string[];
  jitter: boolean; // Add randomness to prevent thundering herd
}

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  backoffStrategy: 'exponential',
  baseDelay: 1000,
  maxDelay: 30000,
  retryableErrors: ['network', 'timeout', 'server-error', 'quota-exceeded'],
  jitter: true,
};

/**
 * Upload action types
 */
export type UploadAction =
  | { type: 'START_VALIDATION'; file: File }
  | { type: 'VALIDATION_PROGRESS'; progress: number }
  | { type: 'VALIDATION_COMPLETE' }
  | { type: 'START_CONVERSION'; format: string }
  | { type: 'CONVERSION_PROGRESS'; progress: number }
  | { type: 'CONVERSION_COMPLETE'; convertedFile: File }
  | { type: 'START_COMPRESSION'; quality: number }
  | { type: 'COMPRESSION_PROGRESS'; progress: number }
  | { type: 'COMPRESSION_COMPLETE' }
  | { type: 'START_UPLOAD'; file: File }
  | { type: 'UPLOAD_PROGRESS'; progress: number; bytesUploaded: number; estimatedTime: number }
  | { type: 'PAUSE_UPLOAD'; resumeToken: string }
  | { type: 'RESUME_UPLOAD' }
  | { type: 'UPLOAD_SUCCESS'; result: UploadResult; optimizations: CompressionStats }
  | { type: 'UPLOAD_ERROR'; error: UploadError }
  | { type: 'RETRY_UPLOAD' }
  | { type: 'CANCEL_UPLOAD' }
  | { type: 'RESET' };

/**
 * Upload state machine reducer
 */
export function uploadStateReducer(state: UploadState, action: UploadAction): UploadState {
  switch (action.type) {
    case 'START_VALIDATION':
      return {
        status: 'validating',
        file: action.file,
        progress: 0,
      };

    case 'VALIDATION_PROGRESS':
      if (state.status === 'validating') {
        return {
          ...state,
          progress: action.progress,
        };
      }
      return state;

    case 'VALIDATION_COMPLETE':
      if (state.status === 'validating') {
        return { status: 'idle' }; // Will transition to next step
      }
      return state;

    case 'START_CONVERSION':
      return {
        status: 'converting',
        file: state.status === 'validating' ? state.file : new File([], ''),
        progress: 0,
        format: action.format,
      };

    case 'CONVERSION_PROGRESS':
      if (state.status === 'converting') {
        return {
          ...state,
          progress: action.progress,
        };
      }
      return state;

    case 'CONVERSION_COMPLETE':
      if (state.status === 'converting') {
        return {
          status: 'compressing',
          file: action.convertedFile,
          progress: 0,
          quality: 0.85, // Default quality
        };
      }
      return state;

    case 'START_COMPRESSION':
      return {
        status: 'compressing',
        file: (state.status === 'converting' || state.status === 'validating') ? state.file : new File([], ''),
        progress: 0,
        quality: action.quality,
      };

    case 'COMPRESSION_PROGRESS':
      if (state.status === 'compressing') {
        return {
          ...state,
          progress: action.progress,
        };
      }
      return state;

    case 'COMPRESSION_COMPLETE':
      if (state.status === 'compressing') {
        return { status: 'idle' }; // Will transition to upload
      }
      return state;

    case 'START_UPLOAD':
      return {
        status: 'uploading',
        progress: 0,
        pausable: true,
        estimatedTime: 0,
        bytesUploaded: 0,
      };

    case 'UPLOAD_PROGRESS':
      if (state.status === 'uploading') {
        return {
          ...state,
          progress: action.progress,
          bytesUploaded: action.bytesUploaded,
          estimatedTime: action.estimatedTime,
        };
      }
      return state;

    case 'PAUSE_UPLOAD':
      if (state.status === 'uploading') {
        return {
          status: 'paused',
          resumeToken: action.resumeToken,
          bytesUploaded: state.bytesUploaded,
          totalBytes: 0, // Would be calculated from file size
        };
      }
      return state;

    case 'RESUME_UPLOAD':
      if (state.status === 'paused') {
        return {
          status: 'uploading',
          progress: (state.bytesUploaded / state.totalBytes) * 100,
          pausable: true,
          estimatedTime: 0,
          bytesUploaded: state.bytesUploaded,
        };
      }
      return state;

    case 'UPLOAD_SUCCESS':
      return {
        status: 'success',
        result: action.result,
        optimizations: action.optimizations,
      };

    case 'UPLOAD_ERROR':
      return {
        status: 'error',
        error: action.error,
        retryable: action.error.retryable,
        attempts: state.status === 'error' ? state.attempts + 1 : 1,
      };

    case 'RETRY_UPLOAD':
      if (state.status === 'error' && state.retryable) {
        return { status: 'idle' }; // Will restart the upload process
      }
      return state;

    case 'CANCEL_UPLOAD':
    case 'RESET':
      return { status: 'idle' };

    default:
      return state;
  }
}

/**
 * Upload state machine class
 */
export class UploadStateMachine {
  private state: UploadState = { status: 'idle' };
  private retryConfig: RetryConfig;
  private listeners: Array<(state: UploadState) => void> = [];
  private retryTimeouts: Set<NodeJS.Timeout> = new Set();

  constructor(retryConfig: Partial<RetryConfig> = {}) {
    this.retryConfig = { ...DEFAULT_RETRY_CONFIG, ...retryConfig };
  }

  /**
   * Get current state
   */
  getState(): UploadState {
    return this.state;
  }

  /**
   * Subscribe to state changes
   */
  subscribe(listener: (state: UploadState) => void): () => void {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  /**
   * Dispatch action
   */
  dispatch(action: UploadAction): void {
    const newState = uploadStateReducer(this.state, action);

    if (newState !== this.state) {
      this.state = newState;
      this.notifyListeners();

      // Handle automatic retry scheduling
      if (newState.status === 'error' && newState.retryable && newState.attempts < this.retryConfig.maxAttempts) {
        this.scheduleRetry(newState.attempts);
      }
    }
  }

  /**
   * Schedule automatic retry
   */
  private scheduleRetry(attempt: number): void {
    const delay = this.calculateRetryDelay(attempt);

    const timeout = setTimeout(() => {
      this.retryTimeouts.delete(timeout);
      if (this.state.status === 'error' && this.state.retryable) {
        console.log(`📸 Automatically retrying upload (attempt ${attempt + 1}/${this.retryConfig.maxAttempts})`);
        this.dispatch({ type: 'RETRY_UPLOAD' });
      }
    }, delay);

    this.retryTimeouts.add(timeout);

    // Update state with retry timing
    if (this.state.status === 'error') {
      this.state = {
        ...this.state,
        nextRetryIn: delay,
      };
      this.notifyListeners();
    }
  }

  /**
   * Calculate retry delay based on configuration
   */
  private calculateRetryDelay(attempt: number): number {
    let delay: number;

    switch (this.retryConfig.backoffStrategy) {
      case 'exponential':
        delay = this.retryConfig.baseDelay * Math.pow(2, attempt);
        break;
      case 'linear':
        delay = this.retryConfig.baseDelay * (attempt + 1);
        break;
      case 'fixed':
      default:
        delay = this.retryConfig.baseDelay;
        break;
    }

    // Apply maximum delay limit
    delay = Math.min(delay, this.retryConfig.maxDelay);

    // Add jitter to prevent thundering herd
    if (this.retryConfig.jitter) {
      delay += Math.random() * 1000; // 0-1s jitter
    }

    return delay;
  }

  /**
   * Check if error is retryable
   */
  isRetryableError(error: UploadError): boolean {
    return this.retryConfig.retryableErrors.includes(error.category);
  }

  /**
   * Create upload error
   */
  createError(
    code: string,
    message: string,
    category: UploadError['category'],
    details?: any
  ): UploadError {
    return {
      code,
      message,
      category,
      details,
      timestamp: Date.now(),
      retryable: this.retryConfig.retryableErrors.includes(category),
      userFriendlyMessage: this.getUserFriendlyMessage(category, message),
    };
  }

  /**
   * Get user-friendly error message
   */
  private getUserFriendlyMessage(category: UploadError['category'], originalMessage: string): string {
    switch (category) {
      case 'network':
        return 'Network connection lost. Check your internet connection and try again.';
      case 'validation':
        return 'The selected file is not valid. Please choose a different image.';
      case 'processing':
        return 'Unable to process the image. The file may be corrupted.';
      case 'server':
        return 'Server error occurred. Please try again in a moment.';
      case 'quota':
        return 'Upload limit reached. Please try again later or contact support.';
      case 'permission':
        return 'You do not have permission to upload files here.';
      default:
        return originalMessage;
    }
  }

  /**
   * Clean up resources
   */
  cleanup(): void {
    this.retryTimeouts.forEach(timeout => clearTimeout(timeout));
    this.retryTimeouts.clear();
    this.listeners.length = 0;
  }

  /**
   * Notify all listeners of state change
   */
  private notifyListeners(): void {
    this.listeners.forEach(listener => {
      try {
        listener(this.state);
      } catch (error) {
        console.error('❌ Upload state listener error:', error);
      }
    });
  }

  /**
   * Get progress percentage for current state
   */
  getProgressPercentage(): number {
    switch (this.state.status) {
      case 'validating':
      case 'converting':
      case 'compressing':
      case 'uploading':
        return this.state.progress;
      case 'paused':
        return (this.state.bytesUploaded / this.state.totalBytes) * 100;
      case 'success':
        return 100;
      default:
        return 0;
    }
  }

  /**
   * Get current operation description
   */
  getOperationDescription(): string {
    switch (this.state.status) {
      case 'validating':
        return 'Validating file...';
      case 'converting':
        return `Converting ${this.state.format.toUpperCase()}...`;
      case 'compressing':
        return `Compressing (quality: ${Math.round(this.state.quality * 100)}%)...`;
      case 'uploading':
        return `Uploading... ${this.state.estimatedTime > 0 ? `(${Math.round(this.state.estimatedTime)}s remaining)` : ''}`;
      case 'paused':
        return 'Upload paused';
      case 'success':
        return 'Upload complete!';
      case 'error':
        return this.state.error.userFriendlyMessage;
      default:
        return 'Ready to upload';
    }
  }
}