/**
 * Enhanced Login Page with QA-mandated security and accessibility features.
 *
 * This page implements comprehensive authentication with security validation,
 * WCAG 2.1 AA compliance, and mobile-first responsive design.
 *
 * @page /auth/login
 * @since 1.6.0
 */

import { Suspense } from 'react';
import { EnhancedLoginForm } from '@/components/auth';
import { Skeleton } from '@/components/ui/skeleton';

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <Suspense
          fallback={
            <div className="space-y-4">
              <Skeleton className="h-8 w-48 mx-auto" />
              <Skeleton className="h-4 w-64 mx-auto" />
              <Skeleton className="h-96 w-full" />
            </div>
          }
        >
          <EnhancedLoginForm />
        </Suspense>
      </div>
    </div>
  );
}