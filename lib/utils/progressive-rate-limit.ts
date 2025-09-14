/**
 * Progressive Rate Limiting for Authentication Security.
 *
 * This module implements QA-mandated progressive rate limiting to prevent brute force
 * attacks on authentication endpoints. Uses Redis for production with memory fallback.
 * Implements escalating lockout periods and IP-based global protection.
 *
 * @category Security
 * @since 1.6.0
 */

import { serverEnv, isDevelopment } from '@/lib/utils/env';

/**
 * Rate limiting configuration interface.
 */
export interface ProgressiveRateLimitConfig {
  base: { limit: number; window: number };
  progressive: { limit: number; window: number };
  ipGlobal: { limit: number; window: number };
  ipWindow: number;
}

/**
 * Rate limiting result interface.
 */
export interface ProgressiveRateLimitResult {
  success: boolean;
  remaining: number;
  lockoutTime?: number;
  reason?: 'user_limit' | 'progressive_limit' | 'ip_limit';
}

/**
 * QA-mandated progressive rate limiting configuration.
 *
 * Implements escalating security measures:
 * - Base limits for normal usage
 * - Progressive limits after base exceeded
 * - IP-based global protection
 */
export const PROGRESSIVE_AUTH_RATE_LIMITS: Record<string, ProgressiveRateLimitConfig> = {
  login: {
    base: { limit: 3, window: 900 },        // 3 attempts per 15 minutes
    progressive: { limit: 1, window: 3600 }, // 1 attempt per hour after base exceeded
    ipGlobal: { limit: 10, window: 3600 },   // 10 attempts per IP per hour
    ipWindow: 3600,
  },
  register: {
    base: { limit: 2, window: 3600 },        // 2 registrations per hour
    progressive: { limit: 1, window: 86400 }, // 1 per day after base exceeded
    ipGlobal: { limit: 5, window: 3600 },     // 5 registrations per IP per hour
    ipWindow: 3600,
  },
  passwordReset: {
    base: { limit: 2, window: 3600 },        // 2 resets per hour
    progressive: { limit: 1, window: 86400 }, // 1 per day after base exceeded
    ipGlobal: { limit: 5, window: 3600 },     // 5 resets per IP per hour
    ipWindow: 3600,
  },
  emailVerification: {
    base: { limit: 3, window: 3600 },        // 3 verifications per hour
    progressive: { limit: 1, window: 7200 },  // 1 per 2 hours after base exceeded
    ipGlobal: { limit: 10, window: 3600 },    // 10 verifications per IP per hour
    ipWindow: 3600,
  },
};

/**
 * Memory-based rate limiting store for fallback and development.
 */
const memoryRateLimits = new Map<string, Array<number>>();

/**
 * Redis client instance (lazy-loaded).
 */
let redisClient: any = null;

/**
 * Initialize Redis client for rate limiting.
 */
async function getRedisClient() {
  if (redisClient) return redisClient;

  if (!serverEnv.UPSTASH_REDIS_REST_URL || !serverEnv.UPSTASH_REDIS_REST_TOKEN) {
    return null; // Fall back to memory-based limiting
  }

  try {
    const { Redis } = await import('@upstash/redis');
    redisClient = new Redis({
      url: serverEnv.UPSTASH_REDIS_REST_URL,
      token: serverEnv.UPSTASH_REDIS_REST_TOKEN,
    });
    return redisClient;
  } catch (error) {
    console.warn('Failed to initialize Redis client:', error);
    return null;
  }
}

/**
 * Progressive rate limiting implementation.
 *
 * Implements QA-mandated security measures with escalating lockout periods
 * and comprehensive protection against brute force attacks.
 *
 * @param key - Unique identifier for the rate limit (e.g., email or user ID)
 * @param action - Type of authentication action
 * @param ip - Client IP address for global protection
 * @returns Rate limiting result with lockout information
 *
 * @example Authentication rate limiting
 * ```typescript
 * const result = await progressiveRateLimit('user@example.com', 'login', '192.168.1.1');
 * if (!result.success) {
 *   return Response.json(
 *     { error: 'Too many attempts', lockoutTime: result.lockoutTime },
 *     { status: 429 }
 *   );
 * }
 * ```
 */
