'use client';

/**
 * Enhanced Login Form with QA-mandated security and accessibility features.
 *
 * This component implements comprehensive security measures, WCAG 2.1 AA
 * accessibility compliance, mobile-first responsive design, and real-time
 * user feedback according to QA requirements.
 *
 * @component
 * @category Authentication Components
 * @since 1.6.0
 */

import { useState, useRef, useEffect } from 'react';
import { signIn, getProviders } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { Eye, EyeOff, Github, Chrome, AlertCircle, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { LoginSchema, type LoginFormData } from '@/lib/validation/auth';
import { cn } from '@/lib/utils';

/**
 * Props for the Enhanced Login Form component.
 */
interface EnhancedLoginFormProps {
  /** Callback URL to redirect after successful login */
  callbackUrl?: string;
  /** Additional CSS classes */
  className?: string;
  /** Show development mode notice */
  showDevNotice?: boolean;
}

/**
 * Rate limiting display component.
 */
interface RateLimitStatus {
  isLimited: boolean;
  remaining: number;
  resetTime?: number;
  reason?: string;
}

/**
 * Enhanced Login Form with QA compliance features.
 */
export function EnhancedLoginForm({
  callbackUrl = '/dashboard',
  className,
  showDevNotice = process.env.NODE_ENV === 'development'
}: EnhancedLoginFormProps) {
  // Form state
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [rateLimitStatus, setRateLimitStatus] = useState<RateLimitStatus>({
    isLimited: false,
    remaining: 3,
  });
  const [providers, setProviders] = useState<any>(null);

  // Accessibility refs
  const errorRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const router = useRouter();

  // React Hook Form setup with enhanced validation
  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
  } = useForm<LoginFormData>({
    resolver: zodResolver(LoginSchema),
    mode: 'onBlur', // QA UX: Real-time validation
  });

  const emailValue = watch('email');

  // QA ACCESSIBILITY: Load OAuth providers
  useEffect(() => {
    getProviders().then(setProviders);
  }, []);

  // QA ACCESSIBILITY: Announce errors to screen readers
  useEffect(() => {
    if (error && errorRef.current) {
      errorRef.current.focus();
      announceToScreenReader(`Login error: ${error}`);
    }
  }, [error]);

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
  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true);
    setError(null);

    try {
      // QA UX: Announce loading state
      announceToScreenReader('Signing in, please wait');

      const result = await signIn('credentials', {
        email: data.email,
        password: data.password,
        redirect: false,
      });

      if (result?.error) {
        // QA SECURITY: Handle different error types
        if (result.error === 'CredentialsSignin') {
          setError('Invalid email or password. Please check your credentials and try again.');
        } else if (result.error === 'AccessDenied') {
          setError('Account access denied. Please verify your email address.');
        } else if (result.error === 'CallbackRouteError') {
          setError('Authentication service error. Please try again.');
        } else {
          setError('Sign in failed. Please try again.');
        }

        // QA ACCESSIBILITY: Announce error
        announceToScreenReader('Sign in failed');
      } else if (result?.ok) {
        // QA UX: Success feedback
        announceToScreenReader('Sign in successful, redirecting');
        router.push(callbackUrl);
      }
    } catch (err: any) {
      console.error('Login error:', err);

      // QA SECURITY: Handle rate limiting
      if (err?.status === 429) {
        const rateLimitInfo = err?.rateLimitInfo || {};
        setRateLimitStatus({
          isLimited: true,
          remaining: rateLimitInfo.remaining || 0,
          resetTime: rateLimitInfo.resetTime,
          reason: rateLimitInfo.reason || 'Too many attempts',
        });
        setError(`Too many login attempts. Please try again in ${Math.ceil((rateLimitInfo.resetTime - Date.now()) / 60000)} minutes.`);
      } else {
        setError('An unexpected error occurred. Please try again.');
      }

      announceToScreenReader('Login error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Handle OAuth provider sign-in with enhanced security.
   */
  const handleProviderSignIn = async (providerId: string) => {
    setIsLoading(true);
    setError(null);

    try {
      announceToScreenReader(`Signing in with ${providerId}`);

      await signIn(providerId, {
        callbackUrl,
        redirect: false,
      });
    } catch (err) {
      console.error(`${providerId} sign-in error:`, err);
      setError(`Failed to sign in with ${providerId}. Please try again.`);
      announceToScreenReader(`${providerId} sign-in failed`);
      setIsLoading(false);
    }
  };

  /**
   * Toggle password visibility with accessibility.
   */
  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
    announceToScreenReader(showPassword ? 'Password hidden' : 'Password visible');
  };

  return (
    <Card className={cn('w-full max-w-md mx-auto', className)}>
      <CardHeader className="space-y-1 text-center">
        <CardTitle className="text-2xl font-bold tracking-tight">
          Welcome back
        </CardTitle>
        <CardDescription className="text-sm text-muted-foreground">
          Enter your credentials to access your inventory
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
          {error && `Login error: ${error}`}
        </div>

        {/* QA UX: Visible error display */}
        {error && (
          <div
            className="rounded-lg bg-red-50 border border-red-200 p-3 flex items-start gap-2"
            role="alert"
            aria-describedby="error-message"
          >
            <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" aria-hidden="true" />
            <div>
              <p id="error-message" className="text-sm text-red-700 font-medium">
                {error}
              </p>
              {rateLimitStatus.isLimited && (
                <p className="text-xs text-red-600 mt-1">
                  Attempts remaining: {rateLimitStatus.remaining}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Main login form */}
        <form
          ref={formRef}
          onSubmit={handleSubmit(onSubmit)}
          className="space-y-4"
          aria-label="Sign in form"
          noValidate
        >
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

          {/* Password field */}
          <div className="space-y-2">
            <Label htmlFor="password" className="text-sm font-medium">
              Password <span className="text-red-500" aria-label="required">*</span>
            </Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="Enter your password"
                {...register('password')}
                aria-describedby={errors.password ? 'password-error' : 'password-toggle'}
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
                id="password-toggle"
                onClick={togglePasswordVisibility}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded-sm"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                tabIndex={0}
                disabled={isLoading}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Eye className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
            </div>
            {errors.password && (
              <div id="password-error" role="alert" className="flex items-center gap-1 text-sm text-red-600">
                <AlertCircle className="h-3 w-3" aria-hidden="true" />
                <span>{errors.password.message}</span>
              </div>
            )}
          </div>

          {/* Remember me checkbox */}
          <div className="flex items-center space-x-2">
            <Checkbox
              id="remember"
              {...register('rememberMe')}
              disabled={isLoading}
              aria-describedby="remember-description"
            />
            <Label
              htmlFor="remember"
              className="text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              Remember me for 30 days
            </Label>
            <p id="remember-description" className="sr-only">
              Keep me signed in on this device for 30 days
            </p>
          </div>

          {/* Submit button */}
          <Button
            type="submit"
            disabled={isLoading || rateLimitStatus.isLimited}
            className="w-full h-11 font-medium" // QA MOBILE: Touch-friendly height
            aria-describedby="submit-status"
          >
            {isLoading ? (
              <>
                <span className="mr-2 animate-spin" aria-hidden="true">⏳</span>
                <span className="sr-only">Processing, please wait</span>
                Signing in...
              </>
            ) : (
              'Sign in'
            )}
          </Button>

          <div id="submit-status" aria-live="polite" className="sr-only">
            {isLoading && 'Form is being processed'}
          </div>
        </form>

        {/* Forgot password link */}
        <div className="text-center">
          <Link
            href="/auth/reset-password"
            className="text-sm text-blue-600 hover:text-blue-800 underline focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded-sm"
          >
            Forgot your password?
          </Link>
        </div>

        {/* OAuth providers */}
        {providers && Object.keys(providers).length > 1 && (
          <>
            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-gray-300" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white px-2 text-gray-500 font-medium">
                  Or continue with
                </span>
              </div>
            </div>

            {/* QA MOBILE: Stack OAuth buttons vertically on mobile */}
            <div className="grid gap-3 sm:grid-cols-2">
              {providers.github && (
                <Button
                  variant="outline"
                  onClick={() => handleProviderSignIn('github')}
                  disabled={isLoading}
                  className="h-11 font-medium" // QA MOBILE: Touch-friendly height
                  aria-label="Sign in with GitHub"
                >
                  <Github className="mr-2 h-4 w-4" aria-hidden="true" />
                  GitHub
                </Button>
              )}

              {providers.google && (
                <Button
                  variant="outline"
                  onClick={() => handleProviderSignIn('google')}
                  disabled={isLoading}
                  className="h-11 font-medium" // QA MOBILE: Touch-friendly height
                  aria-label="Sign in with Google"
                >
                  <Chrome className="mr-2 h-4 w-4" aria-hidden="true" />
                  Google
                </Button>
              )}
            </div>
          </>
        )}

        {/* QA UX: Development notice */}
        {showDevNotice && (
          <div className="rounded-lg bg-blue-50 border border-blue-200 p-3">
            <div className="flex items-start gap-2">
              <CheckCircle className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" aria-hidden="true" />
              <div className="text-sm text-blue-700">
                <p className="font-medium">Development Mode</p>
                <p className="mt-1">
                  Use any email with password <code className="bg-blue-100 px-1 rounded">&quot;password&quot;</code> to sign in.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Registration link */}
        <div className="text-center text-sm">
          <span className="text-gray-600">Don&apos;t have an account? </span>
          <Link
            href="/auth/register"
            className="font-medium text-blue-600 hover:text-blue-800 underline focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded-sm"
          >
            Create one here
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}