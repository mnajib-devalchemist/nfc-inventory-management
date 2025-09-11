/**
 * Sentry server-side configuration for error monitoring and performance tracking.
 * 
 * This configuration enables error reporting and performance monitoring for
 * server-side code execution including API routes, server components, and
 * middleware in the Next.js application.
 * 
 * @category Monitoring
 * @since 1.0.0
 */

import * as Sentry from '@sentry/nextjs';
import { clientEnv, isProduction } from '@/lib/utils/env';

Sentry.init({
  dsn: clientEnv.SENTRY_DSN,
  environment: clientEnv.NODE_ENV,
  
  // Performance Monitoring
  tracesSampleRate: isProduction ? 0.1 : 1.0,
  
  // Release tracking
  release: process.env.VERCEL_GIT_COMMIT_SHA || 'development',
  
  // Debug mode in development
  debug: !isProduction,
  
  // Server-side integrations
  integrations: [
    // Capture console.log, console.error, etc.
    ...(isProduction ? [] : [Sentry.consoleIntegration()]),
    
    // HTTP integration for tracking requests
    Sentry.httpIntegration(),
  ],
  
  // Filter out some common, non-actionable server errors
  beforeSend(event, hint) {
    const error = hint.originalException;
    
    // Filter out client disconnections and similar network issues
    if (error && typeof error === 'object' && 'code' in error) {
      const errorCode = error.code as string;
      if (
        errorCode === 'ECONNRESET' ||
        errorCode === 'EPIPE' ||
        errorCode === 'ETIMEDOUT'
      ) {
        return null;
      }
    }
    
    return event;
  },
  
  // Set server context information
  initialScope: {
    tags: {
      component: 'server',
      runtime: 'nodejs',
    },
  },
});