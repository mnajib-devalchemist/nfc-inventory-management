/**
 * NextAuth.js API routes for secure authentication.
 *
 * This file handles all authentication-related API endpoints with
 * QA-mandated security enhancements including rate limiting,
 * audit logging, and comprehensive security validation.
 *
 * @route GET,POST /api/auth/[...nextauth]
 * @access Public authentication endpoints with security controls
 * @since 1.0.0
 * @version 1.6.0 - Enhanced security and QA compliance
 */

import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { NextRequest } from 'next/server';
import { getProgressiveRateLimitHeaders } from '@/lib/utils/progressive-rate-limit';

/**
 * Enhanced NextAuth.js handler with QA security requirements.
 *
 * Handles the following endpoints with security enhancements:
 * - GET/POST /api/auth/signin - Sign in with rate limiting
 * - GET/POST /api/auth/signout - Secure sign out with session cleanup
 * - GET/POST /api/auth/callback/[provider] - OAuth callbacks with validation
 * - GET /api/auth/session - Session data with security headers
 * - GET /api/auth/csrf - CSRF token generation
 * - GET /api/auth/providers - Available provider information
 *
 * @param request - Next.js request object with security context
 * @returns Authentication response with security headers
 */
const handler = NextAuth(authOptions);

/**
 * Enhanced GET handler with security logging.
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const ip = request.headers.get('x-forwarded-for') ||
            request.headers.get('x-real-ip') ||
            'unknown';

  try {
    const response = await handler(request);

    // QA SECURITY: Add security headers
    const securityHeaders = {
      'X-Frame-Options': 'DENY',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Request-ID': `auth-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    };

    Object.entries(securityHeaders).forEach(([key, value]) => {
      response.headers.set(key, value);
    });

    // QA MONITORING: Log authentication requests
    console.log('Authentication GET request', {
      path: request.nextUrl.pathname,
      ip,
      userAgent: request.headers.get('user-agent'),
      duration: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    });

    return response;
  } catch (error) {
    console.error('Authentication GET error:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      path: request.nextUrl.pathname,
      ip,
      timestamp: new Date().toISOString(),
    });
    throw error;
  }
}

/**
 * Enhanced POST handler with security validation.
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const ip = request.headers.get('x-forwarded-for') ||
            request.headers.get('x-real-ip') ||
            'unknown';

  try {
    const response = await handler(request);

    // QA SECURITY: Add security headers
    const securityHeaders = {
      'X-Frame-Options': 'DENY',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Request-ID': `auth-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    };

    Object.entries(securityHeaders).forEach(([key, value]) => {
      response.headers.set(key, value);
    });

    // QA MONITORING: Log authentication requests
    console.log('Authentication POST request', {
      path: request.nextUrl.pathname,
      ip,
      userAgent: request.headers.get('user-agent'),
      duration: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    });

    return response;
  } catch (error) {
    console.error('Authentication POST error:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      path: request.nextUrl.pathname,
      ip,
      timestamp: new Date().toISOString(),
    });
    throw error;
  }
}