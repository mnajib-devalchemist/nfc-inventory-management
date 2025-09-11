import { z } from 'zod';

/**
 * Server-side environment variables validation schema.
 * 
 * This schema validates server-only environment variables that should never
 * be exposed to the client side, including database URLs and secrets.
 * 
 * @category Configuration
 * @since 1.0.0
 */
const serverEnvSchema = z.object({
  // Database
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  
  // Authentication Secrets
  NEXTAUTH_SECRET: z.string().min(8, 'NEXTAUTH_SECRET must be at least 8 characters'),
  
  // OAuth Provider Secrets
  GITHUB_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  
  // AWS Services (other AWS configs below in dedicated section)
  
  // External Service Secrets
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  SENDGRID_API_KEY: z.string().optional(),
  
  // Admin Configuration
  ADMIN_DATABASE_URL: z.string().optional(),
  ADMIN_EMAIL: z.string().email('ADMIN_EMAIL must be a valid email').optional(),
  ENABLE_ADMIN_PANEL: z.string().transform(val => val === 'true').default('false'),
  
  // AWS Configuration
  AWS_REGION: z.string().default('us-east-1'),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(), 
  AWS_S3_BUCKET_NAME: z.string().optional(),
  AWS_CLOUDFRONT_DOMAIN: z.string().optional(),
  
  // Application Environment
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

/**
 * Client-side environment variables validation schema.
 * 
 * This schema validates environment variables that are safe to expose
 * to the client side. These are typically public keys and configuration.
 * 
 * @category Configuration
 * @since 1.0.0
 */
const clientEnvSchema = z.object({
  // Public Authentication Configuration
  NEXTAUTH_URL: z.string().optional(),
  
  // Public OAuth Provider IDs
  GITHUB_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  
  // Public AWS Configuration
  AWS_REGION: z.string().default('us-east-1'),
  AWS_S3_BUCKET_NAME: z.string().optional(),
  AWS_CLOUDFRONT_DOMAIN: z.string().optional(),
  
  // Public External Services
  UPSTASH_REDIS_REST_URL: z.string().optional(),
  STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  SENTRY_DSN: z.string().optional(),
  POSTHOG_KEY: z.string().optional(),
  
  // Application Environment
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  VERCEL_ENV: z.enum(['development', 'preview', 'production']).optional(),
  
  // Public Admin Configuration
  ENABLE_ADMIN_PANEL: z.string().transform(val => val === 'true').default('false'),
  ADMIN_EMAIL: z.string().email('ADMIN_EMAIL must be a valid email').optional(),
});

/**
 * Validated server-side environment variables with type safety.
 * Only use this on the server side (API routes, Server Components, etc.).
 * 
 * @example Server-side usage
 * ```typescript
 * import { serverEnv } from '@/lib/utils/env';
 * 
 * // Only in API routes or Server Components
 * console.log(serverEnv.DATABASE_URL);
 * ```
 */
export const serverEnv = typeof window === 'undefined' ? serverEnvSchema.parse(process.env) : {} as z.infer<typeof serverEnvSchema>;

/**
 * Validated client-side environment variables with type safety.
 * Safe to use on both client and server sides.
 * 
 * @example Client-side usage
 * ```typescript
 * import { clientEnv } from '@/lib/utils/env';
 * 
 * // Safe to use anywhere
 * console.log(clientEnv.NODE_ENV);
 * ```
 */
export const clientEnv = clientEnvSchema.parse({
  NEXTAUTH_URL: process.env.NEXTAUTH_URL,
  GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID,
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  AWS_REGION: process.env.AWS_REGION,
  AWS_S3_BUCKET_NAME: process.env.AWS_S3_BUCKET_NAME,
  AWS_CLOUDFRONT_DOMAIN: process.env.AWS_CLOUDFRONT_DOMAIN,
  UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
  STRIPE_PUBLISHABLE_KEY: process.env.STRIPE_PUBLISHABLE_KEY,
  SENTRY_DSN: process.env.SENTRY_DSN,
  POSTHOG_KEY: process.env.POSTHOG_KEY,
  NODE_ENV: process.env.NODE_ENV,
  VERCEL_ENV: process.env.VERCEL_ENV,
  ENABLE_ADMIN_PANEL: process.env.ENABLE_ADMIN_PANEL,
  ADMIN_EMAIL: process.env.ADMIN_EMAIL,
});

/**
 * Legacy export for backward compatibility.
 * @deprecated Use clientEnv or serverEnv instead for better security.
 */
export const env = clientEnv;

/**
 * Checks if the application is running in production environment.
 * 
 * @returns True if NODE_ENV is production
 */
export const isProduction = clientEnv.NODE_ENV === 'production';

/**
 * Checks if the application is running in development environment.
 * 
 * @returns True if NODE_ENV is development
 */
export const isDevelopment = clientEnv.NODE_ENV === 'development';

/**
 * Checks if the application is running in test environment.
 * 
 * @returns True if NODE_ENV is test
 */
export const isTest = clientEnv.NODE_ENV === 'test';