/**
 * Password Reset Page with security validation and accessibility features.
 *
 * This page implements secure password reset functionality with email validation,
 * rate limiting, and comprehensive error handling.
 *
 * @page /reset-password
 * @since 1.8.0
 */

import { Suspense } from 'react';
import { ResetPasswordForm } from '@/components/auth';
import { Skeleton } from '@/components/ui/skeleton';

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <Suspense
          fallback={
            <div className="space-y-4">
              <Skeleton className="h-8 w-48 mx-auto" />
              <Skeleton className="h-4 w-64 mx-auto" />
              <Skeleton className="h-[400px] w-full" />
            </div>
          }
        >
          <ResetPasswordForm />
        </Suspense>
      </div>
    </div>
  );
}