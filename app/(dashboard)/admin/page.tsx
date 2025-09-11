/**
 * Admin Panel for Database and System Management
 * 
 * Provides administrative controls for database operations, environment switching,
 * and operational management through a secure web interface.
 */

import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { AdminDashboard } from '@/components/admin/AdminDashboard';
import { env } from '@/lib/utils/env';

export default async function AdminPage() {
  // Check if admin panel is enabled
  if (!env.ENABLE_ADMIN_PANEL) {
    redirect('/dashboard');
  }

  // Get current session
  const session = await getServerSession(authOptions);

  // Check if user is admin
  if (!session?.user?.email || session.user.email !== env.ADMIN_EMAIL) {
    redirect('/dashboard');
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="py-10">
        <header>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between">
              <h1 className="text-3xl font-bold leading-tight text-gray-900">
                🔧 System Administration
              </h1>
              <div className="flex items-center space-x-4">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                  {env.NODE_ENV}
                </span>
                <span className="text-sm text-gray-500">
                  {session.user.email}
                </span>
              </div>
            </div>
          </div>
        </header>
        
        <main>
          <div className="max-w-7xl mx-auto sm:px-6 lg:px-8">
            <AdminDashboard />
          </div>
        </main>
      </div>
    </div>
  );
}