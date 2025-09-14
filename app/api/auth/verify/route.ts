/**
 * Email verification API endpoint.
 *
 * This endpoint handles email verification for new user accounts with:
 * - Secure token validation using timing-safe comparison
 * - Progressive rate limiting to prevent abuse
 * - Automatic account activation upon successful verification
 * - Comprehensive security logging
 *
 * @route POST /api/auth/verify
 * @access Public with rate limiting
 * @since 1.6.0
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyToken } from '@/lib/utils/password-hash';
import { progressiveRateLimit, getProgressiveRateLimitHeaders } from '@/lib/utils/progressive-rate-limit';
import { EmailVerificationSchema, formatAuthValidationErrors } from '@/lib/validation/auth';
import { auth } from '@/lib/auth/config';

/**
 * Handle email verification with security validation.
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const ip = request.headers.get('x-forwarded-for') ||
            request.headers.get('x-real-ip') ||
            'unknown';

  try {
    // Parse request body
    const body = await request.json();

    // QA SECURITY: Input validation
    const validationResult = EmailVerificationSchema.safeParse(body);
    if (!validationResult.success) {
      const errors = formatAuthValidationErrors(validationResult.error);
      console.warn('Email verification validation failed', {
        errors,
        ip,
        timestamp: new Date().toISOString(),
      });

      return NextResponse.json(
        {
          success: false,
          errors,
          message: 'Invalid verification token.',
        },
        { status: 400 }
      );
    }

    const { token } = validationResult.data;

    // QA SECURITY: Progressive rate limiting by IP
    const rateLimitResult = await progressiveRateLimit(ip, 'emailVerification', ip);
    if (!rateLimitResult.success) {
      console.warn('Email verification rate limit exceeded', {
        ip,
        reason: rateLimitResult.reason,
        lockoutTime: rateLimitResult.lockoutTime,
      });

      const headers = getProgressiveRateLimitHeaders(rateLimitResult);
      return NextResponse.json(
        {
          success: false,
          error: 'Too many verification attempts. Please try again later.',
          lockoutTime: rateLimitResult.lockoutTime,
        },
        { status: 429, headers }
      );
    }

    // Find verification token in database
    const storedToken = await prisma.verificationToken.findFirst({
      where: {
        type: 'email_verification',
        expires: {
          gt: new Date(), // Token must not be expired
        },
      },
      orderBy: {
        expires: 'desc', // Get the most recent token first
      },
    });

    if (!storedToken) {
      console.warn('Invalid or expired verification token', {
        ip,
        timestamp: new Date().toISOString(),
      });

      return NextResponse.json(
        {
          success: false,
          error: 'Invalid or expired verification token.',
        },
        { status: 400 }
      );
    }

    // QA SECURITY: Verify token using timing-safe comparison
    const isValidToken = await verifyToken(token, storedToken.token);
    if (!isValidToken) {
      console.warn('Token verification failed', {
        identifier: storedToken.identifier,
        ip,
        timestamp: new Date().toISOString(),
      });

      return NextResponse.json(
        {
          success: false,
          error: 'Invalid verification token.',
        },
        { status: 400 }
      );
    }

    // Find user by email from token
    const user = await prisma.user.findUnique({
      where: { email: storedToken.identifier },
    });

    if (!user) {
      console.warn('User not found for verification token', {
        identifier: storedToken.identifier,
        ip,
        timestamp: new Date().toISOString(),
      });

      return NextResponse.json(
        {
          success: false,
          error: 'User account not found.',
        },
        { status: 400 }
      );
    }

    // Check if email is already verified
    if (user.emailVerified) {
      console.log('Email already verified', {
        userId: user.id,
        email: user.email,
        ip,
        timestamp: new Date().toISOString(),
      });

      return NextResponse.json(
        {
          success: true,
          message: 'Email address is already verified.',
          alreadyVerified: true,
        },
        { status: 200 }
      );
    }

    // Verify email and clean up token in transaction
    await prisma.$transaction(async (tx) => {
      // Mark email as verified
      await tx.user.update({
        where: { id: user.id },
        data: {
          emailVerified: new Date(),
          emailVerifiedIp: ip,
        },
      });

      // Delete used verification token
      await tx.verificationToken.delete({
        where: { id: storedToken.id },
      });

      // Clean up any other expired tokens for this user
      await tx.verificationToken.deleteMany({
        where: {
          identifier: storedToken.identifier,
          expires: {
            lte: new Date(),
          },
        },
      });

      // QA PRIVACY: Log email verification consent
      await tx.userConsent.create({
        data: {
          userId: user.id,
          consentType: 'email_verified',
          granted: true,
          grantedAt: new Date(),
          ipAddress: ip,
          userAgent: request.headers.get('user-agent') || 'unknown',
        },
      });
    });

    // QA MONITORING: Log successful email verification
    console.log('Email verification successful', {
      userId: user.id,
      email: user.email,
      ip,
      userAgent: request.headers.get('user-agent'),
      duration: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json(
      {
        success: true,
        message: 'Email address verified successfully! You can now sign in.',
        verified: true,
      },
      { status: 200 }
    );

  } catch (error) {
    console.error('Email verification error:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      ip,
      duration: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json(
      {
        success: false,
        error: 'Email verification failed. Please try again.',
      },
      { status: 500 }
    );
  }
}

/**
 * Get verification status for current user (authenticated endpoint).
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        email: true,
        emailVerified: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      emailVerified: !!user.emailVerified,
      email: user.email,
    });

  } catch (error) {
    console.error('Verification status check error:', error);
    return NextResponse.json(
      { error: 'Failed to check verification status' },
      { status: 500 }
    );
  }
}

/**
 * Handle unsupported HTTP methods.
 */
export async function PUT() {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405 }
  );
}

export async function DELETE() {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405 }
  );
}