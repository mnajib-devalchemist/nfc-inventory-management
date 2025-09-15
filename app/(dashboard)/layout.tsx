/**
 * Dashboard Layout Component
 *
 * This layout wraps all dashboard pages with consistent navigation,
 * header, and sidebar components. Includes authentication checks
 * and responsive design patterns.
 *
 * @component
 * @since 1.8.0
 */

import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { Shell } from '@/components/layout/Shell';
import { Header } from '@/components/layout/Header';
import { Sidebar } from '@/components/layout/Sidebar';
import { Loading } from '@/components/common/Loading';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Check authentication
  const session = await auth();

  if (!session?.user) {
    redirect('/login');
  }

  return (
    <Shell>
      <Header />
      <div className="flex h-[calc(100vh-4rem)]">
        <Sidebar />
        <main className="flex-1 overflow-y-auto p-6">
          <Suspense fallback={<Loading />}>
            {children}
          </Suspense>
        </main>
      </div>
    </Shell>
  );
}