'use client';

import React, { useState } from 'react';
import { ItemCard } from './ItemCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { 
  Grid3X3, 
  List, 
  Search, 
  Filter, 
  SortAsc, 
  SortDesc,
  Package,
  RefreshCw,
  Plus
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ItemStatus } from '@prisma/client';

/**
 * Item data interface (matches ItemCard)
 */
interface Item {
  id: string;
  name: string;
  description?: string | null;
  quantity: number;
  unit: string;
  currentValue?: number | null;
  purchasePrice?: number | null;
  purchaseDate?: Date | null;
  status: ItemStatus;
  photoUrl?: string | null;
  thumbnailUrl?: string | null;
  createdAt: Date;
  updatedAt: Date;
  location: {
    name: string;
    path: string;
  };
  photos?: Array<{
    id: string;
    thumbnailUrl: string;
    isPrimary: boolean;
  }>;
  creator?: {
    name: string | null;
    email: string;
  };
}

/**
 * Pagination metadata
 */
interface PaginationMeta {
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
  hasPrevious: boolean;
  hasNext: boolean;
}

/**
 * ItemGrid Component Props
 */
interface ItemGridProps {
  items: Item[];
  pagination?: PaginationMeta;
  loading?: boolean;
  onEdit?: (item: Item) => void;
  onDelete?: (itemId: string) => void;
  onView?: (itemId: string) => void;
  onAddNew?: () => void;
  onSearch?: (query: string) => void;
  onFilter?: (filters: ItemFilters) => void;
  onSort?: (sortBy: string, sortOrder: 'asc' | 'desc') => void;
  onPageChange?: (page: number) => void;
  searchQuery?: string;
  filters?: ItemFilters;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  className?: string;
  emptyStateMessage?: string;
  emptyStateAction?: React.ReactNode;
}

/**
 * Filter options interface
 */
interface ItemFilters {
  status?: ItemStatus;
  location?: string;
  minValue?: number;
  maxValue?: number;
  hasPhoto?: boolean;
}

/**
 * View mode type
 */
type ViewMode = 'grid' | 'list';

/**
 * ItemGrid - Responsive grid/list view for inventory items
 * 
 * Provides comprehensive item display with:
 * - Grid and list view modes
 * - Search and filtering capabilities
 * - Sorting by multiple criteria
 * - Pagination support
 * - Mobile-responsive design
 * - Empty state handling
 * 
 * @component
 */
