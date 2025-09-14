/**
 * Authentication validation schemas using Zod.
 *
 * This module provides comprehensive validation schemas for authentication forms,
 * password strength requirements, and security-focused input validation.
 * Implements QA-mandated security standards with real-time validation support.
 *
 * @category Validation
 * @since 1.6.0
 */

import { z } from 'zod';

/**
 * Password validation schema with enhanced security requirements.
 *
 * Implements QA-mandated password policy with minimum 8 characters,
 * requiring uppercase, lowercase, numbers, and special characters.
 *
 * @example Password validation
 * ```typescript
 * const result = PasswordSchema.safeParse('MyPassword123!');
 * if (!result.success) {
 *   console.log(result.error.issues);
 * }
 * ```
 */
export const PasswordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must not exceed 128 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character')
  .refine(
    (password) => !password.includes(' '),
    'Password cannot contain spaces'
  )
  .refine(
    (password) => {
      // Check for common weak patterns
      const weakPatterns = [
        /123456/,
        /password/i,
        /qwerty/i,
        /admin/i,
        /letmein/i,
        /welcome/i,
      ];
      return !weakPatterns.some(pattern => pattern.test(password));
    },
    'Password cannot contain common weak patterns'
  );

/**
 * Email validation schema with enhanced security checks.
 */
export const EmailSchema = z
  .string()
  .email('Please enter a valid email address')
  .min(3, 'Email must be at least 3 characters')
  .max(254, 'Email must not exceed 254 characters')
  .toLowerCase()
  .refine(
    (email) => {
      // Additional email validation for security
      const blockedDomains = ['tempmail.com', '10minutemail.com', 'guerrillamail.com'];
      const domain = email.split('@')[1];
      return !blockedDomains.includes(domain);
    },
    'Temporary email addresses are not allowed'
  );

/**
 * User registration form validation schema.
 *
 * Implements comprehensive validation for user registration including
 * password confirmation, terms acceptance, and security checks.
 */
