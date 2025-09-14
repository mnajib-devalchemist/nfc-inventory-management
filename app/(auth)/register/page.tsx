/**
 * Enhanced Registration Page with QA-mandated security and accessibility features.
 *
 * This page implements comprehensive user registration with security validation,
 * GDPR compliance, WCAG 2.1 AA accessibility, and mobile-first responsive design.
 *
 * @page /auth/register
 * @since 1.6.0
 */

import { Suspense } from 'react';
import { RegistrationForm } from '@/components/auth';
import { Skeleton } from '@/components/ui/skeleton';

export default function RegisterPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <Suspense
          fallback={
            <div className="space-y-4">
              <Skeleton className="h-8 w-48 mx-auto" />
              <Skeleton className="h-4 w-64 mx-auto" />
              <Skeleton className="h-[600px] w-full" />
            </div>
          }
        >
          <RegistrationForm />
        </Suspense>
      </div>
    </div>
  );
}