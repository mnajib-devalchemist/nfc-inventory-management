/**
 * Structured Logging System for Production Monitoring
 * 
 * Provides comprehensive logging with severity levels, structured data,
 * error categorization, and monitoring system integration for production
 * environments.
 * 
 * @category Utils
 * @subcategory Logging
 * @since 1.5.1
 */

/**
 * Log severity levels following standard logging practices.
 */
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info', 
  WARN = 'warn',
  ERROR = 'error',
  FATAL = 'fatal'
}

/**
 * Error categories for structured error handling.
 */
export enum ErrorCategory {
  SECURITY = 'security',
  PERFORMANCE = 'performance',
  VALIDATION = 'validation',
  NETWORK = 'network',
  AUTHENTICATION = 'authentication',
  AUTHORIZATION = 'authorization',
  DATA_INTEGRITY = 'data_integrity',
  SYSTEM = 'system',
  USER_INPUT = 'user_input',
  BUSINESS_LOGIC = 'business_logic'
}

/**
 * Performance metrics for monitoring.
 */
export interface PerformanceMetric {
  /** Operation name */
  operation: string;
  /** Duration in milliseconds */
  duration: number;
  /** Success/failure status */
  success: boolean;
  /** Additional metric data */
  metadata?: Record<string, any>;
}

/**
 * Security event data for audit logging.
 */
export interface SecurityEvent {
  /** Event type */
  eventType: 'xss_attempt' | 'injection_attempt' | 'validation_failure' | 'unauthorized_access';
  /** Severity of security event */
  severity: 'low' | 'medium' | 'high' | 'critical';
  /** User identifier (if available) */
  userId?: string;
  /** IP address (if available) */
  ipAddress?: string;
  /** Request details */
  requestDetails?: Record<string, any>;
  /** Blocked input or attempted payload */
  blockedInput?: string;
}

/**
 * Structured log entry format.
 */
export interface LogEntry {
  /** Timestamp in ISO format */
  timestamp: string;
  /** Log severity level */
  level: LogLevel;
  /** Log message */
  message: string;
  /** Error category (for errors) */
  category?: ErrorCategory;
  /** Associated error object */
  error?: Error;
  /** Additional structured data */
  metadata?: Record<string, any>;
  /** Request/session context */
  context?: {
    userId?: string;
    sessionId?: string;
    requestId?: string;
    userAgent?: string;
    url?: string;
  };
  /** Performance metrics */
  performance?: PerformanceMetric;
  /** Security event data */
  security?: SecurityEvent;
}

/**
 * Logger configuration options.
 */
export interface LoggerConfig {
  /** Minimum log level to output */
  minLevel: LogLevel;
  /** Whether to enable console output */
  enableConsole: boolean;
  /** Whether to enable structured JSON output */
  enableJson: boolean;
  /** External logging service configuration */
  externalService?: {
    enabled: boolean;
    endpoint?: string;
    apiKey?: string;
    batchSize?: number;
    flushInterval?: number;
  };
  /** Performance monitoring configuration */
  performance?: {
    enabled: boolean;
    slowOperationThreshold: number;
  };
}

/**
 * Default logger configuration.
 */
const DEFAULT_CONFIG: LoggerConfig = {
  minLevel: process.env.NODE_ENV === 'production' ? LogLevel.INFO : LogLevel.DEBUG,
  enableConsole: process.env.NODE_ENV !== 'production',
  enableJson: process.env.NODE_ENV === 'production',
  externalService: {
    enabled: false,
    batchSize: 100,
    flushInterval: 5000,
  },
  performance: {
    enabled: true,
    slowOperationThreshold: 1000,
  },
};

/**
 * Log level priorities for filtering.
 */
const LOG_LEVEL_PRIORITY = {
  [LogLevel.DEBUG]: 0,
  [LogLevel.INFO]: 1,
  [LogLevel.WARN]: 2,
  [LogLevel.ERROR]: 3,
  [LogLevel.FATAL]: 4,
};

/**
 * Structured logger class with production monitoring capabilities.
 */
