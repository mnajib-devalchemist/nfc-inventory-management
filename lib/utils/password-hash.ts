/**
 * Secure password hashing utilities using bcrypt.
 *
 * This module provides QA-mandated secure password hashing functionality
 * using bcrypt with 14+ rounds for enhanced security. Includes timing-safe
 * comparison and secure token generation for password resets.
 *
 * @category Security
 * @since 1.6.0
 */

import { compare, hash, genSalt } from 'bcryptjs';
import { randomBytes, timingSafeEqual } from 'crypto';
import { isDevelopment } from '@/lib/utils/env';

/**
 * QA-mandated bcrypt configuration.
 */
export const BCRYPT_CONFIG = {
  /** Minimum salt rounds for production (QA requirement: 14+ rounds) */
  PRODUCTION_ROUNDS: 14,
  /** Salt rounds for development (faster for dev workflow) */
  DEVELOPMENT_ROUNDS: 10,
  /** Maximum password length to prevent DoS attacks */
  MAX_PASSWORD_LENGTH: 128,
} as const;

/**
 * Password hash result interface.
 */
export interface PasswordHashResult {
  hash: string;
  rounds: number;
  timestamp: Date;
}

/**
 * Hash a password using bcrypt with QA-mandated security settings.
 *
 * Uses 14+ salt rounds in production for enhanced security against
 * brute force attacks. Includes DoS protection by limiting password length.
 *
 * @param password - Plain text password to hash
 * @returns Promise resolving to password hash result
 *
 * @throws Error if password exceeds maximum length
 *
 * @example Password hashing
 * ```typescript
 * const result = await hashPassword('MySecurePassword123!');
 * console.log(`Hash created with ${result.rounds} rounds`);
 * ```
 */
export async function hashPassword(password: string): Promise<PasswordHashResult> {
  // QA SECURITY: Prevent DoS attacks with overly long passwords
  if (password.length > BCRYPT_CONFIG.MAX_PASSWORD_LENGTH) {
    throw new Error(`Password exceeds maximum length of ${BCRYPT_CONFIG.MAX_PASSWORD_LENGTH} characters`);
  }

  const rounds = isDevelopment
    ? BCRYPT_CONFIG.DEVELOPMENT_ROUNDS
    : BCRYPT_CONFIG.PRODUCTION_ROUNDS;

  const salt = await genSalt(rounds);
  const hashedPassword = await hash(password, salt);

  return {
    hash: hashedPassword,
    rounds,
    timestamp: new Date(),
  };
}

/**
 * Verify a password against its bcrypt hash using timing-safe comparison.
 *
 * Implements timing-safe password verification to prevent timing attacks.
 * Includes additional security measures against various attack vectors.
 *
 * @param password - Plain text password to verify
 * @param hash - Stored bcrypt hash to verify against
 * @returns Promise resolving to verification result
 *
 * @example Password verification
 * ```typescript
 * const isValid = await verifyPassword('MyPassword123!', user.passwordHash);
 * if (isValid) {
 *   // Password is correct
 * }
 * ```
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    // QA SECURITY: Prevent DoS attacks with overly long passwords
    if (password.length > BCRYPT_CONFIG.MAX_PASSWORD_LENGTH) {
      return false;
    }

    // QA SECURITY: Basic input validation
    if (!password || !hash) {
      return false;
    }

    // QA SECURITY: Validate bcrypt hash format
    if (!hash.startsWith('$2a$') && !hash.startsWith('$2b$') && !hash.startsWith('$2y$')) {
      return false;
    }

    return await compare(password, hash);
  } catch (error) {
    // QA SECURITY: Log security-related errors for monitoring
    console.error('Password verification error:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
      hashFormat: hash.substring(0, 4), // Only log format, not actual hash
    });
    return false;
  }
}

/**
 * Check if a password hash needs rehashing (stronger security).
 *
 * Determines if an existing password hash should be updated to use
 * stronger security settings (higher rounds) when user logs in.
 *
 * @param hash - Existing bcrypt hash
 * @returns Whether the hash should be rehashed
 *
 * @example Hash strength check
 * ```typescript
 * if (needsRehashing(user.passwordHash)) {
 *   const newHash = await hashPassword(plainPassword);
 *   await updateUserPassword(user.id, newHash.hash);
 * }
 * ```
 */
export function needsRehashing(hash: string): boolean {
  try {
    // Extract rounds from bcrypt hash
    const parts = hash.split('$');
    if (parts.length < 4) return false;

    const rounds = parseInt(parts[2], 10);
    const targetRounds = isDevelopment
      ? BCRYPT_CONFIG.DEVELOPMENT_ROUNDS
      : BCRYPT_CONFIG.PRODUCTION_ROUNDS;

    return rounds < targetRounds;
  } catch {
    return true; // If we can't parse it, assume it needs rehashing
  }
}

