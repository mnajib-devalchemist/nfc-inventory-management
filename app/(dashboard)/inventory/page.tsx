import React, { Suspense } from 'react';
import { InventoryDashboard } from './components/InventoryDashboard';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Loading component for inventory page
 */
function InventoryPageSkeleton() {
  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
        <div>
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-96" />
        </div>
        <Skeleton className="h-10 w-32" />
      </div>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="space-y-3">
            <Skeleton className="aspect-[4/3] w-full rounded-lg" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Inventory Page - Main inventory management interface
 * 
 * This page provides the primary interface for managing inventory items with:
 * - Grid/list view of all items
 * - Search and filtering capabilities
 * - Add/edit/delete item functionality
 * - Photo management integration
 * - Mobile-responsive design
 * 
 * @page
 */
export default function InventoryPage() {
  return (
    <div className="min-h-screen bg-background">
      <Suspense fallback={<InventoryPageSkeleton />}>
        <InventoryDashboard />
      </Suspense>
    </div>
  );
}

/**
 * Page metadata for SEO and navigation
 */
export const metadata = {
  title: 'Inventory - Digital Inventory Manager',
  description: 'Manage your household inventory with photos, locations, and detailed information.',
};