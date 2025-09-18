'use client';

import React, { Component, ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertTriangle,
  RefreshCw,
  Camera,
  Image as ImageIcon,
  Download,
  Bug,
  Clock
} from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Photo error boundary state interface
 */
interface PhotoErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  retryCount: number;
  lastErrorTime: number;
  errorId: string;
}

/**
 * Photo error boundary props
 */
interface PhotoErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  enableRetry?: boolean;
  maxRetries?: number;
  showErrorDetails?: boolean;
  className?: string;
  context?: 'photo-upload' | 'photo-editing' | 'photo-gallery' | 'camera-capture' | 'general';
}

/**
 * Default fallback UI for different contexts
 */
const DEFAULT_FALLBACKS = {
  'photo-upload': {
    title: 'Photo Upload Error',
    description: 'Unable to upload your photo. Please try again.',
    icon: <Download className="h-8 w-8" />,
  },
  'photo-editing': {
    title: 'Photo Editing Error',
    description: 'Unable to edit the photo. Your changes may not have been saved.',
    icon: <ImageIcon className="h-8 w-8" />,
  },
  'photo-gallery': {
    title: 'Photo Gallery Error',
    description: 'Unable to display the photo gallery. Some photos may not load.',
    icon: <ImageIcon className="h-8 w-8" />,
  },
  'camera-capture': {
    title: 'Camera Error',
    description: 'Unable to access the camera. Please check permissions and try again.',
    icon: <Camera className="h-8 w-8" />,
  },
  'general': {
    title: 'Photo Processing Error',
    description: 'Something went wrong with photo processing.',
    icon: <AlertTriangle className="h-8 w-8" />,
  },
};

/**
 * PhotoErrorBoundary - Comprehensive error boundary for photo-heavy operations
 *
 * Implements comprehensive error recovery patterns for failed photo operations,
 * retry mechanisms with exponential backoff, fallback UI states, and performance
 * monitoring for photo operations. Handles Canvas cleanup and memory management
 * errors gracefully.
 *
 * @component
 * @category Error Handling
 * @since 1.3.0 (Story 2.3)
 */
export class PhotoErrorBoundary extends Component<PhotoErrorBoundaryProps, PhotoErrorBoundaryState> {
  private retryTimeouts: Set<NodeJS.Timeout> = new Set();

