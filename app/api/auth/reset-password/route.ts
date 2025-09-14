/**
 * Password reset API endpoint.
 *
 * This endpoint handles password reset requests and confirmations with:
 * - Progressive rate limiting to prevent abuse
 * - Secure token generation and validation
 * - Password strength validation
 * - Comprehensive security logging
 *
 * @route POST /api/auth/reset-password
 * @access Public with rate limiting
 * @since 1.6.0
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import {
  generateSecureToken,
  hashToken,
  verifyToken,
  hashPassword
} from '@/lib/utils/password-hash';
import { progressiveRateLimit, getProgressiveRateLimitHeaders } from '@/lib/utils/progressive-rate-limit';
import {
  PasswordResetRequestSchema,
  PasswordResetSchema,
  formatAuthValidationErrors
} from '@/lib/validation/auth';

/**
 * Handle password reset requests and confirmations.
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const ip = request.headers.get('x-forwarded-for') ||
            request.headers.get('x-real-ip') ||
            'unknown';

  try {
    const body = await request.json();
    const { action } = body;

    if (action === 'request') {
      return await handlePasswordResetRequest(body, ip, request, startTime);
    } else if (action === 'confirm') {
      return await handlePasswordResetConfirm(body, ip, request, startTime);
    } else {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid action. Use "request" or "confirm".',
        },
        { status: 400 }
      );
    }

  } catch (error) {
    console.error('Password reset error:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      ip,
      duration: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json(
      {
        success: false,
        error: 'Password reset failed. Please try again.',
      },
      { status: 500 }
    );
  }
}

/**
 * Handle password reset request (send reset email).
 */
async function handlePasswordResetRequest(
  body: any,
  ip: string,
  request: NextRequest,
  startTime: number
): Promise<NextResponse> {
  // QA SECURITY: Input validation
  const validationResult = PasswordResetRequestSchema.safeParse(body);
  if (!validationResult.success) {
    const errors = formatAuthValidationErrors(validationResult.error);
    console.warn('Password reset request validation failed', {
      errors,
      ip,
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json(
      {
        success: false,
        errors,
        message: 'Please provide a valid email address.',
      },
      { status: 400 }
    );
  }

  const { email } = validationResult.data;

  // QA SECURITY: Progressive rate limiting
  const rateLimitResult = await progressiveRateLimit(email, 'passwordReset', ip);
  if (!rateLimitResult.success) {
    console.warn('Password reset rate limit exceeded', {
      email,
      ip,
      reason: rateLimitResult.reason,
      lockoutTime: rateLimitResult.lockoutTime,
    });

    const headers = getProgressiveRateLimitHeaders(rateLimitResult);
    return NextResponse.json(
      {
        success: false,
        error: 'Too many password reset attempts. Please try again later.',
        lockoutTime: rateLimitResult.lockoutTime,
      },
      { status: 429, headers }
    );
  }

  // Find user by email
  const user = await prisma.user.findUnique({
    where: { email },
  });

  // QA SECURITY: Don't reveal if email exists or not
  // Always return success message to prevent email enumeration
  const responseMessage = 'If an account with that email exists, we sent a password reset link.';

  if (!user) {
    console.warn('Password reset requested for non-existent email', {
      email,
      ip,
      timestamp: new Date().toISOString(),
    });

    // Return success message to prevent email enumeration
    return NextResponse.json(
      {
        success: true,
        message: responseMessage,
        emailSent: false,
      },
      { status: 200 }
    );
  }

  // QA SECURITY: Check if account is active
  if (user.deletedAt) {
    console.warn('Password reset requested for deleted account', {
      email,
      ip,
      timestamp: new Date().toISOString(),
    });

    // Return success message to prevent information disclosure
    return NextResponse.json(
      {
        success: true,
        message: responseMessage,
        emailSent: false,
      },
      { status: 200 }
    );
  }

  // QA SECURITY: Generate secure reset token
  const resetToken = await generateSecureToken();
  const resetTokenHash = await hashToken(resetToken);
  const resetExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  // Store reset token
  await prisma.$transaction(async (tx) => {
    // Delete any existing reset tokens for this user
    await tx.verificationToken.deleteMany({
      where: {
        identifier: email,
        type: 'password_reset',
      },
    });

    // Create new reset token
    await tx.verificationToken.create({
      data: {
        identifier: email,
        token: resetTokenHash,
        expires: resetExpiry,
        type: 'password_reset',
      },
    });
  });

  // QA SECURITY: Send password reset email (async - don't block response)
  try {
    await sendPasswordResetEmail(email, resetToken);
  } catch (emailError) {
    console.error('Failed to send password reset email', {
      userId: user.id,
      email,
      error: emailError instanceof Error ? emailError.message : 'Unknown error',
    });
    // Don't fail the request if email fails
  }

  // QA MONITORING: Log password reset request
  console.log('Password reset requested', {
    userId: user.id,
    email,
    ip,
    userAgent: request.headers.get('user-agent'),
    duration: Date.now() - startTime,
    timestamp: new Date().toISOString(),
  });

  return NextResponse.json(
    {
      success: true,
      message: responseMessage,
      emailSent: true,
    },
    { status: 200 }
  );
}

/**
 * Handle password reset confirmation (with new password).
 */
async function handlePasswordResetConfirm(
  body: any,
  ip: string,
  request: NextRequest,
  startTime: number
): Promise<NextResponse> {
  // QA SECURITY: Input validation
  const validationResult = PasswordResetSchema.safeParse(body);
  if (!validationResult.success) {
    const errors = formatAuthValidationErrors(validationResult.error);
    console.warn('Password reset confirmation validation failed', {
      errors,
      ip,
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json(
      {
        success: false,
        errors,
        message: 'Please check your input and try again.',
      },
      { status: 400 }
    );
  }

  const { token, password } = validationResult.data;

  // QA SECURITY: Progressive rate limiting by IP
  const rateLimitResult = await progressiveRateLimit(ip, 'passwordReset', ip);
  if (!rateLimitResult.success) {
    console.warn('Password reset confirmation rate limit exceeded', {
      ip,
      reason: rateLimitResult.reason,
      lockoutTime: rateLimitResult.lockoutTime,
    });

    const headers = getProgressiveRateLimitHeaders(rateLimitResult);
    return NextResponse.json(
      {
        success: false,
        error: 'Too many password reset attempts. Please try again later.',
        lockoutTime: rateLimitResult.lockoutTime,
      },
      { status: 429, headers }
    );
  }

  // Find reset token in database
  const storedToken = await prisma.verificationToken.findFirst({
    where: {
      type: 'password_reset',
      expires: {
        gt: new Date(), // Token must not be expired
      },
    },
    orderBy: {
      expires: 'desc', // Get the most recent token first
    },
  });

  if (!storedToken) {
    console.warn('Invalid or expired password reset token', {
      ip,
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json(
      {
        success: false,
        error: 'Invalid or expired reset token.',
      },
      { status: 400 }
    );
  }

  // QA SECURITY: Verify token using timing-safe comparison
  const isValidToken = await verifyToken(token, storedToken.token);
  if (!isValidToken) {
    console.warn('Password reset token verification failed', {
      identifier: storedToken.identifier,
      ip,
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json(
      {
        success: false,
        error: 'Invalid reset token.',
      },
      { status: 400 }
    );
  }

  // Find user by email from token
  const user = await prisma.user.findUnique({
    where: { email: storedToken.identifier },
  });

  if (!user) {
    console.warn('User not found for password reset token', {
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

  // QA SECURITY: Check if account is active
  if (user.deletedAt) {
    console.warn('Password reset attempted for deleted account', {
      userId: user.id,
      email: user.email,
      ip,
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json(
      {
        success: false,
        error: 'Account is no longer active.',
      },
      { status: 400 }
    );
  }

  // QA SECURITY: Hash new password
  const passwordHashResult = await hashPassword(password);

  // Update password and clean up token in transaction
  await prisma.$transaction(async (tx) => {
    // Update user password
    await tx.user.update({
      where: { id: user.id },
      data: {
        passwordHash: passwordHashResult.hash,
        passwordResetAt: new Date(),
        passwordResetIp: ip,
      },
    });

    // Delete used reset token
    await tx.verificationToken.delete({
      where: { id: storedToken.id },
    });

    // Clean up any other expired tokens for this user
    await tx.verificationToken.deleteMany({
      where: {
        identifier: storedToken.identifier,
        type: 'password_reset',
        expires: {
          lte: new Date(),
        },
      },
    });
  });

  // QA MONITORING: Log successful password reset
  console.log('Password reset successful', {
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
      message: 'Password reset successful! You can now sign in with your new password.',
    },
    { status: 200 }
  );
}

/**
 * Send password reset email to user.
 */
async function sendPasswordResetEmail(email: string, token: string): Promise<void> {
  // TODO: Implement email service integration
  // For now, just log the reset URL
  const resetUrl = `${process.env.NEXTAUTH_URL}/auth/reset-password?token=${token}`;

  console.log('Password reset email required', {
    email,
    resetUrl,
    timestamp: new Date().toISOString(),
  });

  // In production, this would integrate with SendGrid or similar service
  // Example:
  // await emailService.sendPasswordResetEmail(email, resetUrl);
}

/**
 * Handle unsupported HTTP methods.
 */
export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405 }
  );
}

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