export class Logger {
  private config: LoggerConfig;
  private logBuffer: LogEntry[] = [];
  private metricsBuffer: PerformanceMetric[] = [];
  private flushTimer?: NodeJS.Timeout;

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.setupFlushTimer();
  }

  /**
   * Setup automatic log flushing for external services.
   */
  private setupFlushTimer(): void {
    if (this.config.externalService?.enabled && this.config.externalService.flushInterval) {
      this.flushTimer = setInterval(() => {
        this.flush();
      }, this.config.externalService.flushInterval);
    }
  }

  /**
   * Create base log entry with timestamp and context.
   */
  private createLogEntry(
    level: LogLevel,
    message: string,
    metadata?: Record<string, any>
  ): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      message,
      metadata,
      context: this.getRequestContext(),
    };
  }

  /**
   * Get current request context (browser/server agnostic).
   */
  private getRequestContext(): LogEntry['context'] {
    const context: LogEntry['context'] = {};

    // Browser context
    if (typeof window !== 'undefined') {
      context.url = window.location.href;
      context.userAgent = navigator.userAgent;
      
      // Get session/user info from storage or context if available
      try {
        const sessionId = sessionStorage.getItem('sessionId');
        if (sessionId) context.sessionId = sessionId;
      } catch (e) {
        // Ignore storage access errors
      }
    }

    return Object.keys(context).length > 0 ? context : undefined;
  }

  /**
   * Check if log level should be output based on configuration.
   */
  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.config.minLevel];
  }

  /**
   * Output log entry to console and/or external service.
   */
  private outputLog(entry: LogEntry): void {
    if (!this.shouldLog(entry.level)) return;

    // Console output
    if (this.config.enableConsole) {
      const consoleMethod = this.getConsoleMethod(entry.level);
      if (this.config.enableJson) {
        consoleMethod(JSON.stringify(entry, null, 2));
      } else {
        consoleMethod(`[${entry.timestamp}] ${entry.level.toUpperCase()}: ${entry.message}`, 
                     entry.metadata || '');
      }
    }

    // Buffer for external service
    if (this.config.externalService?.enabled) {
      this.logBuffer.push(entry);
      
      if (this.logBuffer.length >= (this.config.externalService.batchSize || 100)) {
        this.flush();
      }
    }
  }

  /**
   * Get appropriate console method for log level.
   */
  private getConsoleMethod(level: LogLevel): (...args: any[]) => void {
    switch (level) {
      case LogLevel.DEBUG:
        return console.debug;
      case LogLevel.INFO:
        return console.info;
      case LogLevel.WARN:
        return console.warn;
      case LogLevel.ERROR:
      case LogLevel.FATAL:
        return console.error;
      default:
        return console.log;
    }
  }

  /**
   * Debug level logging.
   */
  debug(message: string, metadata?: Record<string, any>): void {
    const entry = this.createLogEntry(LogLevel.DEBUG, message, metadata);
    this.outputLog(entry);
  }

  /**
   * Info level logging.
   */
  info(message: string, metadata?: Record<string, any>): void {
    const entry = this.createLogEntry(LogLevel.INFO, message, metadata);
    this.outputLog(entry);
  }

  /**
   * Warning level logging.
   */
  warn(message: string, metadata?: Record<string, any>): void {
    const entry = this.createLogEntry(LogLevel.WARN, message, metadata);
    this.outputLog(entry);
  }

  /**
   * Error level logging with categorization.
   */
  error(
    message: string,
    error?: Error,
    category: ErrorCategory = ErrorCategory.SYSTEM,
    metadata?: Record<string, any>
  ): void {
    const entry = this.createLogEntry(LogLevel.ERROR, message, metadata);
    entry.error = error;
    entry.category = category;
    
    // Add stack trace if available
    if (error?.stack) {
      entry.metadata = { ...entry.metadata, stack: error.stack };
    }

    this.outputLog(entry);
  }

  /**
   * Fatal error logging.
   */
  fatal(
    message: string,
    error?: Error,
    category: ErrorCategory = ErrorCategory.SYSTEM,
    metadata?: Record<string, any>
  ): void {
    const entry = this.createLogEntry(LogLevel.FATAL, message, metadata);
    entry.error = error;
    entry.category = category;
    
    if (error?.stack) {
      entry.metadata = { ...entry.metadata, stack: error.stack };
    }

    this.outputLog(entry);
  }

  /**
   * Log performance metrics.
   */
  performance(metric: PerformanceMetric): void {
    const entry = this.createLogEntry(
      metric.success ? LogLevel.INFO : LogLevel.WARN,
      `Performance: ${metric.operation} completed in ${metric.duration}ms`,
      { ...metric.metadata, performance: true }
    );
    entry.performance = metric;

    // Check for slow operations
    if (this.config.performance?.enabled && 
        metric.duration > (this.config.performance.slowOperationThreshold || 1000)) {
      entry.level = LogLevel.WARN;
      entry.message = `SLOW OPERATION: ${metric.operation} took ${metric.duration}ms`;
    }

    this.outputLog(entry);
    this.metricsBuffer.push(metric);
  }

  /**
   * Log security events.
   */
  security(event: SecurityEvent): void {
    const level = this.getSecurityLogLevel(event.severity);
    const entry = this.createLogEntry(
      level,
      `Security Event: ${event.eventType} (${event.severity})`,
      { securityEvent: true }
    );
    entry.security = event;
    entry.category = ErrorCategory.SECURITY;

    this.outputLog(entry);
  }

  /**
   * Get log level for security event severity.
   */
  private getSecurityLogLevel(severity: SecurityEvent['severity']): LogLevel {
    switch (severity) {
      case 'low':
        return LogLevel.INFO;
      case 'medium':
        return LogLevel.WARN;
      case 'high':
        return LogLevel.ERROR;
      case 'critical':
        return LogLevel.FATAL;
      default:
        return LogLevel.WARN;
    }
  }

  /**
   * Flush buffered logs to external service.
   */
  async flush(): Promise<void> {
    if (!this.config.externalService?.enabled || this.logBuffer.length === 0) {
      return;
    }

    const logsToFlush = [...this.logBuffer];
    this.logBuffer = [];

    try {
      if (this.config.externalService.endpoint) {
        await this.sendToExternalService(logsToFlush);
      }
    } catch (error) {
      // Log flush failure (but don't cause infinite loop)
      console.error('Failed to flush logs to external service:', error);
      
      // Re-add logs to buffer for retry (with limit to prevent memory issues)
      if (this.logBuffer.length < 1000) {
        this.logBuffer.unshift(...logsToFlush);
      }
    }
  }

  /**
   * Send logs to external monitoring service.
   */
  private async sendToExternalService(logs: LogEntry[]): Promise<void> {
    const { endpoint, apiKey } = this.config.externalService!;
    
    const payload = {
      logs,
      timestamp: new Date().toISOString(),
      source: 'inventory-mgmt-frontend',
      environment: process.env.NODE_ENV || 'development',
    };

    const response = await fetch(endpoint!, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey && { Authorization: `Bearer ${apiKey}` }),
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`External logging service returned ${response.status}: ${response.statusText}`);
    }
  }

  /**
   * Get performance metrics summary.
   */
  getMetricsSummary(): {
    totalOperations: number;
    averageDuration: number;
    slowOperations: number;
    errorRate: number;
  } {
    if (this.metricsBuffer.length === 0) {
      return { totalOperations: 0, averageDuration: 0, slowOperations: 0, errorRate: 0 };
    }

    const totalDuration = this.metricsBuffer.reduce((sum, m) => sum + m.duration, 0);
    const slowOperations = this.metricsBuffer.filter(m => 
      m.duration > (this.config.performance?.slowOperationThreshold || 1000)
    ).length;
    const failedOperations = this.metricsBuffer.filter(m => !m.success).length;

    return {
      totalOperations: this.metricsBuffer.length,
      averageDuration: Math.round(totalDuration / this.metricsBuffer.length),
      slowOperations,
      errorRate: Math.round((failedOperations / this.metricsBuffer.length) * 100),
    };
  }

  /**
   * Cleanup resources.
   */
  destroy(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    this.flush(); // Final flush
  }
}

/**
 * Global logger instance with default configuration.
 */
export const logger = new Logger();

/**
 * Convenience function for performance timing with automatic logging.
 */
export async function withPerformanceLogging<T>(
  operation: string,
  fn: () => Promise<T> | T,
  metadata?: Record<string, any>
): Promise<T> {
  const startTime = performance.now();
  let success = true;
  let error: Error | undefined;

  try {
    const result = await fn();
    return result;
  } catch (e) {
    success = false;
    error = e as Error;
    throw e;
  } finally {
    const duration = performance.now() - startTime;
    
    logger.performance({
      operation,
      duration: Math.round(duration),
      success,
      metadata: {
        ...metadata,
        ...(error && { error: error.message }),
      },
    });
  }
}