/**
 * Rate limiting utilities for authentication and API endpoints.
 * 
 * Implements sliding window rate limiting to prevent abuse and brute force attacks.
 * Uses in-memory storage for simplicity in development and can be extended with Redis.
 * 
 * @category Security
 * @since 1.0.0
 */

interface RateLimitConfig {
  /** Maximum number of requests allowed */
  limit: number;
  /** Time window in seconds */
  windowMs: number;
}

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

// In-memory store for rate limiting (use Redis in production)
const store = new Map<string, RateLimitRecord>();

/**
 * Rate limiting configurations for different endpoints.
 */
export const rateLimitConfigs = {
  // Authentication endpoints
  auth: {
    limit: 5,     // 5 attempts
    windowMs: 15 * 60 * 1000, // 15 minutes
  },
  // API endpoints
  api: {
    limit: 100,   // 100 requests
    windowMs: 60 * 1000, // 1 minute
  },
  // Password reset
  passwordReset: {
    limit: 3,     // 3 attempts
    windowMs: 60 * 60 * 1000, // 1 hour
  },
} as const;

/**
 * Checks if a request should be rate limited.
 * 
 * @param identifier - Unique identifier (IP address, user ID, etc.)
 * @param config - Rate limiting configuration
 * @returns Rate limiting result with success status and remaining requests
 * 
 * @example Basic usage
 * ```typescript
 * const result = checkRateLimit('192.168.1.1', rateLimitConfigs.auth);
 * if (!result.success) {
 *   throw new Error(`Rate limit exceeded. Try again in ${result.resetTime} seconds`);
 * }
 * ```
 */
export function checkRateLimit(
  identifier: string,
  config: RateLimitConfig
): {
  success: boolean;
  limit: number;
  remaining: number;
  resetTime: number;
} {
  const now = Date.now();
  const key = `${identifier}:${config.limit}:${config.windowMs}`;
  
  // Get current record or create new one
  let record = store.get(key);
  
  if (!record || now > record.resetTime) {
    // Create new record or reset expired one
    record = {
      count: 0,
      resetTime: now + config.windowMs,
    };
  }
  
  // Increment count
  record.count++;
  store.set(key, record);
  
  const remaining = Math.max(0, config.limit - record.count);
  const resetTime = Math.ceil((record.resetTime - now) / 1000);
  
  return {
    success: record.count <= config.limit,
    limit: config.limit,
    remaining,
    resetTime,
  };
}

/**
 * Clears rate limit records for testing or manual reset.
 * 
 * @param identifier - Identifier to clear, or undefined to clear all
 */
export function clearRateLimit(identifier?: string): void {
  if (identifier) {
    // Clear specific identifier
    for (const key of store.keys()) {
      if (key.startsWith(identifier + ':')) {
        store.delete(key);
      }
    }
  } else {
    // Clear all records
    store.clear();
  }
}

/**
 * Cleanup expired rate limit records to prevent memory leaks.
 * Should be called periodically.
 */
export function cleanupExpiredRecords(): void {
  const now = Date.now();
  
  for (const [key, record] of store.entries()) {
    if (now > record.resetTime) {
      store.delete(key);
    }
  }
}

/**
 * Gets the client IP address from a request.
 * 
 * @param request - Next.js request object
 * @returns Client IP address or 'unknown'
 */
export function getClientIP(request: Request | any): string {
  // Check various headers for the real IP
  const forwarded = request.headers.get('x-forwarded-for');
  const real = request.headers.get('x-real-ip');
  const clientIP = request.headers.get('x-client-ip');
  
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  
  if (real) {
    return real;
  }
  
  if (clientIP) {
    return clientIP;
  }
  
  // Fallback to connection remote address
  if (request.ip) {
    return request.ip;
  }
  
  return 'unknown';
}

// Cleanup expired records every 5 minutes
if (typeof window === 'undefined') {
  setInterval(cleanupExpiredRecords, 5 * 60 * 1000);
}