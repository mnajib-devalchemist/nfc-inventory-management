/**
 * Next.js middleware for authentication and route protection.
 * 
 * This middleware handles authentication checks, session validation,
 * and route protection for the Digital Inventory Management System.
 * 
 * @category Middleware
 * @since 1.0.0
 */

import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';
import { checkRateLimit, rateLimitConfigs, getClientIP } from '@/lib/utils/rateLimiter';

/**
 * Authentication middleware using NextAuth.js.
 * 
 * Protects routes that require authentication and redirects
 * unauthenticated users to the login page.
 * 
 * @param request - Next.js request object with authentication info
 * @returns Response or redirect based on authentication status
 */
export default withAuth(
  function middleware(request) {
    const { pathname } = request.nextUrl;
    const token = request.nextauth.token;
    const clientIP = getClientIP(request);

    // Apply rate limiting to authentication endpoints
    if (pathname.startsWith('/api/auth') && request.method === 'POST') {
      const rateLimitResult = checkRateLimit(clientIP, rateLimitConfigs.auth);
      
      if (!rateLimitResult.success) {
        return new NextResponse(
          JSON.stringify({
            error: 'Too many authentication attempts',
            retryAfter: rateLimitResult.resetTime,
          }),
          {
            status: 429,
            headers: {
              'Content-Type': 'application/json',
              'Retry-After': rateLimitResult.resetTime.toString(),
              'X-RateLimit-Limit': rateLimitResult.limit.toString(),
              'X-RateLimit-Remaining': '0',
              'X-RateLimit-Reset': rateLimitResult.resetTime.toString(),
            },
          }
        );
      }
    }

    // Apply rate limiting to API endpoints
    if (pathname.startsWith('/api/') && !pathname.startsWith('/api/auth')) {
      const rateLimitResult = checkRateLimit(clientIP, rateLimitConfigs.api);
      
      if (!rateLimitResult.success) {
        return new NextResponse(
          JSON.stringify({
            error: 'Rate limit exceeded',
            retryAfter: rateLimitResult.resetTime,
          }),
          {
            status: 429,
            headers: {
              'Content-Type': 'application/json',
              'Retry-After': rateLimitResult.resetTime.toString(),
              'X-RateLimit-Limit': rateLimitResult.limit.toString(),
              'X-RateLimit-Remaining': '0',
              'X-RateLimit-Reset': rateLimitResult.resetTime.toString(),
            },
          }
        );
      }

      // Add rate limit headers to successful requests
      const response = NextResponse.next();
      response.headers.set('X-RateLimit-Limit', rateLimitResult.limit.toString());
      response.headers.set('X-RateLimit-Remaining', rateLimitResult.remaining.toString());
      response.headers.set('X-RateLimit-Reset', rateLimitResult.resetTime.toString());
    }

    // Allow access to auth pages when not authenticated
    if (!token && (pathname.startsWith('/login') || pathname.startsWith('/register'))) {
      return NextResponse.next();
    }

    // Redirect authenticated users away from auth pages
    if (token && (pathname.startsWith('/login') || pathname.startsWith('/register'))) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }

    // Allow access to protected pages when authenticated
    if (token && (pathname.startsWith('/dashboard') || pathname.startsWith('/inventory'))) {
      return NextResponse.next();
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const { pathname } = req.nextUrl;

        // Allow access to public pages
        if (pathname === '/' || pathname.startsWith('/api/auth')) {
          return true;
        }

        // Allow access to auth pages
        if (pathname.startsWith('/login') || pathname.startsWith('/register')) {
          return true;
        }

        // Require authentication for dashboard and protected routes
        if (pathname.startsWith('/dashboard') || pathname.startsWith('/inventory')) {
          return !!token;
        }

        // Default to allowing access
        return true;
      },
    },
  }
);

/**
 * Configuration for which routes the middleware should run on.
 * 
 * Includes all protected routes and authentication pages to ensure
 * proper access control throughout the application.
 */
export const config = {
  matcher: [
    // Protected dashboard routes
    '/dashboard/:path*',
    '/inventory/:path*',
    '/search/:path*',
    '/locations/:path*',
    '/family/:path*',
    '/settings/:path*',
    
    // Authentication routes
    '/login',
    '/register',
    
    // API routes (excluding NextAuth.js routes)
    '/api/((?!auth).)*',
  ],
};