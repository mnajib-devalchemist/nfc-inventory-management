'use client';

/**
 * LoginForm - User authentication login form component.
 * 
 * Provides a form interface for user authentication with support for
 * credentials-based login and OAuth provider sign-in options.
 * Includes form validation, loading states, and error handling.
 * 
 * @component
 * @category Authentication Components  
 * @since 1.0.0
 */

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * Login form validation schema using Zod.
 */
const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
  remember: z.boolean().optional(),
});

type LoginFormData = z.infer<typeof loginSchema>;

/**
 * Props for the LoginForm component.
 */
interface LoginFormProps {
  /** Callback URL to redirect after successful login */
  callbackUrl?: string;
  /** Additional CSS classes */
  className?: string;
}

/**
 * LoginForm component for user authentication.
 * 
 * @param props - Component properties
 * @returns JSX element containing the login form
 */
export function LoginForm({ callbackUrl = '/dashboard', className }: LoginFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  /**
   * Handles form submission for credentials-based login.
   */
  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await signIn('credentials', {
        email: data.email,
        password: data.password,
        redirect: false,
      });

      if (result?.error) {
        setError('Invalid email or password');
      } else if (result?.ok) {
        router.push(callbackUrl);
      }
    } catch (err) {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Handles OAuth provider sign-in.
   */
  const handleProviderSignIn = async (providerId: string) => {
    setIsLoading(true);
    setError(null);

    try {
      await signIn(providerId, { callbackUrl });
    } catch (err) {
      setError(`Failed to sign in with ${providerId}`);
      setIsLoading(false);
    }
  };

  return (
    <Card className={className}>
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl font-bold">Sign in</CardTitle>
        <CardDescription>
          Enter your credentials to access your account
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {error && (
          <div className="rounded-md bg-red-50 p-3">
            <div className="text-sm text-red-700">{error}</div>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              {...register('email')}
              className={errors.email ? 'border-red-500' : ''}
            />
            {errors.email && (
              <p className="text-sm text-red-500">{errors.email.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="Enter your password"
              {...register('password')}
              className={errors.password ? 'border-red-500' : ''}
            />
            {errors.password && (
              <p className="text-sm text-red-500">{errors.password.message}</p>
            )}
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={isLoading}
          >
            {isLoading ? 'Signing in...' : 'Sign in'}
          </Button>
        </form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">
              Or continue with
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Button
            variant="outline"
            onClick={() => handleProviderSignIn('github')}
            disabled={isLoading}
            className="w-full"
          >
            GitHub
          </Button>
          
          <Button
            variant="outline"
            onClick={() => handleProviderSignIn('google')}
            disabled={isLoading}
            className="w-full"
          >
            Google
          </Button>
        </div>

        <div className="text-center text-sm">
          <span className="text-muted-foreground">
            For development, use any email with password: &quot;password&quot;
          </span>
        </div>
      </CardContent>
    </Card>
  );
}