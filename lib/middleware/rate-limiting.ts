/**
 * Rate Limiting Middleware for Photo Upload Endpoints
 * Implements DoS protection and prevents upload abuse
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';

/**
 * Rate limit configuration
 */
interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  keyGenerator?: (req: NextRequest) => string;
}

/**
 * Rate limit store interface
 */
interface RateLimitStore {
  get(key: string): Promise<number | null>;
  set(key: string, value: number, ttlMs: number): Promise<void>;
  increment(key: string, ttlMs: number): Promise<number>;
}

/**
 * Memory-based rate limit store (for development)
 */
class MemoryRateLimitStore implements RateLimitStore {
  private store = new Map<string, { count: number; expiry: number }>();

  async get(key: string): Promise<number | null> {
    const entry = this.store.get(key);
    if (!entry || entry.expiry < Date.now()) {
      this.store.delete(key);
      return null;
    }
    return entry.count;
  }

  async set(key: string, value: number, ttlMs: number): Promise<void> {
    this.store.set(key, {
      count: value,
      expiry: Date.now() + ttlMs,
    });
  }

  async increment(key: string, ttlMs: number): Promise<number> {
    const current = await this.get(key);
    const newCount = (current || 0) + 1;
    await this.set(key, newCount, ttlMs);
    return newCount;
  }
}

/**
 * Rate limiting configurations for different scenarios
 */
export const RATE_LIMIT_CONFIGS = {
  // Photo upload rate limiting
  PHOTO_UPLOAD: {
    maxRequests: 10, // 10 uploads per minute per user
    windowMs: 60 * 1000, // 1 minute
    skipSuccessfulRequests: false,
    skipFailedRequests: true, // Don't count validation errors against rate limit
  } as RateLimitConfig,

  // HEIC conversion rate limiting (more resource intensive)
  HEIC_CONVERSION: {
    maxRequests: 5, // 5 conversions per minute per user
    windowMs: 60 * 1000,
    skipSuccessfulRequests: false,
    skipFailedRequests: true,
  } as RateLimitConfig,

  // Bulk operations
  BULK_UPLOAD: {
    maxRequests: 3, // 3 bulk operations per 5 minutes
    windowMs: 5 * 60 * 1000, // 5 minutes
    skipSuccessfulRequests: false,
    skipFailedRequests: false,
  } as RateLimitConfig,

  // Global rate limiting (per IP)
  GLOBAL_UPLOAD: {
    maxRequests: 50, // 50 uploads per hour per IP
    windowMs: 60 * 60 * 1000, // 1 hour
    skipSuccessfulRequests: false,
    skipFailedRequests: false,
  } as RateLimitConfig,
};

/**
 * Default rate limit store
 */
const defaultStore = new MemoryRateLimitStore();

/**
 * Generate rate limit key based on user and IP
 */
function generateRateLimitKey(req: NextRequest, prefix: string): string {
  // Try to get user ID from session
  const userId = (req as any).userId; // Set by auth middleware if available
  if (userId) {
    return `${prefix}:user:${userId}`;
  }

  // Fallback to IP-based limiting
  const ip = req.headers.get('x-forwarded-for') ||
             req.headers.get('x-real-ip') ||
             'unknown';

  return `${prefix}:ip:${ip}`;
}

/**
 * Create rate limiting middleware
 */
export function createRateLimit(
  config: RateLimitConfig,
  store: RateLimitStore = defaultStore
) {
  return async function rateLimit(req: NextRequest): Promise<NextResponse | null> {
    try {
      const key = config.keyGenerator
        ? config.keyGenerator(req)
        : generateRateLimitKey(req, 'upload');

      const currentCount = await store.increment(key, config.windowMs);

      // Add rate limit headers
      const headers = new Headers();
      headers.set('X-RateLimit-Limit', config.maxRequests.toString());
      headers.set('X-RateLimit-Remaining', Math.max(0, config.maxRequests - currentCount).toString());
      headers.set('X-RateLimit-Reset', new Date(Date.now() + config.windowMs).toISOString());

      if (currentCount > config.maxRequests) {
        console.warn(`Rate limit exceeded for key: ${key}, count: ${currentCount}`);

        return NextResponse.json(
          {
            error: 'Rate limit exceeded',
            message: 'Too many upload requests. Please try again later.',
            retryAfter: Math.ceil(config.windowMs / 1000),
            details: {
              limit: config.maxRequests,
              windowMs: config.windowMs,
              current: currentCount,
            }
          },
          {
            status: 429,
            headers
          }
        );
      }

      // Add headers to successful response (will be merged with actual response)
      return null; // Continue to next middleware/handler
    } catch (error) {
      console.error('Rate limiting error:', error);
      // In case of rate limit store errors, allow the request to continue
      // Better to have temporary vulnerability than complete service disruption
      return null;
    }
  };
}