export const RegisterSchema = z
  .object({
    email: EmailSchema,
    password: PasswordSchema,
    confirmPassword: z.string().min(1, 'Please confirm your password'),
    name: z
      .string()
      .min(1, 'Name is required')
      .max(100, 'Name must not exceed 100 characters')
      .regex(/^[a-zA-Z\s\-']+$/, 'Name can only contain letters, spaces, hyphens, and apostrophes')
      .trim(),
    acceptTerms: z
      .boolean()
      .refine((val) => val === true, 'You must accept the terms and conditions'),
    acceptPrivacy: z
      .boolean()
      .refine((val) => val === true, 'You must accept the privacy policy'),
    marketingConsent: z.boolean().optional(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

/**
 * User login form validation schema.
 */
export const LoginSchema = z.object({
  email: EmailSchema,
  password: z.string().min(1, 'Password is required'),
  rememberMe: z.boolean().optional().default(false),
});

/**
 * Password reset request validation schema.
 */
export const PasswordResetRequestSchema = z.object({
  email: EmailSchema,
});

/**
 * Password reset confirmation validation schema.
 */
export const PasswordResetSchema = z
  .object({
    token: z.string().min(1, 'Reset token is required'),
    password: PasswordSchema,
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

/**
 * Password change validation schema for authenticated users.
 */
export const PasswordChangeSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: PasswordSchema,
    confirmNewPassword: z.string().min(1, 'Please confirm your new password'),
  })
  .refine((data) => data.newPassword === data.confirmNewPassword, {
    message: "New passwords don't match",
    path: ['confirmNewPassword'],
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: 'New password must be different from current password',
    path: ['newPassword'],
  });

/**
 * Email verification token validation schema.
 */
export const EmailVerificationSchema = z.object({
  token: z.string().min(1, 'Verification token is required'),
});

/**
 * User profile update validation schema.
 */
export const ProfileUpdateSchema = z.object({
  name: z
    .string()
    .min(1, 'Name is required')
    .max(100, 'Name must not exceed 100 characters')
    .regex(/^[a-zA-Z\s\-']+$/, 'Name can only contain letters, spaces, hyphens, and apostrophes')
    .trim(),
  email: EmailSchema,
});

/**
 * Password strength levels for real-time feedback.
 */
export enum PasswordStrength {
  VERY_WEAK = 0,
  WEAK = 1,
  FAIR = 2,
  GOOD = 3,
  STRONG = 4,
}

/**
 * Calculate password strength for real-time feedback.
 *
 * @param password - Password to evaluate
 * @returns Password strength level and feedback
 */
export function calculatePasswordStrength(password: string): {
  strength: PasswordStrength;
  score: number;
  feedback: string[];
  passed: boolean;
} {
  if (!password) {
    return {
      strength: PasswordStrength.VERY_WEAK,
      score: 0,
      feedback: ['Enter a password'],
      passed: false,
    };
  }

  const feedback: string[] = [];
  let score = 0;

  // Length check
  if (password.length >= 8) {
    score += 1;
  } else {
    feedback.push('At least 8 characters');
  }

  // Character type checks
  if (/[a-z]/.test(password)) {
    score += 1;
  } else {
    feedback.push('Add lowercase letters');
  }

  if (/[A-Z]/.test(password)) {
    score += 1;
  } else {
    feedback.push('Add uppercase letters');
  }

  if (/[0-9]/.test(password)) {
    score += 1;
  } else {
    feedback.push('Add numbers');
  }

  if (/[^A-Za-z0-9]/.test(password)) {
    score += 1;
  } else {
    feedback.push('Add special characters');
  }

  // Bonus points for length
  if (password.length >= 12) score += 1;
  if (password.length >= 16) score += 1;

  // Penalty for common patterns
  const weakPatterns = [/123456/, /password/i, /qwerty/i];
  if (weakPatterns.some(pattern => pattern.test(password))) {
    score = Math.max(0, score - 2);
    feedback.push('Avoid common patterns');
  }

  // Determine strength level
  let strength: PasswordStrength;
  if (score <= 1) strength = PasswordStrength.VERY_WEAK;
  else if (score <= 2) strength = PasswordStrength.WEAK;
  else if (score <= 3) strength = PasswordStrength.FAIR;
  else if (score <= 4) strength = PasswordStrength.GOOD;
  else strength = PasswordStrength.STRONG;

  return {
    strength,
    score,
    feedback: feedback.length > 0 ? feedback : ['Password meets requirements'],
    passed: score >= 5, // All basic requirements met
  };
}

/**
 * Validation error types for authentication forms.
 */
export interface AuthFormErrors {
  email?: string[];
  password?: string[];
  confirmPassword?: string[];
  name?: string[];
  currentPassword?: string[];
  newPassword?: string[];
  confirmNewPassword?: string[];
  token?: string[];
  acceptTerms?: string[];
  acceptPrivacy?: string[];
  _form?: string[];
}

/**
 * Transform Zod validation errors to form-friendly format.
 *
 * @param error - Zod validation error
 * @returns Formatted error object for forms
 */
export function formatAuthValidationErrors(error: z.ZodError): AuthFormErrors {
  const formatted: AuthFormErrors = {};

  error.issues.forEach((issue) => {
    const path = issue.path[0] as string;
    if (!formatted[path as keyof AuthFormErrors]) {
      formatted[path as keyof AuthFormErrors] = [];
    }
    formatted[path as keyof AuthFormErrors]!.push(issue.message);
  });

  return formatted;
}

/**
 * Type definitions for form data.
 */
export type RegisterFormData = z.infer<typeof RegisterSchema>;
export type LoginFormData = z.infer<typeof LoginSchema>;
export type PasswordResetRequestData = z.infer<typeof PasswordResetRequestSchema>;
export type PasswordResetData = z.infer<typeof PasswordResetSchema>;
export type PasswordChangeData = z.infer<typeof PasswordChangeSchema>;
export type EmailVerificationData = z.infer<typeof EmailVerificationSchema>;
export type ProfileUpdateData = z.infer<typeof ProfileUpdateSchema>;