export async function progressiveRateLimit(
  key: string,
  action: keyof typeof PROGRESSIVE_AUTH_RATE_LIMITS,
  ip: string
): Promise<ProgressiveRateLimitResult> {
  const redis = await getRedisClient();

  try {
    if (redis) {
      return await redisProgressiveRateLimit(redis, key, action, ip);
    } else {
      return await memoryProgressiveRateLimit(key, action, ip);
    }
  } catch (error) {
    console.warn('Rate limiting error, falling back to memory-based limiting:', error);
    return await memoryProgressiveRateLimit(key, action, ip);
  }
}

/**
 * Redis-based progressive rate limiting implementation.
 */
async function redisProgressiveRateLimit(
  redis: any,
  key: string,
  action: keyof typeof PROGRESSIVE_AUTH_RATE_LIMITS,
  ip: string
): Promise<ProgressiveRateLimitResult> {
  const limits = PROGRESSIVE_AUTH_RATE_LIMITS[action];
  const userKey = `auth:${action}:user:${key}`;
  const ipKey = `auth:${action}:ip:${ip}`;
  const now = Date.now();

  // Check user-specific limits
  const userAttempts = await redis.incr(userKey);
  if (userAttempts === 1) {
    await redis.expire(userKey, limits.base.window);
  }

  // Check IP-based limits for additional protection
  const ipAttempts = await redis.incr(ipKey);
  if (ipAttempts === 1) {
    await redis.expire(ipKey, limits.ipWindow);
  }

  // Progressive lockout logic
  let isBlocked = false;
  let lockoutTime: number | undefined;
  let reason: ProgressiveRateLimitResult['reason'];

  // Check IP-based global limits first
  if (ipAttempts > limits.ipGlobal.limit) {
    isBlocked = true;
    lockoutTime = limits.ipGlobal.window;
    reason = 'ip_limit';
  }
  // Check user-specific progressive limits
  else if (userAttempts > limits.base.limit) {
    if (userAttempts <= limits.base.limit + limits.progressive.limit) {
      // Progressive lockout period
      lockoutTime = limits.progressive.window;
      reason = 'progressive_limit';
    } else {
      // Maximum lockout reached
      isBlocked = true;
      lockoutTime = limits.progressive.window;
      reason = 'progressive_limit';
    }
  }
  // Check base limits
  else if (userAttempts > limits.base.limit) {
    isBlocked = true;
    lockoutTime = limits.base.window;
    reason = 'user_limit';
  }

  return {
    success: !isBlocked,
    remaining: Math.max(0, limits.base.limit - userAttempts),
    lockoutTime: isBlocked ? lockoutTime : undefined,
    reason: isBlocked ? reason : undefined,
  };
}

/**
 * Memory-based progressive rate limiting fallback.
 */
async function memoryProgressiveRateLimit(
  key: string,
  action: keyof typeof PROGRESSIVE_AUTH_RATE_LIMITS,
  ip: string
): Promise<ProgressiveRateLimitResult> {
  const limits = PROGRESSIVE_AUTH_RATE_LIMITS[action];
  const now = Date.now();
  const userKey = `${action}:user:${key}`;
  const ipKey = `${action}:ip:${ip}`;

  // Clean up expired entries
  cleanupMemoryEntries(now);

  // Get user attempts
  const userAttempts = memoryRateLimits.get(userKey) || [];
  const validUserAttempts = userAttempts.filter(time => now - time < limits.base.window * 1000);

  // Get IP attempts
  const ipAttempts = memoryRateLimits.get(ipKey) || [];
  const validIpAttempts = ipAttempts.filter(time => now - time < limits.ipWindow * 1000);

  // Check limits
  let isBlocked = false;
  let lockoutTime: number | undefined;
  let reason: ProgressiveRateLimitResult['reason'];

  if (validIpAttempts.length >= limits.ipGlobal.limit) {
    isBlocked = true;
    lockoutTime = limits.ipGlobal.window;
    reason = 'ip_limit';
  } else if (validUserAttempts.length >= limits.base.limit) {
    const progressiveAttempts = userAttempts.filter(time => now - time < limits.progressive.window * 1000);
    if (progressiveAttempts.length >= limits.progressive.limit) {
      isBlocked = true;
      lockoutTime = limits.progressive.window;
      reason = 'progressive_limit';
    } else {
      lockoutTime = limits.progressive.window;
      reason = 'progressive_limit';
    }
  }

  if (!isBlocked) {
    // Record this attempt
    validUserAttempts.push(now);
    validIpAttempts.push(now);
    memoryRateLimits.set(userKey, validUserAttempts);
    memoryRateLimits.set(ipKey, validIpAttempts);
  }

  return {
    success: !isBlocked,
    remaining: Math.max(0, limits.base.limit - validUserAttempts.length),
    lockoutTime: isBlocked ? lockoutTime : undefined,
    reason: isBlocked ? reason : undefined,
  };
}

