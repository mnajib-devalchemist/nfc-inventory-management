/**
 * Centralized monitoring and analytics configuration.
 * 
 * This module provides configuration and utilities for error monitoring (Sentry),
 * analytics tracking (PostHog), and performance monitoring throughout the
 * Digital Inventory Management System.
 * 
 * @category Monitoring Configuration
 * @since 1.0.0
 */

import { env, isProduction } from '@/lib/utils/env';

/**
 * Sentry monitoring configuration.
 */
export const sentryConfig = {
  dsn: env.SENTRY_DSN,
  environment: env.NODE_ENV,
  enabled: !!env.SENTRY_DSN,
  sampleRate: isProduction ? 0.1 : 1.0,
  
  /**
   * Reports an error to Sentry with additional context.
   * 
   * @param error - The error to report
   * @param context - Additional context information
   */
  reportError: (error: Error, context?: Record<string, any>) => {
    if (!sentryConfig.enabled) return;
    
    // Import Sentry dynamically to avoid issues in environments where it's not configured
    import('@sentry/nextjs').then(({ captureException, withScope }) => {
      withScope((scope) => {
        if (context) {
          scope.setContext('error_context', context);
        }
        captureException(error);
      });
    });
  },
  
  /**
   * Reports a message to Sentry with severity level.
   * 
   * @param message - The message to report
   * @param level - Severity level (info, warning, error)
   * @param extra - Additional data
   */
  reportMessage: (
    message: string, 
    level: 'info' | 'warning' | 'error' = 'info',
    extra?: Record<string, any>
  ) => {
    if (!sentryConfig.enabled) return;
    
    import('@sentry/nextjs').then(({ captureMessage, withScope }) => {
      withScope((scope) => {
        if (extra) {
          scope.setExtra('message_data', extra);
        }
        captureMessage(message, level);
      });
    });
  },
};

/**
 * PostHog analytics configuration.
 */
export const analyticsConfig = {
  apiKey: env.POSTHOG_KEY,
  enabled: !!env.POSTHOG_KEY && isProduction,
  host: 'https://app.posthog.com',
  
  /**
   * Initializes PostHog analytics client.
   * 
   * @returns Promise that resolves when PostHog is initialized
   */
  init: async () => {
    if (!analyticsConfig.enabled) return;
    
    const posthog = await import('posthog-js');
    
    posthog.default.init(analyticsConfig.apiKey!, {
      api_host: analyticsConfig.host,
      capture_pageview: true,
      capture_pageleave: true,
      
      // Respect user privacy
      opt_out_capturing_by_default: false,
      respect_dnt: true,
      
      // Performance settings removed due to type issues
      
      // Development settings
      debug: !isProduction,
      loaded: (posthog) => {
        if (!isProduction) {
          console.log('PostHog initialized successfully');
        }
      },
    });
    
    return posthog.default;
  },
  
  /**
   * Tracks an event with properties.
   * 
   * @param eventName - Name of the event to track
   * @param properties - Event properties
   */
  track: (eventName: string, properties?: Record<string, any>) => {
    if (!analyticsConfig.enabled) return;
    
    import('posthog-js').then(({ default: posthog }) => {
      posthog.capture(eventName, properties);
    });
  },
  
  /**
   * Identifies a user for analytics.
   * 
   * @param userId - Unique user identifier
   * @param properties - User properties
   */
  identify: (userId: string, properties?: Record<string, any>) => {
    if (!analyticsConfig.enabled) return;
    
    import('posthog-js').then(({ default: posthog }) => {
      posthog.identify(userId, properties);
    });
  },
};

/**
 * Performance monitoring utilities.
 */
export const performanceConfig = {
  /**
   * Measures and reports the duration of an operation.
   * 
   * @param name - Name of the operation
   * @param operation - Function to measure
   * @returns Result of the operation
   */
  measureOperation: async <T>(
    name: string,
    operation: () => Promise<T>
  ): Promise<T> => {
    const startTime = performance.now();
    
    try {
      const result = await operation();
      const duration = performance.now() - startTime;
      
      // Log performance in development
      if (!isProduction) {
        console.log(`Operation "${name}" took ${duration.toFixed(2)}ms`);
      }
      
      // Track performance in analytics
      analyticsConfig.track('operation_performance', {
        operation_name: name,
        duration_ms: duration,
        status: 'success',
      });
      
      return result;
    } catch (error) {
      const duration = performance.now() - startTime;
      
      // Report error to monitoring
      sentryConfig.reportError(error as Error, {
        operation: name,
        duration,
      });
      
      // Track failed operation
      analyticsConfig.track('operation_performance', {
        operation_name: name,
        duration_ms: duration,
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      throw error;
    }
  },
};

/**
 * Initializes all monitoring and analytics services.
 * 
 * Call this function early in your application lifecycle to set up
 * error monitoring and analytics tracking.
 */
export const initializeMonitoring = async (): Promise<void> => {
  try {
    // Initialize analytics
    await analyticsConfig.init();
    
    console.log('Monitoring services initialized successfully');
  } catch (error) {
    console.error('Failed to initialize monitoring services:', error);
    
    // Still report to Sentry if possible
    sentryConfig.reportError(error as Error, {
      context: 'monitoring_initialization',
    });
  }
};