/**
 * Generate a cryptographically secure token for password resets.
 *
 * Creates a secure random token using Node.js crypto module.
 * Tokens are URL-safe and suitable for email transmission.
 *
 * @param length - Token length in bytes (default: 32)
 * @returns Promise resolving to secure token
 *
 * @example Token generation
 * ```typescript
 * const resetToken = await generateSecureToken();
 * await sendPasswordResetEmail(user.email, resetToken);
 * ```
 */
export async function generateSecureToken(length: number = 32): Promise<string> {
  return new Promise((resolve, reject) => {
    randomBytes(length, (err, buffer) => {
      if (err) {
        reject(new Error('Failed to generate secure token'));
        return;
      }

      // Convert to URL-safe base64
      const token = buffer
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');

      resolve(token);
    });
  });
}

/**
 * Generate a secure hash for tokens (email verification, password reset).
 *
 * Creates a secure hash of tokens for database storage. This prevents
 * token exposure if the database is compromised.
 *
 * @param token - Plain token to hash
 * @returns Promise resolving to token hash
 *
 * @example Token hashing
 * ```typescript
 * const tokenHash = await hashToken(plainToken);
 * await storeVerificationToken(user.id, tokenHash);
 * ```
 */
export async function hashToken(token: string): Promise<string> {
  return new Promise((resolve, reject) => {
    // Use a simpler hash for tokens (they're already random)
    const hash = require('crypto')
      .createHash('sha256')
      .update(token)
      .digest('hex');
    resolve(hash);
  });
}

/**
 * Verify a token against its hash using timing-safe comparison.
 *
 * @param token - Plain token to verify
 * @param hash - Stored token hash
 * @returns Promise resolving to verification result
 */
export async function verifyToken(token: string, hash: string): Promise<boolean> {
  try {
    const tokenHash = await hashToken(token);

    // QA SECURITY: Timing-safe comparison to prevent timing attacks
    const tokenBuffer = Buffer.from(tokenHash, 'hex');
    const hashBuffer = Buffer.from(hash, 'hex');

    // Ensure buffers are the same length
    if (tokenBuffer.length !== hashBuffer.length) {
      return false;
    }

    return timingSafeEqual(tokenBuffer, hashBuffer);
  } catch (error) {
    console.error('Token verification error:', error);
    return false;
  }
}

/**
 * Password strength assessment for additional security.
 */
export interface PasswordStrengthAssessment {
  score: number;
  isStrong: boolean;
  warnings: string[];
  suggestions: string[];
}

/**
 * Assess password strength beyond basic validation.
 *
 * Provides additional security assessment including common pattern
 * detection and strength recommendations.
 *
 * @param password - Password to assess
 * @returns Strength assessment result
 */
export function assessPasswordStrength(password: string): PasswordStrengthAssessment {
  const warnings: string[] = [];
  const suggestions: string[] = [];
  let score = 0;

  if (!password) {
    return {
      score: 0,
      isStrong: false,
      warnings: ['Password is required'],
      suggestions: ['Create a strong password'],
    };
  }

  // Length assessment
  if (password.length >= 8) score += 1;
  else warnings.push('Password is too short');

  if (password.length >= 12) score += 1;
  else suggestions.push('Use 12+ characters for better security');

  // Character variety
  if (/[a-z]/.test(password)) score += 1;
  else warnings.push('Add lowercase letters');

  if (/[A-Z]/.test(password)) score += 1;
  else warnings.push('Add uppercase letters');

  if (/[0-9]/.test(password)) score += 1;
  else warnings.push('Add numbers');

  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  else warnings.push('Add special characters');

  // Pattern detection
  const commonPatterns = [
    { pattern: /(.)\1{2,}/, message: 'Avoid repeating characters' },
    { pattern: /123|abc|qwe/i, message: 'Avoid sequential patterns' },
    { pattern: /password|123456|qwerty/i, message: 'Avoid common passwords' },
  ];

  commonPatterns.forEach(({ pattern, message }) => {
    if (pattern.test(password)) {
      score = Math.max(0, score - 1);
      warnings.push(message);
    }
  });

  const isStrong = score >= 6 && warnings.length === 0;

  if (!isStrong && suggestions.length === 0) {
    suggestions.push('Consider using a password manager');
  }

  return {
    score,
    isStrong,
    warnings,
    suggestions,
  };
}

/**
 * Security metrics for monitoring.
 */
export interface PasswordSecurityMetrics {
  totalHashes: number;
  averageRounds: number;
  rehashingNeeded: number;
  weakPasswords: number;
}

/**
 * Get password security metrics for monitoring (admin use).
 *
 * Provides security metrics for system monitoring and compliance reporting.
 * Should only be used by administrative functions.
 *
 * @returns Promise resolving to security metrics
 */
export async function getPasswordSecurityMetrics(): Promise<PasswordSecurityMetrics> {
  // This would typically query the database for metrics
  // Implementation depends on your database structure
  return {
    totalHashes: 0, // Count of user password hashes
    averageRounds: BCRYPT_CONFIG.PRODUCTION_ROUNDS,
    rehashingNeeded: 0, // Count of hashes that need updating
    weakPasswords: 0, // Count of passwords that fail strength assessment
  };
}