export function ItemGrid({
  items,
  pagination,
  loading = false,
  onEdit,
  onDelete,
  onView,
  onAddNew,
  onSearch,
  onFilter,
  onSort,
  onPageChange,
  searchQuery = '',
  filters = {},
  sortBy = 'name',
  sortOrder = 'asc',
  className,
  emptyStateMessage = 'No items found',
  emptyStateAction
}: ItemGridProps) {
  // Local state
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [localSearchQuery, setLocalSearchQuery] = useState(searchQuery);
  const [showFilters, setShowFilters] = useState(false);

  /**
   * Handle search input with debouncing
   */
  const handleSearchChange = React.useCallback((value: string) => {
    setLocalSearchQuery(value);
    
    // Debounce search calls
    const timeoutId = setTimeout(() => {
      if (onSearch) {
        onSearch(value);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [onSearch]);

  /**
   * Handle sorting
   */
  const handleSort = (field: string) => {
    const newOrder = (sortBy === field && sortOrder === 'asc') ? 'desc' : 'asc';
    if (onSort) {
      onSort(field, newOrder);
    }
  };

  /**
   * Handle filter changes
   */
  const handleFilterChange = (key: keyof ItemFilters, value: any) => {
    if (onFilter) {
      onFilter({ ...filters, [key]: value });
    }
  };

  /**
   * Generate pagination buttons
   */
  const renderPagination = () => {
    if (!pagination || pagination.totalPages <= 1) return null;

    const { page, totalPages, hasPrevious, hasNext } = pagination;

    return (
      <div className="flex items-center justify-between px-2">
        <div className="text-sm text-muted-foreground">
          Page {page} of {totalPages} ({pagination.totalCount} items)
        </div>
        
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange?.(page - 1)}
            disabled={!hasPrevious || loading}
          >
            Previous
          </Button>
          
          {/* Page numbers for small pagination */}
          {totalPages <= 7 && (
            <div className="hidden sm:flex space-x-1">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
                <Button
                  key={pageNum}
                  variant={pageNum === page ? "default" : "outline"}
                  size="sm"
                  onClick={() => onPageChange?.(pageNum)}
                  disabled={loading}
                  className="w-8 h-8 p-0"
                >
                  {pageNum}
                </Button>
              ))}
            </div>
          )}
          
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange?.(page + 1)}
            disabled={!hasNext || loading}
          >
            Next
          </Button>
        </div>
      </div>
    );
  };

  /**
   * Render empty state
   */
  const renderEmptyState = () => (
    <div className="text-center py-12">
      <Package className="h-16 w-16 mx-auto mb-4 text-muted-foreground/50" />
      <h3 className="text-lg font-medium mb-2">No Items Found</h3>
      <p className="text-muted-foreground mb-6 max-w-md mx-auto">
        {emptyStateMessage}
      </p>
      {emptyStateAction || (onAddNew && (
        <Button onClick={onAddNew} className="gap-2">
          <Plus className="h-4 w-4" />
          Add Your First Item
        </Button>
      ))}
    </div>
  );

  /**
   * Render loading state
   */
  const renderLoadingState = () => (
    <div className="text-center py-12">
      <RefreshCw className="h-8 w-8 mx-auto mb-4 text-muted-foreground animate-spin" />
      <p className="text-muted-foreground">Loading items...</p>
    </div>
  );

  return (
    <div className={cn('space-y-6', className)}>
      {/* Header with Controls */}
      <div className="flex flex-col space-y-4">
        {/* Search and View Toggle */}
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search items..."
              value={localSearchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-10"
              disabled={loading}
            />
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center gap-2">
            <Button
              variant={viewMode === 'grid' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('grid')}
              className="gap-2"
            >
              <Grid3X3 className="h-4 w-4" />
              Grid
            </Button>
            <Button
              variant={viewMode === 'list' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('list')}
              className="gap-2"
            >
              <List className="h-4 w-4" />
              List
            </Button>
          </div>
        </div>

        {/* Filters and Sort */}
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Filter Toggle */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            className="gap-2 sm:w-auto"
          >
            <Filter className="h-4 w-4" />
            Filters
            {Object.keys(filters).length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 w-5 p-0 flex items-center justify-center text-xs">
                {Object.keys(filters).length}
              </Badge>
            )}
          </Button>

          {/* Sort Controls */}
          <div className="flex items-center gap-2">
            <Select value={sortBy} onValueChange={(value) => handleSort(value)}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name">Name</SelectItem>
                <SelectItem value="createdAt">Date Added</SelectItem>
                <SelectItem value="updatedAt">Last Modified</SelectItem>
                <SelectItem value="currentValue">Value</SelectItem>
                <SelectItem value="purchaseDate">Purchase Date</SelectItem>
              </SelectContent>
            </Select>

            <Button
              variant="outline"
              size="sm"
              onClick={() => handleSort(sortBy)}
              className="gap-2"
            >
              {sortOrder === 'asc' ? (
                <SortAsc className="h-4 w-4" />
              ) : (
                <SortDesc className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        {/* Expanded Filters */}
        {showFilters && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-4 bg-muted/50 rounded-lg">
            {/* Status Filter */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Status</label>
              <Select 
                value={filters.status || ''} 
                onValueChange={(value) => handleFilterChange('status', value || undefined)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All statuses</SelectItem>
                  {Object.values(ItemStatus).map((status) => (
                    <SelectItem key={status} value={status}>
                      {status.toLowerCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Value Range */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Min Value</label>
              <Input
                type="number"
                placeholder="0.00"
                step="0.01"
                value={filters.minValue || ''}
                onChange={(e) => handleFilterChange('minValue', 
                  e.target.value ? parseFloat(e.target.value) : undefined
                )}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Max Value</label>
              <Input
                type="number"
                placeholder="999999.99"
                step="0.01"
                value={filters.maxValue || ''}
                onChange={(e) => handleFilterChange('maxValue', 
                  e.target.value ? parseFloat(e.target.value) : undefined
                )}
              />
            </div>

            {/* Clear Filters */}
            <div className="flex items-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onFilter?.({})}
                className="w-full"
              >
                Clear Filters
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="min-h-[400px]">
        {loading ? renderLoadingState() : items.length === 0 ? renderEmptyState() : (
          <>
            {/* Items Grid/List */}
            <div className={cn(
              viewMode === 'grid' 
                ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6'
                : 'space-y-4',
              'mb-8'
            )}>
              {items.map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  onView={onView}
                  variant={viewMode === 'list' ? 'compact' : 'default'}
                  showActions={true}
                />
              ))}
            </div>

            {/* Pagination */}
            {renderPagination()}
          </>
        )}
      </div>

      {/* Add Item FAB for mobile */}
      {onAddNew && (
        <Button
          onClick={onAddNew}
          className="fixed bottom-6 right-6 z-10 h-14 w-14 rounded-full shadow-lg lg:hidden"
          size="icon"
        >
          <Plus className="h-6 w-6" />
        </Button>
      )}
    </div>
  );
}