  constructor(props: PhotoErrorBoundaryProps) {
    super(props);

    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: 0,
      lastErrorTime: 0,
      errorId: '',
    };
  }

  /**
   * Static method to catch errors and update state
   */
  static getDerivedStateFromError(error: Error): Partial<PhotoErrorBoundaryState> {
    const errorId = `photo-error-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    return {
      hasError: true,
      error,
      lastErrorTime: Date.now(),
      errorId,
    };
  }

  /**
   * Component did catch error - handle logging and recovery
   */
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Update state with error info
    this.setState({
      errorInfo,
    });

    // Log error for monitoring
    this.logError(error, errorInfo);

    // Call custom error handler
    this.props.onError?.(error, errorInfo);

    // Clean up any photo-related resources
    this.cleanupPhotoResources();
  }

  /**
   * Component will unmount - cleanup
   */
  componentWillUnmount() {
    this.clearRetryTimeouts();
    this.cleanupPhotoResources();
  }

  /**
   * Log error for monitoring and debugging
   */
  private logError = (error: Error, errorInfo: React.ErrorInfo) => {
    const { context = 'general' } = this.props;
    const { errorId } = this.state;

    // Enhanced error logging for photo operations
    const errorReport = {
      errorId,
      context,
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
      errorInfo: {
        componentStack: errorInfo.componentStack,
      },
      timestamp: new Date().toISOString(),
      userAgent: typeof window !== 'undefined' ? window.navigator.userAgent : 'unknown',
      url: typeof window !== 'undefined' ? window.location.href : 'unknown',
      memoryUsage: this.getMemoryUsage(),
      photoContext: this.getPhotoContext(),
    };

    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.group(`🚨 PhotoErrorBoundary: ${context}`);
      console.error('Error:', error);
      console.error('Error Info:', errorInfo);
      console.error('Full Report:', errorReport);
      console.groupEnd();
    }

    // Send to monitoring service in production
    if (process.env.NODE_ENV === 'production') {
      this.sendToMonitoring(errorReport);
    }
  };

  /**
   * Clean up photo-related resources
   */
  private cleanupPhotoResources = () => {
    try {
      // Clean up any Canvas contexts
      const canvases = document.querySelectorAll('canvas');
      canvases.forEach(canvas => {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
      });

      // Revoke any object URLs
      if (typeof window !== 'undefined' && window.URL) {
        // Note: We can't track all object URLs, but this helps with memory
        // The component should handle its own URL cleanup
      }

      // Clear any photo-related timers
      this.clearRetryTimeouts();

    } catch (cleanupError) {
      console.warn('⚠️ Error during photo resource cleanup:', cleanupError);
    }
  };

  /**
   * Clear retry timeouts
   */
  private clearRetryTimeouts = () => {
    this.retryTimeouts.forEach(timeout => clearTimeout(timeout));
    this.retryTimeouts.clear();
  };

  /**
   * Get memory usage information
   */
  private getMemoryUsage = () => {
    if (typeof window !== 'undefined' && 'performance' in window && 'memory' in (window.performance as any)) {
      const memory = (window.performance as any).memory;
      return {
        usedJSHeapSize: memory.usedJSHeapSize,
        totalJSHeapSize: memory.totalJSHeapSize,
        jsHeapSizeLimit: memory.jsHeapSizeLimit,
      };
    }
    return null;
  };

  /**
   * Get photo operation context
   */
  private getPhotoContext = () => {
    const canvasCount = document.querySelectorAll('canvas').length;
    const imgCount = document.querySelectorAll('img').length;
    const videoCount = document.querySelectorAll('video').length;

    return {
      canvasCount,
      imgCount,
      videoCount,
      context: this.props.context,
    };
  };

  /**
   * Send error report to monitoring service
   */
  private sendToMonitoring = async (errorReport: any) => {
    try {
      // TODO: Implement actual monitoring service integration
      // This could be Sentry, LogRocket, or custom monitoring
      console.log('📊 Would send to monitoring:', errorReport);
    } catch (error) {
      console.warn('⚠️ Failed to send error to monitoring service:', error);
    }
  };

  /**
   * Retry the failed operation
   */
  private handleRetry = () => {
    const { maxRetries = 3 } = this.props;
    const { retryCount } = this.state;

    if (retryCount >= maxRetries) {
      console.warn('⚠️ Maximum retry attempts reached');
      return;
    }

    // Calculate exponential backoff delay
    const delay = Math.min(1000 * Math.pow(2, retryCount), 10000); // Max 10 seconds

    console.log(`🔄 Retrying photo operation in ${delay}ms (attempt ${retryCount + 1}/${maxRetries})`);

    const timeout = setTimeout(() => {
      this.setState({
        hasError: false,
        error: null,
        errorInfo: null,
        retryCount: retryCount + 1,
      });

      this.retryTimeouts.delete(timeout);
    }, delay);

    this.retryTimeouts.add(timeout);
  };

  /**
   * Reset error boundary state
   */
  private handleReset = () => {
    this.clearRetryTimeouts();
    this.cleanupPhotoResources();

    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: 0,
      lastErrorTime: 0,
      errorId: '',
    });
  };

  /**
   * Get error severity based on error type
   */
  private getErrorSeverity = (error: Error): 'low' | 'medium' | 'high' | 'critical' => {
    const message = error.message.toLowerCase();
    const stack = error.stack?.toLowerCase() || '';

    // Critical errors - memory/security related
    if (message.includes('memory') || message.includes('quota') || stack.includes('security')) {
      return 'critical';
    }

    // High severity - Canvas/WebGL errors
    if (message.includes('canvas') || message.includes('webgl') || message.includes('context')) {
      return 'high';
    }

    // Medium severity - File/upload errors
    if (message.includes('file') || message.includes('upload') || message.includes('network')) {
      return 'medium';
    }

    // Low severity - UI/display errors
    return 'low';
  };

  /**
   * Get recovery suggestions based on error
   */
  private getRecoverySuggestions = (error: Error): string[] => {
    const message = error.message.toLowerCase();
    const suggestions: string[] = [];

    if (message.includes('memory') || message.includes('quota')) {
      suggestions.push('Close other browser tabs to free memory');
      suggestions.push('Try uploading smaller images');
      suggestions.push('Restart your browser');
    }

    if (message.includes('canvas') || message.includes('context')) {
      suggestions.push('Your device may not support this feature');
      suggestions.push('Try using a different browser');
      suggestions.push('Update your browser to the latest version');
    }

    if (message.includes('network') || message.includes('upload')) {
      suggestions.push('Check your internet connection');
      suggestions.push('Try uploading again in a few moments');
      suggestions.push('Ensure the file is not corrupted');
    }

    if (message.includes('permission') || message.includes('camera')) {
      suggestions.push('Allow camera access in browser settings');
      suggestions.push('Check camera permissions');
      suggestions.push('Make sure no other app is using the camera');
    }

    return suggestions;
  };

  render() {
    const { children, fallback, enableRetry = true, showErrorDetails = false, className, context = 'general' } = this.props;
    const { hasError, error, retryCount } = this.state;
    const { maxRetries = 3 } = this.props;

    // Render children if no error
    if (!hasError) {
      return children;
    }

    // Use custom fallback if provided
    if (fallback) {
      return fallback;
    }

    // Generate default fallback UI
    const defaultFallback = DEFAULT_FALLBACKS[context];
    const severity = error ? this.getErrorSeverity(error) : 'medium';
    const suggestions = error ? this.getRecoverySuggestions(error) : [];
    const canRetry = enableRetry && retryCount < maxRetries;

    const severityColors = {
      low: 'border-yellow-200 bg-yellow-50',
      medium: 'border-orange-200 bg-orange-50',
      high: 'border-red-200 bg-red-50',
      critical: 'border-red-500 bg-red-100',
    };

    return (
      <Card className={cn('w-full max-w-lg mx-auto', severityColors[severity], className)}>
        <CardHeader className="text-center">
          <div className="flex justify-center mb-2 text-muted-foreground">
            {defaultFallback.icon}
          </div>
          <CardTitle className="text-lg">
            {defaultFallback.title}
          </CardTitle>
          <div className="flex justify-center gap-2">
            <Badge variant="outline" className="text-xs">
              {severity.toUpperCase()}
            </Badge>
            <Badge variant="outline" className="text-xs">
              {context.replace('-', ' ').toUpperCase()}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground text-center">
            {defaultFallback.description}
          </p>

          {/* Recovery suggestions */}
          {suggestions.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Try these solutions:</h4>
              <ul className="text-xs text-muted-foreground space-y-1">
                {suggestions.map((suggestion, index) => (
                  <li key={index} className="flex items-start gap-2">
                    <span className="text-primary">•</span>
                    <span>{suggestion}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-2 justify-center">
            <Button
              onClick={this.handleReset}
              variant="outline"
              size="sm"
              className="flex-1"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Start Over
            </Button>

            {canRetry && (
              <Button
                onClick={this.handleRetry}
                size="sm"
                className="flex-1"
              >
                <Clock className="h-4 w-4 mr-2" />
                Try Again ({maxRetries - retryCount} left)
              </Button>
            )}
          </div>

          {/* Error details for debugging */}
          {showErrorDetails && error && process.env.NODE_ENV === 'development' && (
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground mb-2 flex items-center gap-2">
                <Bug className="h-3 w-3" />
                Technical Details
              </summary>
              <div className="bg-muted/50 p-3 rounded text-xs font-mono space-y-2">
                <div>
                  <strong>Error:</strong> {error.name}
                </div>
                <div>
                  <strong>Message:</strong> {error.message}
                </div>
                {error.stack && (
                  <div>
                    <strong>Stack:</strong>
                    <pre className="text-xs mt-1 whitespace-pre-wrap">
                      {error.stack.split('\n').slice(0, 5).join('\n')}
                    </pre>
                  </div>
                )}
                <div>
                  <strong>Retry Count:</strong> {retryCount}
                </div>
                <div>
                  <strong>Error ID:</strong> {this.state.errorId}
                </div>
              </div>
            </details>
          )}
        </CardContent>
      </Card>
    );
  }
}

/**
 * HOC wrapper for easier use with functional components
 */
export function withPhotoErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  boundaryProps?: Partial<PhotoErrorBoundaryProps>
) {
  const WrappedComponent = (props: P) => (
    <PhotoErrorBoundary {...boundaryProps}>
      <Component {...props} />
    </PhotoErrorBoundary>
  );

  WrappedComponent.displayName = `withPhotoErrorBoundary(${Component.displayName || Component.name})`;

  return WrappedComponent;
}

/**
 * Hook for handling photo errors in functional components
 */
export function usePhotoErrorHandler(context?: PhotoErrorBoundaryProps['context']) {
  const handleError = React.useCallback((error: Error, errorInfo?: React.ErrorInfo) => {
    console.error(`Photo error in ${context}:`, error);

    // Could integrate with error reporting service here
    if (errorInfo) {
      console.error('Component stack:', errorInfo.componentStack);
    }
  }, [context]);

  return { handleError };
}