/**
 * Clean up expired memory entries to prevent memory leaks.
 */
function cleanupMemoryEntries(now: number): void {
  const cutoffTime = now - (24 * 60 * 60 * 1000); // 24 hours ago

  for (const [key, attempts] of memoryRateLimits.entries()) {
    const validAttempts = attempts.filter(time => time > cutoffTime);
    if (validAttempts.length === 0) {
      memoryRateLimits.delete(key);
    } else {
      memoryRateLimits.set(key, validAttempts);
    }
  }
}

/**
 * Check rate limit status without incrementing counters.
 *
 * @param key - Unique identifier for the rate limit
 * @param action - Type of authentication action
 * @param ip - Client IP address
 * @returns Current rate limit status
 */
export async function checkRateLimitStatus(
  key: string,
  action: keyof typeof PROGRESSIVE_AUTH_RATE_LIMITS,
  ip: string
): Promise<ProgressiveRateLimitResult> {
  const redis = await getRedisClient();
  const limits = PROGRESSIVE_AUTH_RATE_LIMITS[action];

  try {
    if (redis) {
      const userKey = `auth:${action}:user:${key}`;
      const ipKey = `auth:${action}:ip:${ip}`;

      const [userAttempts, ipAttempts] = await Promise.all([
        redis.get(userKey) || 0,
        redis.get(ipKey) || 0,
      ]);

      const isBlocked = userAttempts > limits.base.limit || ipAttempts > limits.ipGlobal.limit;
      let reason: ProgressiveRateLimitResult['reason'];
      let lockoutTime: number | undefined;

      if (ipAttempts > limits.ipGlobal.limit) {
        reason = 'ip_limit';
        lockoutTime = limits.ipGlobal.window;
      } else if (userAttempts > limits.base.limit) {
        reason = 'progressive_limit';
        lockoutTime = limits.progressive.window;
      }

      return {
        success: !isBlocked,
        remaining: Math.max(0, limits.base.limit - userAttempts),
        lockoutTime: isBlocked ? lockoutTime : undefined,
        reason: isBlocked ? reason : undefined,
      };
    } else {
      return await memoryProgressiveRateLimit(key, action, ip);
    }
  } catch (error) {
    console.warn('Rate limit status check failed:', error);
    return { success: true, remaining: limits.base.limit };
  }
}

/**
 * Reset rate limit for a user (admin function).
 *
 * @param key - Unique identifier for the rate limit
 * @param action - Type of authentication action
 * @returns Whether the reset was successful
 */
export async function resetProgressiveRateLimit(
  key: string,
  action: keyof typeof PROGRESSIVE_AUTH_RATE_LIMITS
): Promise<boolean> {
  const redis = await getRedisClient();

  try {
    if (redis) {
      const userKey = `auth:${action}:user:${key}`;
      await redis.del(userKey);
      return true;
    } else {
      const userKey = `${action}:user:${key}`;
      return memoryRateLimits.delete(userKey);
    }
  } catch (error) {
    console.warn('Rate limit reset failed:', error);
    return false;
  }
}

/**
 * Get rate limit headers for HTTP responses.
 *
 * @param result - Rate limit result
 * @returns HTTP headers object
 */
export function getProgressiveRateLimitHeaders(result: ProgressiveRateLimitResult): Record<string, string> {
  const headers: Record<string, string> = {
    'X-RateLimit-Remaining': result.remaining.toString(),
  };

  if (result.lockoutTime) {
    headers['X-RateLimit-Reset'] = Math.ceil((Date.now() + result.lockoutTime * 1000) / 1000).toString();
    headers['Retry-After'] = result.lockoutTime.toString();
  }

  if (result.reason) {
    headers['X-RateLimit-Reason'] = result.reason;
  }

  return headers;
}

/**
 * Rate limiting middleware for Next.js API routes.
 *
 * @param action - Authentication action type
 * @returns Middleware function
 */
export function createAuthRateLimitMiddleware(action: keyof typeof PROGRESSIVE_AUTH_RATE_LIMITS) {
  return async function rateLimitMiddleware(
    key: string,
    ip: string
  ): Promise<ProgressiveRateLimitResult> {
    return await progressiveRateLimit(key, action, ip);
  };
}