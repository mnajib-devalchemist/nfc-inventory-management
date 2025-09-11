/**
 * NextAuth.js API routes for authentication.
 * 
 * This file handles all authentication-related API endpoints including
 * sign-in, sign-out, callback handling, and session management.
 * 
 * @route GET,POST /api/auth/[...nextauth]
 * @access Public authentication endpoints
 * @since 1.0.0
 */

import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth/config';

/**
 * NextAuth.js handler for all authentication routes.
 * 
 * Handles the following endpoints:
 * - GET/POST /api/auth/signin - Sign in page and processing
 * - GET/POST /api/auth/signout - Sign out processing  
 * - GET/POST /api/auth/callback/[provider] - OAuth callbacks
 * - GET /api/auth/session - Current session data
 * - GET /api/auth/csrf - CSRF token
 * - GET /api/auth/providers - Available providers
 * 
 * @param request - Next.js request object
 * @returns Authentication response based on the endpoint
 */
const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };