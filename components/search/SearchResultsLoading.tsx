/**
 * SearchResultsLoading Component
 * 
 * Loading skeleton component for search results with customizable layout
 * and proper accessibility support. Provides visual feedback during
 * search operations and maintains layout consistency.
 * 
 * @category Components
 * @subcategory Search
 * @since 1.5.0
 */

'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Props for the SearchResultsLoading component.
 */
export interface SearchResultsLoadingProps {
  /** Number of skeleton items to display */
  itemCount?: number;
  
  /** Layout mode for the skeleton display */
  viewMode: 'grid' | 'list';
  
  /** Whether to show performance info skeleton */
  showPerformanceInfo?: boolean;
  
  /** Whether to show view mode toggle skeleton */
  showViewModeToggle?: boolean;
  
  /** Whether to show search statistics skeleton */
  showSearchStats?: boolean;
  
  /** Additional CSS class names */
  className?: string;
  
  /** Custom loading message for accessibility */
  loadingMessage?: string;
}

/**
 * SearchResultsLoading component for displaying loading states.
 * 
 * Provides skeleton UI that matches the structure of actual search results
 * for better user experience during loading states. Supports both grid and
 * list layouts with proper accessibility attributes.
 * 
 * @param props - SearchResultsLoading component props
 * @returns JSX.Element The rendered loading skeleton
 * 
 * @example Basic usage
 * ```tsx
 * <SearchResultsLoading
 *   viewMode="grid"
 *   itemCount={6}
 *   showPerformanceInfo={true}
 * />
 * ```
 * 
 * @example List view with custom item count
 * ```tsx
 * <SearchResultsLoading
 *   viewMode="list"
 *   itemCount={8}
 *   showViewModeToggle={true}
 *   showSearchStats={true}
 * />
 * ```
 */
export function SearchResultsLoading({
  itemCount = 6,
  viewMode,
  showPerformanceInfo = true,
  showViewModeToggle = false,
  showSearchStats = false,
  className,
  loadingMessage = 'Loading search results',
}: SearchResultsLoadingProps) {
  return (
    <div className={cn('space-y-4', className)} role="status" aria-label={loadingMessage}>
      {/* Performance information skeleton */}
      {showPerformanceInfo && (
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-6">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-32" />
                {showSearchStats && <Skeleton className="h-4 w-20" />}
              </div>
              <Skeleton className="h-6 w-20 rounded-full" />
            </div>
          </CardContent>
        </Card>
      )}

      {/* View mode controls skeleton */}
      {showViewModeToggle && (
        <div className="flex justify-between items-center">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-8 w-20 rounded-md" />
        </div>
      )}

      {/* Results skeleton */}
      <div
        className={cn(
          viewMode === 'grid'
            ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'
            : 'space-y-3'
        )}
      >
        {Array.from({ length: itemCount }).map((_, index) => (
          <Card key={index} className="animate-pulse">
            <CardContent className="p-4">
              {viewMode === 'grid' ? (
                // Grid layout skeleton
                <div className="space-y-3">
                  {/* Image placeholder */}
                  <Skeleton className="h-32 w-full rounded-md" />
                  
                  {/* Item name */}
                  <Skeleton className="h-5 w-3/4" />
                  
                  {/* Description */}
                  <div className="space-y-2">
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-2/3" />
                  </div>
                  
                  {/* Location */}
                  <div className="flex items-center gap-1">
                    <Skeleton className="h-3 w-3 rounded" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                  
                  {/* Tags */}
                  <div className="flex gap-2">
                    <Skeleton className="h-5 w-16 rounded-full" />
                    <Skeleton className="h-5 w-12 rounded-full" />
                  </div>
                  
                  {/* Details */}
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-3 w-16" />
                    <Skeleton className="h-3 w-12" />
                  </div>
                </div>
              ) : (
                // List layout skeleton
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0 space-y-3">
                    {/* Item name */}
                    <Skeleton className="h-5 w-3/4" />
                    
                    {/* Description */}
                    <div className="space-y-2">
                      <Skeleton className="h-3 w-full" />
                      <Skeleton className="h-3 w-4/5" />
                    </div>
                    
                    {/* Location breadcrumbs */}
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-3 w-3 rounded" />
                      <Skeleton className="h-3 w-16" />
                      <Skeleton className="h-3 w-3 rounded" />
                      <Skeleton className="h-3 w-20" />
                      <Skeleton className="h-3 w-3 rounded" />
                      <Skeleton className="h-3 w-18" />
                    </div>
                    
                    {/* Item details */}
                    <div className="flex items-center gap-4">
                      <Skeleton className="h-3 w-12" />
                      <Skeleton className="h-3 w-16" />
                      <Skeleton className="h-3 w-20" />
                    </div>
                    
                    {/* Tags */}
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-5 w-16 rounded-full" />
                      <Skeleton className="h-5 w-12 rounded-full" />
                      <Skeleton className="h-5 w-14 rounded-full" />
                    </div>
                  </div>
                  
                  {/* Thumbnail */}
                  <div className="ml-4">
                    <Skeleton className="h-16 w-16 rounded-md" />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Load more button skeleton */}
      <div className="flex justify-center pt-4">
        <Skeleton className="h-10 w-32" />
      </div>

      {/* Screen reader announcement */}
      <div className="sr-only" aria-live="polite">
        {loadingMessage}
      </div>
    </div>
  );
}

export default SearchResultsLoading;