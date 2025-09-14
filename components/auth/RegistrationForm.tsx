'use client';

/**
 * Enhanced Registration Form with QA-mandated security and accessibility features.
 *
 * This component implements comprehensive registration functionality with:
 * - Real-time password strength validation
 * - WCAG 2.1 AA accessibility compliance
 * - Mobile-first responsive design
 * - Progressive rate limiting feedback
 * - GDPR-compliant consent management
 *
 * @component
 * @category Authentication Components
 * @since 1.6.0
 */

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { Eye, EyeOff, AlertCircle, CheckCircle, Shield, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
// Progress component will be used for password strength indicator
import {
  RegisterSchema,
  type RegisterFormData,
  calculatePasswordStrength,
  PasswordStrength,
} from '@/lib/validation/auth';
import { cn } from '@/lib/utils';

/**
 * Props for the Registration Form component.
 */
interface RegistrationFormProps {
  /** Additional CSS classes */
  className?: string;
  /** Callback after successful registration */
  onSuccess?: (data: { userId: string; email: string }) => void;
}

/**
 * Password strength meter component.
 */
interface PasswordStrengthMeterProps {
  password: string;
  className?: string;
}

function PasswordStrengthMeter({ password, className }: PasswordStrengthMeterProps) {
  const strength = calculatePasswordStrength(password);

  const getStrengthColor = () => {
    switch (strength.strength) {
      case PasswordStrength.VERY_WEAK:
        return 'bg-red-500';
      case PasswordStrength.WEAK:
        return 'bg-red-400';
      case PasswordStrength.FAIR:
        return 'bg-yellow-500';
      case PasswordStrength.GOOD:
        return 'bg-blue-500';
      case PasswordStrength.STRONG:
        return 'bg-green-500';
      default:
        return 'bg-gray-300';
    }
  };

  const getStrengthText = () => {
    switch (strength.strength) {
      case PasswordStrength.VERY_WEAK:
        return 'Very weak';
      case PasswordStrength.WEAK:
        return 'Weak';
      case PasswordStrength.FAIR:
        return 'Fair';
      case PasswordStrength.GOOD:
        return 'Good';
      case PasswordStrength.STRONG:
        return 'Strong';
      default:
        return 'Enter password';
    }
  };

  return (
    <div className={cn('space-y-2', className)} aria-live="polite">
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-600">Password strength:</span>
        <span className={cn(
          'font-medium',
          strength.passed ? 'text-green-600' : 'text-gray-600'
        )}>
          {getStrengthText()}
        </span>
      </div>

      <div className="w-full bg-gray-200 rounded-full h-1.5">
        <div
          className={cn(
            'h-1.5 rounded-full transition-all duration-300',
            getStrengthColor()
          )}
          style={{ width: `${(strength.score / 7) * 100}%` }}
        />
      </div>

      {strength.feedback.length > 0 && (
        <ul className="text-xs text-gray-600 space-y-1">
          {strength.feedback.map((feedback, index) => (
            <li key={index} className="flex items-center gap-1">
              {strength.passed ? (
                <CheckCircle className="h-3 w-3 text-green-500" aria-hidden="true" />
              ) : (
                <AlertCircle className="h-3 w-3 text-gray-400" aria-hidden="true" />
              )}
              <span>{feedback}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Enhanced Registration Form with QA compliance features.
 */
export function RegistrationForm({ className, onSuccess }: RegistrationFormProps) {
  // Form state
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Accessibility refs
  const errorRef = useRef<HTMLDivElement>(null);
  const successRef = useRef<HTMLDivElement>(null);

  const router = useRouter();

  // React Hook Form setup with enhanced validation
  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
  } = useForm<RegisterFormData>({
    resolver: zodResolver(RegisterSchema),
    mode: 'onBlur', // QA UX: Real-time validation
  });

  const passwordValue = watch('password', '');
  const emailValue = watch('email', '');

  // QA ACCESSIBILITY: Announce messages to screen readers
  useEffect(() => {
    if (error && errorRef.current) {
      errorRef.current.focus();
      announceToScreenReader(`Registration error: ${error}`);
    }
  }, [error]);

  useEffect(() => {
    if (success && successRef.current) {
      successRef.current.focus();
      announceToScreenReader(`Registration successful: ${success}`);
    }
  }, [success]);

  // QA ACCESSIBILITY: Screen reader announcements
  const announceToScreenReader = (message: string) => {
    const announcement = document.createElement('div');
    announcement.setAttribute('aria-live', 'polite');
    announcement.setAttribute('aria-atomic', 'true');
    announcement.className = 'sr-only';
    announcement.textContent = message;
    document.body.appendChild(announcement);

    setTimeout(() => {
      document.body.removeChild(announcement);
    }, 1000);
  };

  /**
   * Handle form submission with enhanced security validation.
   */
  const onSubmit = async (data: RegisterFormData) => {
    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      // QA UX: Announce loading state
      announceToScreenReader('Creating account, please wait');

      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (!response.ok) {
        // QA SECURITY: Handle different error types
        if (response.status === 429) {
          setError(`Too many registration attempts. Please try again later.`);
        } else if (response.status === 409) {
          setError('An account with this email already exists. Please sign in instead.');
        } else if (result.errors) {
          // Handle validation errors
          const errorMessages = Object.entries(result.errors)
            .map(([field, messages]) => `${field}: ${(messages as string[]).join(', ')}`)
            .join('; ');
          setError(errorMessages);
        } else {
          setError(result.error || 'Registration failed. Please try again.');
        }

        announceToScreenReader('Registration failed');
      } else {
        // QA UX: Success feedback
        setSuccess('Registration successful! Please check your email to verify your account.');
        announceToScreenReader('Registration successful, check email for verification');

        // Call success callback
        if (onSuccess) {
          onSuccess({
            userId: result.userId,
            email: data.email,
          });
        }

        // QA UX: Redirect to verification page after delay
        setTimeout(() => {
          router.push('/auth/verify-request?email=' + encodeURIComponent(data.email));
        }, 2000);
      }
    } catch (err: any) {
      console.error('Registration error:', err);
      setError('An unexpected error occurred. Please try again.');
      announceToScreenReader('Registration error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Toggle password visibility with accessibility.
   */
  const togglePasswordVisibility = (field: 'password' | 'confirmPassword') => {
    if (field === 'password') {
      setShowPassword(!showPassword);
      announceToScreenReader(showPassword ? 'Password hidden' : 'Password visible');
    } else {
      setShowConfirmPassword(!showConfirmPassword);
      announceToScreenReader(showConfirmPassword ? 'Confirm password hidden' : 'Confirm password visible');
    }
  };

  return (
    <Card className={cn('w-full max-w-md mx-auto', className)}>
      <CardHeader className="space-y-1 text-center">
        <CardTitle className="text-2xl font-bold tracking-tight flex items-center justify-center gap-2">
          <UserPlus className="h-6 w-6" aria-hidden="true" />
          Create Account
        </CardTitle>
        <CardDescription className="text-sm text-muted-foreground">
          Get started with your digital inventory management
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* QA ACCESSIBILITY: Error announcement region */}
        <div
          ref={errorRef}
          role="alert"
          aria-live="assertive"
          aria-atomic="true"
          className="sr-only"
        >
          {error && `Registration error: ${error}`}
        </div>

        {/* QA ACCESSIBILITY: Success announcement region */}
        <div
          ref={successRef}
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="sr-only"
        >
          {success && `Registration successful: ${success}`}
        </div>

        {/* QA UX: Visible error display */}
        {error && (
          <div
            className="rounded-lg bg-red-50 border border-red-200 p-3 flex items-start gap-2"
            role="alert"
            aria-describedby="error-message"
          >
            <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" aria-hidden="true" />
            <p id="error-message" className="text-sm text-red-700">
              {error}
            </p>
          </div>
        )}

        {/* QA UX: Success display */}
        {success && (
          <div
            className="rounded-lg bg-green-50 border border-green-200 p-3 flex items-start gap-2"
            role="status"
            aria-describedby="success-message"
          >
            <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" aria-hidden="true" />
            <p id="success-message" className="text-sm text-green-700">
              {success}
            </p>
          </div>
        )}

        {/* Main registration form */}
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="space-y-4"
          aria-label="Create account form"
          noValidate
        >
          {/* Name field */}
          <div className="space-y-2">
            <Label htmlFor="name" className="text-sm font-medium">
              Full name <span className="text-red-500" aria-label="required">*</span>
            </Label>
            <Input
              id="name"
              type="text"
              autoComplete="name"
              placeholder="Enter your full name"
              {...register('name')}
              aria-describedby={errors.name ? 'name-error' : undefined}
              aria-invalid={!!errors.name}
              className={cn(
                'h-11', // QA MOBILE: Touch-friendly height
                errors.name && 'border-red-500 focus:border-red-500 focus:ring-red-500'
              )}
              style={{ fontSize: '16px' }} // QA MOBILE: Prevent zoom on iOS
              disabled={isLoading}
            />
            {errors.name && (
              <div id="name-error" role="alert" className="flex items-center gap-1 text-sm text-red-600">
                <AlertCircle className="h-3 w-3" aria-hidden="true" />
                <span>{errors.name.message}</span>
              </div>
            )}
          </div>

          {/* Email field */}
          <div className="space-y-2">
            <Label htmlFor="email" className="text-sm font-medium">
              Email address <span className="text-red-500" aria-label="required">*</span>
            </Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              {...register('email')}
              aria-describedby={errors.email ? 'email-error' : undefined}
              aria-invalid={!!errors.email}
              className={cn(
                'h-11', // QA MOBILE: Touch-friendly height
                errors.email && 'border-red-500 focus:border-red-500 focus:ring-red-500'
              )}
              style={{ fontSize: '16px' }} // QA MOBILE: Prevent zoom on iOS
              disabled={isLoading}
            />
            {errors.email && (
              <div id="email-error" role="alert" className="flex items-center gap-1 text-sm text-red-600">
                <AlertCircle className="h-3 w-3" aria-hidden="true" />
                <span>{errors.email.message}</span>
              </div>
            )}
          </div>

          {/* Password field with strength meter */}
          <div className="space-y-2">
            <Label htmlFor="password" className="text-sm font-medium">
              Password <span className="text-red-500" aria-label="required">*</span>
            </Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="Create a strong password"
                {...register('password')}
                aria-describedby={errors.password ? 'password-error' : 'password-strength'}
                aria-invalid={!!errors.password}
                className={cn(
                  'h-11 pr-10', // QA MOBILE: Touch-friendly height with space for toggle
                  errors.password && 'border-red-500 focus:border-red-500 focus:ring-red-500'
                )}
                style={{ fontSize: '16px' }} // QA MOBILE: Prevent zoom on iOS
                disabled={isLoading}
              />
              <button
                type="button"
                onClick={() => togglePasswordVisibility('password')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded-sm"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                disabled={isLoading}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Eye className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
            </div>

            {/* QA UX: Password strength meter */}
            <PasswordStrengthMeter
              password={passwordValue}
              className="mt-2"
            />

            {errors.password && (
              <div id="password-error" role="alert" className="flex items-center gap-1 text-sm text-red-600">
                <AlertCircle className="h-3 w-3" aria-hidden="true" />
                <span>{errors.password.message}</span>
              </div>
            )}
          </div>

          {/* Confirm password field */}
          <div className="space-y-2">
            <Label htmlFor="confirmPassword" className="text-sm font-medium">
              Confirm password <span className="text-red-500" aria-label="required">*</span>
            </Label>
            <div className="relative">
              <Input
                id="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="Confirm your password"
                {...register('confirmPassword')}
                aria-describedby={errors.confirmPassword ? 'confirm-password-error' : undefined}
                aria-invalid={!!errors.confirmPassword}
                className={cn(
                  'h-11 pr-10', // QA MOBILE: Touch-friendly height with space for toggle
                  errors.confirmPassword && 'border-red-500 focus:border-red-500 focus:ring-red-500'
                )}
                style={{ fontSize: '16px' }} // QA MOBILE: Prevent zoom on iOS
                disabled={isLoading}
              />
              <button
                type="button"
                onClick={() => togglePasswordVisibility('confirmPassword')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded-sm"
                aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                disabled={isLoading}
              >
                {showConfirmPassword ? (
                  <EyeOff className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Eye className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
            </div>
            {errors.confirmPassword && (
              <div id="confirm-password-error" role="alert" className="flex items-center gap-1 text-sm text-red-600">
                <AlertCircle className="h-3 w-3" aria-hidden="true" />
                <span>{errors.confirmPassword.message}</span>
              </div>
            )}
          </div>

          {/* QA PRIVACY: GDPR-compliant consent checkboxes */}
          <div className="space-y-3">
            {/* Terms of Service */}
            <div className="flex items-start space-x-2">
              <Checkbox
                id="acceptTerms"
                {...register('acceptTerms')}
                disabled={isLoading}
                aria-describedby="terms-error"
                className="mt-1"
              />
              <div className="space-y-1">
                <Label htmlFor="acceptTerms" className="text-sm leading-5">
                  I agree to the{' '}
                  <Link
                    href="/legal/terms"
                    className="text-blue-600 hover:text-blue-800 underline focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded-sm"
                    target="_blank"
                  >
                    Terms of Service
                  </Link>
                  {' '}<span className="text-red-500" aria-label="required">*</span>
                </Label>
                {errors.acceptTerms && (
                  <div id="terms-error" role="alert" className="flex items-center gap-1 text-sm text-red-600">
                    <AlertCircle className="h-3 w-3" aria-hidden="true" />
                    <span>{errors.acceptTerms.message}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Privacy Policy */}
            <div className="flex items-start space-x-2">
              <Checkbox
                id="acceptPrivacy"
                {...register('acceptPrivacy')}
                disabled={isLoading}
                aria-describedby="privacy-error"
                className="mt-1"
              />
              <div className="space-y-1">
                <Label htmlFor="acceptPrivacy" className="text-sm leading-5">
                  I agree to the{' '}
                  <Link
                    href="/legal/privacy"
                    className="text-blue-600 hover:text-blue-800 underline focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded-sm"
                    target="_blank"
                  >
                    Privacy Policy
                  </Link>
                  {' '}<span className="text-red-500" aria-label="required">*</span>
                </Label>
                {errors.acceptPrivacy && (
                  <div id="privacy-error" role="alert" className="flex items-center gap-1 text-sm text-red-600">
                    <AlertCircle className="h-3 w-3" aria-hidden="true" />
                    <span>{errors.acceptPrivacy.message}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Marketing consent (optional) */}
            <div className="flex items-start space-x-2">
              <Checkbox
                id="marketingConsent"
                {...register('marketingConsent')}
                disabled={isLoading}
                className="mt-1"
              />
              <Label htmlFor="marketingConsent" className="text-sm leading-5 text-gray-600">
                I&apos;d like to receive product updates and tips via email (optional)
              </Label>
            </div>
          </div>

          {/* Submit button */}
          <Button
            type="submit"
            disabled={isLoading}
            className="w-full h-11 font-medium" // QA MOBILE: Touch-friendly height
            aria-describedby="submit-status"
          >
            {isLoading ? (
              <>
                <span className="mr-2 animate-spin" aria-hidden="true">⏳</span>
                <span className="sr-only">Processing, please wait</span>
                Creating account...
              </>
            ) : (
              <>
                <Shield className="mr-2 h-4 w-4" aria-hidden="true" />
                Create secure account
              </>
            )}
          </Button>

          <div id="submit-status" aria-live="polite" className="sr-only">
            {isLoading && 'Registration form is being processed'}
          </div>
        </form>

        {/* Sign-in link */}
        <div className="text-center text-sm">
          <span className="text-gray-600">Already have an account? </span>
          <Link
            href="/auth/login"
            className="font-medium text-blue-600 hover:text-blue-800 underline focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded-sm"
          >
            Sign in here
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}