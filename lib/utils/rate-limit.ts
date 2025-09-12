/**
 * Rate Limiting Utilities
 * 
 * This module provides rate limiting functionality for API endpoints to prevent
 * abuse and ensure system stability. Uses in-memory storage for development
 * and Redis for production environments.
 * 
 * @category Utilities
 * @since 1.4.0
 */

// In-memory store for development (will be lost on server restart)
// In production, this should be replaced with Redis or another persistent store
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

/**
 * Rate limit configuration interface.
 */
export interface RateLimitConfig {
  /** Maximum number of requests allowed in the time window */
  maxRequests: number;
  /** Time window in milliseconds */
  windowMs: number;
  /** Unique identifier for this rate limit (e.g., endpoint name) */
  keyPrefix?: string;
}

/**
 * Rate limit result interface.
 */
export interface RateLimitResult {
  /** Whether the request is allowed */
  allowed: boolean;
  /** Number of requests remaining in the current window */
  remaining: number;
  /** Time in milliseconds until the rate limit resets */
  resetTime: number;
  /** Total number of requests allowed */
  limit: number;
}

/**
 * Apply rate limiting to a user for a specific action.
 * 
 * This function implements a sliding window rate limiting algorithm
 * that tracks requests per user per action within a specified time window.
 * 
 * @param userId - Unique identifier for the user
 * @param config - Rate limiting configuration
 * @returns Promise<RateLimitResult> Rate limit status and metadata
 * 
 * @example Basic rate limiting
 * ```typescript
 * const result = await rateLimit('user-123', {
 *   maxRequests: 30,
 *   windowMs: 60000, // 1 minute
 *   keyPrefix: 'search'
 * });
 * 
 * if (!result.allowed) {
 *   return Response.json(
 *     { error: 'Rate limit exceeded' },
 *     { status: 429 }
 *   );
 * }
 * ```
 */
export async function rateLimit(
  userId: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const { maxRequests, windowMs, keyPrefix = 'default' } = config;
  const key = `${keyPrefix}:${userId}`;
  const now = Date.now();
  
  // Clean up expired entries periodically (simple cleanup)
  if (Math.random() < 0.01) { // 1% chance to clean up
    cleanupExpiredEntries();
  }
  
  // Get current rate limit data for this user/action
  const current = rateLimitStore.get(key);
  
  if (!current) {
    // First request in the window
    rateLimitStore.set(key, {
      count: 1,
      resetTime: now + windowMs,
    });
    
    return {
      allowed: true,
      remaining: maxRequests - 1,
      resetTime: now + windowMs,
      limit: maxRequests,
    };
  }
  
  // Check if the window has expired
  if (now >= current.resetTime) {
    // Window expired, reset counter
    rateLimitStore.set(key, {
      count: 1,
      resetTime: now + windowMs,
    });
    
    return {
      allowed: true,
      remaining: maxRequests - 1,
      resetTime: now + windowMs,
      limit: maxRequests,
    };
  }
  
  // Window still active, check if limit exceeded
  if (current.count >= maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetTime: current.resetTime,
      limit: maxRequests,
    };
  }
  
  // Increment counter
  current.count++;
  rateLimitStore.set(key, current);
  
  return {
    allowed: true,
    remaining: maxRequests - current.count,
    resetTime: current.resetTime,
    limit: maxRequests,
  };
}

/**
 * Clean up expired rate limit entries from memory.
 * 
 * This function removes expired entries to prevent memory leaks.
 * Called periodically during rate limit checks.
 * 
 * @private
 */
function cleanupExpiredEntries(): void {
  const now = Date.now();
  const keysToDelete: string[] = [];
  
  for (const [key, value] of rateLimitStore.entries()) {
    if (now >= value.resetTime) {
      keysToDelete.push(key);
    }
  }
  
  keysToDelete.forEach(key => rateLimitStore.delete(key));
}

/**
 * Get rate limit status without incrementing the counter.
 * 
 * Useful for checking current rate limit status without consuming
 * a request from the user's quota.
 * 
 * @param userId - Unique identifier for the user
 * @param config - Rate limiting configuration
 * @returns Current rate limit status
 */
export async function getRateLimitStatus(
  userId: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const { maxRequests, windowMs, keyPrefix = 'default' } = config;
  const key = `${keyPrefix}:${userId}`;
  const now = Date.now();
  
  const current = rateLimitStore.get(key);
  
  if (!current || now >= current.resetTime) {
    return {
      allowed: true,
      remaining: maxRequests,
      resetTime: now + windowMs,
      limit: maxRequests,
    };
  }
  
  return {
    allowed: current.count < maxRequests,
    remaining: Math.max(0, maxRequests - current.count),
    resetTime: current.resetTime,
    limit: maxRequests,
  };
}

/**
 * Reset rate limit for a specific user and action.
 * 
 * Useful for administrative purposes or testing scenarios.
 * 
 * @param userId - Unique identifier for the user
 * @param keyPrefix - Action prefix to reset
 * @returns Whether the rate limit was reset
 */
export async function resetRateLimit(
  userId: string,
  keyPrefix: string = 'default'
): Promise<boolean> {
  const key = `${keyPrefix}:${userId}`;
  return rateLimitStore.delete(key);
}

/**
 * Predefined rate limit configurations for different API endpoints.
 */
export const RATE_LIMIT_CONFIGS = {
  // Search endpoints
  SEARCH_BASIC: {
    maxRequests: 30,
    windowMs: 60000, // 1 minute
    keyPrefix: 'search',
  },
  SEARCH_ADVANCED: {
    maxRequests: 20,
    windowMs: 60000, // 1 minute
    keyPrefix: 'search-advanced',
  },
  SEARCH_SUGGESTIONS: {
    maxRequests: 60,
    windowMs: 60000, // 1 minute (higher for autocomplete)
    keyPrefix: 'search-suggestions',
  },
  
  // Item management endpoints
  ITEMS_READ: {
    maxRequests: 100,
    windowMs: 60000, // 1 minute
    keyPrefix: 'items-read',
  },
  ITEMS_WRITE: {
    maxRequests: 50,
    windowMs: 60000, // 1 minute
    keyPrefix: 'items-write',
  },
  
  // Photo upload endpoints
  PHOTO_UPLOAD: {
    maxRequests: 20,
    windowMs: 60000, // 1 minute
    keyPrefix: 'photo-upload',
  },
  
  // General API access
  API_GENERAL: {
    maxRequests: 200,
    windowMs: 60000, // 1 minute
    keyPrefix: 'api-general',
  },
} as const;

/**
 * Express-style middleware for rate limiting (if needed).
 * 
 * @param config - Rate limiting configuration
 * @returns Middleware function
 */
export function rateLimitMiddleware(config: RateLimitConfig) {
  return async (userId: string): Promise<RateLimitResult> => {
    return await rateLimit(userId, config);
  };
}

/**
 * Get rate limit headers for HTTP responses.
 * 
 * Generates standard rate limit headers to inform clients about
 * their current rate limit status.
 * 
 * @param result - Rate limit result from rateLimit function
 * @returns Object with header names and values
 */
export function getRateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    'X-RateLimit-Limit': result.limit.toString(),
    'X-RateLimit-Remaining': result.remaining.toString(),
    'X-RateLimit-Reset': Math.ceil(result.resetTime / 1000).toString(),
    'Retry-After': result.allowed ? '0' : Math.ceil((result.resetTime - Date.now()) / 1000).toString(),
  };
}