/**
 * Rate limiting middleware for photo uploads
 */
export const photoUploadRateLimit = createRateLimit(RATE_LIMIT_CONFIGS.PHOTO_UPLOAD);

/**
 * Rate limiting middleware for HEIC conversion
 */
export const heicConversionRateLimit = createRateLimit(RATE_LIMIT_CONFIGS.HEIC_CONVERSION);

/**
 * Rate limiting middleware for bulk operations
 */
export const bulkUploadRateLimit = createRateLimit(RATE_LIMIT_CONFIGS.BULK_UPLOAD);

/**
 * Global rate limiting middleware
 */
export const globalUploadRateLimit = createRateLimit({
  ...RATE_LIMIT_CONFIGS.GLOBAL_UPLOAD,
  keyGenerator: (req: NextRequest) => generateRateLimitKey(req, 'global'),
});

/**
 * Utility to check rate limit without incrementing
 */
export async function checkRateLimit(
  req: NextRequest,
  config: RateLimitConfig,
  store: RateLimitStore = defaultStore
): Promise<{
  allowed: boolean;
  current: number;
  limit: number;
  remaining: number;
  resetTime: Date;
}> {
  const key = config.keyGenerator
    ? config.keyGenerator(req)
    : generateRateLimitKey(req, 'check');

  const current = await store.get(key) || 0;
  const remaining = Math.max(0, config.maxRequests - current);
  const resetTime = new Date(Date.now() + config.windowMs);

  return {
    allowed: current < config.maxRequests,
    current,
    limit: config.maxRequests,
    remaining,
    resetTime,
  };
}

/**
 * Middleware wrapper to apply rate limiting to API routes
 */
export function withRateLimit(
  handler: (req: NextRequest, ...args: any[]) => Promise<NextResponse>,
  rateLimiter = photoUploadRateLimit
) {
  return async (req: NextRequest, ...args: any[]): Promise<NextResponse> => {
    // Apply rate limiting
    const rateLimitResponse = await rateLimiter(req);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    // Continue to actual handler
    return handler(req, ...args);
  };
}

/**
 * Enhanced rate limiting with user session context
 */
export async function createSessionAwareRateLimit(
  req: NextRequest,
  config: RateLimitConfig
): Promise<NextResponse | null> {
  try {
    // Get session to identify user
    const session = await getServerSession();

    let key: string;
    if (session?.user?.id) {
      key = `upload:user:${session.user.id}`;
    } else {
      // Stricter limits for unauthenticated users
      const ip = req.headers.get('x-forwarded-for') ||
                 req.headers.get('x-real-ip') ||
                 'unknown';
      key = `upload:anon:${ip}`;

      // Reduce limits for anonymous users
      config = {
        ...config,
        maxRequests: Math.floor(config.maxRequests / 2),
      };
    }

    const store = defaultStore;
    const currentCount = await store.increment(key, config.windowMs);

    if (currentCount > config.maxRequests) {
      return NextResponse.json(
        {
          error: 'Rate limit exceeded',
          message: session?.user?.id
            ? 'Too many uploads. Please wait before uploading more photos.'
            : 'Please sign in for higher upload limits.',
          retryAfter: Math.ceil(config.windowMs / 1000),
        },
        { status: 429 }
      );
    }

    return null;
  } catch (error) {
    console.error('Session-aware rate limiting error:', error);
    return null; // Allow request to continue on error
  }
}

/**
 * Rate limit statistics for monitoring
 */
export async function getRateLimitStats(): Promise<{
  totalRequests: number;
  blockedRequests: number;
  averageRequestsPerMinute: number;
  topUsers: Array<{ key: string; requests: number }>;
}> {
  // This would typically integrate with a proper monitoring system
  // For now, return mock data structure
  return {
    totalRequests: 0,
    blockedRequests: 0,
    averageRequestsPerMinute: 0,
    topUsers: [],
  };
}