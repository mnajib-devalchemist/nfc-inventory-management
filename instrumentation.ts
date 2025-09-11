/**
 * Next.js instrumentation for monitoring and observability.
 * 
 * This file is automatically executed by Next.js when the application starts,
 * allowing us to initialize monitoring services, performance tracking, and
 * other observability tools before the application begins serving requests.
 * 
 * @category Instrumentation
 * @since 1.0.0
 */

import { env } from '@/lib/utils/env';

/**
 * Registers instrumentation for the Next.js application.
 * 
 * This function is called once when the Next.js application starts,
 * making it ideal for initializing monitoring services, databases,
 * and other global application setup.
 */
export async function register() {
  // Only run instrumentation on server-side
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    console.log('Initializing application instrumentation...');
    
    // Initialize Sentry on server-side
    if (env.SENTRY_DSN) {
      try {
        await import('./sentry.server.config');
        console.log('✓ Sentry server-side monitoring initialized');
      } catch (error) {
        console.error('Failed to initialize Sentry:', error);
      }
    }
    
    // Initialize monitoring configuration
    try {
      const { initializeMonitoring } = await import('@/lib/config/monitoring');
      await initializeMonitoring();
      console.log('✓ Monitoring services initialized');
    } catch (error) {
      console.error('Failed to initialize monitoring services:', error);
    }
    
    // Log application startup
    console.log(`✓ Digital Inventory Manager instrumentation complete`);
    console.log(`  Environment: ${env.NODE_ENV}`);
    console.log(`  Sentry: ${env.SENTRY_DSN ? 'enabled' : 'disabled'}`);
    console.log(`  PostHog: ${env.POSTHOG_KEY ? 'enabled' : 'disabled'}`);
  }
}