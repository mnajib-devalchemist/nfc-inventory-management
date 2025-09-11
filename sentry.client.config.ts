/**
 * Sentry client-side configuration for error monitoring and performance tracking.
 * 
 * This configuration enables error reporting, performance monitoring, and user
 * session replay for client-side JavaScript execution in the browser.
 * 
 * @category Monitoring
 * @since 1.0.0
 */

import * as Sentry from '@sentry/nextjs';
import { clientEnv, isProduction } from '@/lib/utils/env';

Sentry.init({
  dsn: clientEnv.SENTRY_DSN,
  environment: clientEnv.NODE_ENV,
  
  // Capture Replay for 10% of all sessions,
  // plus for 100% of sessions with an error
  integrations: [
    Sentry.replayIntegration({
      maskAllText: isProduction,
      blockAllMedia: isProduction,
    }),
  ],
  
  // Performance Monitoring
  tracesSampleRate: isProduction ? 0.1 : 1.0,
  
  // Session Replay
  replaysSessionSampleRate: isProduction ? 0.1 : 1.0,
  replaysOnErrorSampleRate: 1.0,
  
  // Release tracking
  release: process.env.VERCEL_GIT_COMMIT_SHA || 'development',
  
  // Debug mode in development
  debug: !isProduction,
  
  // Filter out some common, non-actionable errors
  beforeSend(event, hint) {
    const error = hint.originalException;
    
    // Filter out network errors that are outside our control
    if (error && typeof error === 'object' && 'name' in error) {
      const errorName = error.name as string;
      if (
        errorName === 'ChunkLoadError' ||
        errorName === 'NetworkError' ||
        errorName === 'ResizeObserver loop limit exceeded'
      ) {
        return null;
      }
    }
    
    return event;
  },
  
  // Set user information
  initialScope: {
    tags: {
      component: 'client',
    },
  },
});