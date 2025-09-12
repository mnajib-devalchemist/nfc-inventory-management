/**
 * SearchResults Component
 * 
 * A comprehensive component for displaying search results with accessibility
 * features, result highlighting, sorting options, and performance metadata.
 * Enhanced with Story 1.5 navigation features, location breadcrumbs, and
 * secure text highlighting with XSS prevention.
 * 
 * @category Components
 * @subcategory Search
 * @since 1.4.0
 * @version 1.5.0 - Added navigation, highlighting, and breadcrumb features
 */

'use client';

import React, { useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { MapPin, Tag, Clock, Zap, Database, Grid3X3, List, Eye, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ItemCard } from '@/components/inventory/ItemCard';
import { LocationBreadcrumbs } from '@/components/locations/LocationBreadcrumbs';
import { highlightSearchTerms, createSearchHighlight } from '@/lib/utils/search-highlighting';
import { buildItemDetailUrl, buildLocationUrl, parseSearchState, serializeSearchState } from '@/lib/utils/url-state';
import { useKeyboardNavigation } from '@/lib/hooks/useKeyboardNavigation';
import { logger, withPerformanceLogging, ErrorCategory } from '@/lib/utils/logging';
import { metrics, searchMetrics, SEARCH_METRICS } from '@/lib/utils/metrics';
import type { 
  SearchResults as SearchResultsType, 
  SearchResult, 
  EnhancedSearchResults, 
  EnhancedSearchResult 
} from '@/lib/types/search';

/**
 * Props for the original SearchResults component (backward compatibility).
 */
export interface SearchResultsProps {
  /** Search results data */
  results: SearchResultsType;
  
  /** Search query that produced these results */
  query?: string;
  
  /** Whether results are currently loading */
  isLoading?: boolean;
  
  /** Whether more results are being loaded */
  isLoadingMore?: boolean;
  
  /** Callback when "Load More" is clicked */
  onLoadMore?: () => void;
  
  /** Callback when a result item is clicked */
  onItemClick?: (item: SearchResult) => void;
  
  /** Whether to show performance metadata */
  showPerformanceInfo?: boolean;
  
  /** Whether to highlight query terms in results */
  highlightQuery?: boolean;
  
  /** Layout style for results */
  layout?: 'grid' | 'list';
  
  /** Additional CSS class names */
  className?: string;
}

/**
 * Enhanced props for SearchResults V2 component with Story 1.5 features.
 * 
 * Extends the original props with navigation, URL state management,
 * and enhanced search highlighting capabilities while maintaining
 * backward compatibility.
 */
export interface SearchResultsV2Props extends Omit<SearchResultsProps, 'results' | 'onItemClick'> {
  /** Enhanced search results with navigation and highlighting data */
  results: EnhancedSearchResults;
  
  /** Callback when a result item is clicked for navigation */
  onItemClick?: (item: EnhancedSearchResult) => void;
  
  /** Callback when view mode changes */
  onViewModeChange?: (mode: 'grid' | 'list') => void;
  
  /** Callback when location breadcrumb is clicked */
  onLocationClick?: (locationId: string, locationName: string) => void;
  
  /** Whether to enable secure text highlighting */
  highlightingEnabled?: boolean;
  
  /** Performance mode for highlighting operations */
  performanceMode?: 'fast' | 'quality';
  
  /** Callback when highlighting errors occur */
  onHighlightingError?: (error: Error) => void;
  
  /** Whether security validation passed for highlighted content */
  securityValidated?: boolean;
  
  /** Whether to show location breadcrumbs in results */
  showLocationBreadcrumbs?: boolean;
  
  /** Whether to show item quick preview on hover */
  enableQuickPreview?: boolean;
  
  /** Whether to show search result statistics */
  showSearchStats?: boolean;
  
  /** Current URL search parameters for state management */
  urlSearchParams?: URLSearchParams;
}

/**
 * Component for displaying enhanced search statistics and performance metadata.
 */
function EnhancedSearchPerformanceInfo({ 
  results, 
  query 
}: { 
  results: EnhancedSearchResults;
  query?: string;
}) {
  const getMethodIcon = (method: string) => {
    switch (method) {
      case 'full_text_search':
        return <Zap className="h-4 w-4 text-green-500" />;
      case 'trigram_search':
        return <Database className="h-4 w-4 text-blue-500" />;
      case 'ilike_fallback':
        return <Clock className="h-4 w-4 text-yellow-500" />;
      default:
        return <Database className="h-4 w-4 text-gray-500" />;
    }
  };

  const getMethodLabel = (method: string) => {
    switch (method) {
      case 'full_text_search':
        return 'Full-Text Search';
      case 'trigram_search':
        return 'Similarity Search';
      case 'ilike_fallback':
        return 'Pattern Matching';
      default:
        return 'Unknown Method';
    }
  };

  const { searchStats } = results;

  return (
    <Card className="mb-4">
      <CardContent className="p-3">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <div className="flex items-center gap-6">
            <span>
              Found <strong className="text-foreground">{results.totalCount}</strong> items
            </span>
            
            <div className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              <span>{results.responseTime}ms</span>
            </div>
            
            <div className="flex items-center gap-1">
              {getMethodIcon(results.searchMethod)}
              <span>{getMethodLabel(results.searchMethod)}</span>
            </div>

            {searchStats && (
              <div className="flex items-center gap-1">
                <BarChart3 className="h-4 w-4" />
                <span>
                  {searchStats.exactMatches}:{searchStats.partialMatches}:{searchStats.locationMatches}
                </span>
                <span className="text-xs">(exact:partial:location)</span>
              </div>
            )}
          </div>
          
          {query && (
            <Badge variant="outline" className="text-xs">
              &quot;{query}&quot;
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Component for displaying search view mode toggle controls.
 */
function ViewModeToggle({
  currentMode,
  onViewModeChange,
}: {
  currentMode: 'grid' | 'list';
  onViewModeChange: (mode: 'grid' | 'list') => void;
}) {
  return (
    <div className="flex items-center gap-1 rounded-md border p-1">
      <Button
        variant={currentMode === 'grid' ? 'secondary' : 'ghost'}
        size="sm"
        onClick={() => onViewModeChange('grid')}
        className="h-7 w-7 p-0"
        aria-label="Grid view"
      >
        <Grid3X3 className="h-4 w-4" />
      </Button>
      <Button
        variant={currentMode === 'list' ? 'secondary' : 'ghost'}
        size="sm"
        onClick={() => onViewModeChange('list')}
        className="h-7 w-7 p-0"
        aria-label="List view"
      >
        <List className="h-4 w-4" />
      </Button>
    </div>
  );
}

/**
 * Component for displaying individual search result performance metadata.
 */
function SearchPerformanceInfo({ 
  results, 
  query 
}: { 
  results: SearchResultsType;
  query?: string;
}) {
  const getMethodIcon = (method: string) => {
    switch (method) {
      case 'full_text_search':
        return <Zap className="h-4 w-4 text-green-500" />;
      case 'trigram_search':
        return <Database className="h-4 w-4 text-blue-500" />;
      case 'ilike_fallback':
        return <Clock className="h-4 w-4 text-yellow-500" />;
      default:
        return <Database className="h-4 w-4 text-gray-500" />;
    }
  };

  const getMethodLabel = (method: string) => {
    switch (method) {
      case 'full_text_search':
        return 'Full-Text Search';
      case 'trigram_search':
        return 'Similarity Search';
      case 'ilike_fallback':
        return 'Pattern Matching';
      default:
        return 'Unknown Method';
    }
  };

  return (
    <Card className="mb-4">
      <CardContent className="p-3">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <div className="flex items-center gap-4">
            <span>
              Found <strong className="text-foreground">{results.totalCount}</strong> items
            </span>
            
            <div className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              <span>{results.responseTime}ms</span>
            </div>
            
            <div className="flex items-center gap-1">
              {getMethodIcon(results.searchMethod)}
              <span>{getMethodLabel(results.searchMethod)}</span>
            </div>
          </div>
          
          {query && (
            <Badge variant="outline" className="text-xs">
              &quot;{query}&quot;
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Component for highlighting search terms within text.
 */
function HighlightedText({ 
  text, 
  query, 
  className 
}: { 
  text: string;
  query?: string;
  className?: string;
}) {
  const highlightedText = useMemo(() => {
    if (!query || query.length < 2) {
      return text;
    }

    // Create regex for highlighting (case insensitive, whole words preferred)
    const queryWords = query
      .split(/\s+/)
      .filter(word => word.length > 1)
      .map(word => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')); // Escape regex chars

    if (queryWords.length === 0) {
      return text;
    }

    const regex = new RegExp(`(${queryWords.join('|')})`, 'gi');
    const parts = text.split(regex);

    return parts.map((part, index) => {
      if (queryWords.some(word => part.toLowerCase() === word.toLowerCase())) {
        return (
          <mark 
            key={index}
            className="bg-yellow-200 text-yellow-900 px-0.5 rounded"
          >
            {part}
          </mark>
        );
      }
      return part;
    });
  }, [text, query]);

  return <span className={className}>{highlightedText}</span>;
}

/**
 * SearchResults component for displaying search results with comprehensive features.
 * 
 * Provides a rich interface for displaying search results including performance
 * metadata, result highlighting, accessibility features, and pagination support.
 * Adapts to different layouts and provides detailed information about each result.
 * 
 * @param props - SearchResults component props
 * @returns JSX.Element The rendered search results component
 * 
 * @example Basic usage
 * ```tsx
 * <SearchResults
 *   results={searchResults}
 *   query={searchQuery}
 *   onItemClick={(item) => navigate(`/items/${item.id}`)}
 *   onLoadMore={loadMoreResults}
 *   showPerformanceInfo={true}
 *   highlightQuery={true}
 * />
 * ```
 * 
 * @example Grid layout with loading state
 * ```tsx
 * <SearchResults
 *   results={results}
 *   isLoading={isSearching}
 *   isLoadingMore={isLoadingMore}
 *   layout="grid"
 *   onLoadMore={handleLoadMore}
 * />
 * ```
 */
export function SearchResults({
  results,
  query,
  isLoading = false,
  isLoadingMore = false,
  onLoadMore,
  onItemClick,
  showPerformanceInfo = true,
  highlightQuery = true,
  layout = 'grid',
  className,
}: SearchResultsProps) {
  // Loading skeleton
  if (isLoading) {
    return (
      <div className={cn('space-y-4', className)}>
        {showPerformanceInfo && (
          <Card>
            <CardContent className="p-3">
              <Skeleton className="h-4 w-48" />
            </CardContent>
          </Card>
        )}
        
        <div className={cn(
          layout === 'grid' 
            ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'
            : 'space-y-3'
        )}>
          {Array.from({ length: 6 }).map((_, index) => (
            <Card key={index}>
              <CardContent className="p-4">
                <div className="space-y-3">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                  <Skeleton className="h-3 w-full" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* Performance information */}
      {showPerformanceInfo && (
        <SearchPerformanceInfo results={results} query={query} />
      )}

      {/* Results grid/list */}
      <div
        role="region"
        aria-label={`Search results for ${query || 'inventory items'}`}
        className={cn(
          layout === 'grid'
            ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'
            : 'space-y-3'
        )}
      >
        {results.items.map((item, index) => (
          <div
            key={item.id}
            role="article"
            aria-label={`Search result ${index + 1}: ${item.name}`}
            className="group"
          >
            {layout === 'grid' ? (
              <ItemCard
                item={item as any}
                onView={() => onItemClick?.(item)}
                className="h-full transition-all hover:shadow-lg"
                showActions={false}
              />
            ) : (
              <Card className="hover:shadow-md transition-all cursor-pointer">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0 space-y-2">
                      {/* Item name */}
                      <h3 className="font-semibold truncate">
                        <HighlightedText
                          text={item.name}
                          query={highlightQuery ? query : undefined}
                        />
                      </h3>

                      {/* Item description */}
                      {item.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          <HighlightedText
                            text={item.description}
                            query={highlightQuery ? query : undefined}
                          />
                        </p>
                      )}

                      {/* Item details */}
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span>Qty: {item.quantity}</span>
                        {item.currentValue && (
                          <span>${item.currentValue.toFixed(2)}</span>
                        )}
                        {item.relevanceScore && (
                          <span>
                            Match: {(item.relevanceScore * 100).toFixed(0)}%
                          </span>
                        )}
                      </div>

                      {/* Location and tags */}
                      <div className="flex items-center gap-2 flex-wrap">
                        {item.location && (
                          <Badge variant="outline" className="text-xs">
                            <MapPin className="h-3 w-3 mr-1" />
                            <HighlightedText
                              text={item.location.name}
                              query={highlightQuery ? query : undefined}
                            />
                          </Badge>
                        )}
                        
                        {item.tags?.slice(0, 3).map(tag => (
                          <Badge
                            key={tag.id}
                            variant="secondary"
                            className="text-xs"
                            style={{ backgroundColor: `${tag.color}20`, color: tag.color }}
                          >
                            <Tag className="h-3 w-3 mr-1" />
                            <HighlightedText
                              text={tag.name}
                              query={highlightQuery ? query : undefined}
                            />
                          </Badge>
                        ))}
                        
                        {(item.tags?.length || 0) > 3 && (
                          <Badge variant="outline" className="text-xs">
                            +{(item.tags?.length || 0) - 3} more
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Item thumbnail */}
                    {item.photos && item.photos.length > 0 && (
                      <div className="ml-4">
                        <img
                          src={item.photos[0].thumbnailUrl}
                          alt={`${item.name} thumbnail`}
                          className="h-16 w-16 rounded-md object-cover"
                          loading="lazy"
                        />
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        ))}
      </div>

      {/* Load more button */}
      {results.hasMore && (
        <div className="flex justify-center pt-4">
          <Button
            onClick={onLoadMore}
            disabled={isLoadingMore}
            variant="outline"
            className="min-w-32"
          >
            {isLoadingMore ? (
              <>
                <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                Loading...
              </>
            ) : (
              'Load More Results'
            )}
          </Button>
        </div>
      )}

      {/* Results summary for screen readers */}
      <div className="sr-only" aria-live="polite" role="status">
        {results.totalCount === 0 
          ? `No search results found${query ? ` for "${query}"` : ''}`
          : `Showing ${results.items.length} of ${results.totalCount} search results${query ? ` for "${query}"` : ''}`
        }
      </div>
    </div>
  );
}

/**
 * Enhanced SearchResults V2 component with Story 1.5 navigation and highlighting features.
 * 
 * Provides comprehensive search results display with secure text highlighting,
 * location breadcrumb navigation, view mode toggles, and URL state management.
 * Includes performance monitoring and XSS prevention for all highlighted content.
 * 
 * @param props - SearchResultsV2 component props
 * @returns JSX.Element The rendered enhanced search results component
 * 
 * @example Enhanced usage with navigation
 * ```tsx
 * <SearchResultsV2
 *   results={enhancedSearchResults}
 *   query={searchQuery}
 *   layout={viewMode}
 *   onItemClick={(item) => navigateToItem(item.id)}
 *   onViewModeChange={setViewMode}
 *   onLocationClick={navigateToLocation}
 *   highlightingEnabled={true}
 *   showLocationBreadcrumbs={true}
 *   showSearchStats={true}
 * />
 * ```
 */
export function SearchResultsV2({
  results,
  query,
  isLoading = false,
  isLoadingMore = false,
  onLoadMore,
  onItemClick,
  onViewModeChange,
  onLocationClick,
  showPerformanceInfo = true,
  highlightQuery = true,
  highlightingEnabled = true,
  performanceMode = 'quality',
  onHighlightingError,
  securityValidated = true,
  showLocationBreadcrumbs = true,
  enableQuickPreview = false,
  showSearchStats = true,
  layout = 'grid',
  className,
  urlSearchParams,
}: SearchResultsV2Props) {
  const router = useRouter();

  // Performance monitoring for highlighting operations
  const [highlightingPerformance, setHighlightingPerformance] = React.useState<Record<string, number>>({});

  // Keyboard navigation for accessibility
  const keyboardNavigation = useKeyboardNavigation(results.items.length, {
    enabled: !isLoading,
    wrapAround: true,
    ariaLabel: `Search results for ${query || 'inventory items'}`,
    onSelect: (index) => {
      logger.info('Keyboard navigation item selected', { 
        index, 
        itemId: results.items[index]?.id,
        query 
      });
      searchMetrics.recordNavigation('keyboard_nav');
      handleItemClick(results.items[index]);
    },
    onNavigate: (index) => {
      // Announce current item to screen readers
      const item = results.items[index];
      if (item) {
        logger.debug('Keyboard navigation focused item', { index, itemName: item.name });
      }
    },
  });

  // Handle item click with navigation and logging
  const handleItemClick = useCallback(async (item: EnhancedSearchResult) => {
    try {
      await withPerformanceLogging('search_result_navigation', async () => {
        logger.info('Search result item clicked', { 
          itemId: item.id, 
          itemName: item.name,
          query,
          layout 
        });
        searchMetrics.recordNavigation('item_view');

        if (onItemClick) {
          onItemClick(item);
        } else {
          // Default navigation to item detail
          const currentSearchState = urlSearchParams 
            ? parseSearchState(urlSearchParams as any)
            : { query, viewMode: layout };
          
          const detailUrl = buildItemDetailUrl(item.id, currentSearchState);
          router.push(detailUrl);
        }
      }, { itemId: item.id, query });
    } catch (error) {
      logger.error('Failed to navigate to item detail', error as Error, ErrorCategory.USER_INPUT, {
        itemId: item.id,
        query
      });
    }
  }, [onItemClick, router, urlSearchParams, query, layout]);

  // Handle location breadcrumb click with logging
  const handleLocationClick = useCallback(async (locationId: string, locationName: string) => {
    try {
      logger.info('Location breadcrumb clicked', { 
        locationId, 
        locationName,
        query 
      });
      searchMetrics.recordNavigation('breadcrumb_click');

      if (onLocationClick) {
        onLocationClick(locationId, locationName);
      } else {
        // Default navigation to location page
        const currentSearchState = urlSearchParams 
          ? parseSearchState(urlSearchParams as any)
          : { query, viewMode: layout };
        
        const locationUrl = buildLocationUrl(locationId, currentSearchState);
        router.push(locationUrl);
      }
    } catch (error) {
      logger.error('Failed to navigate to location', error as Error, ErrorCategory.USER_INPUT, {
        locationId,
        locationName
      });
    }
  }, [onLocationClick, router, urlSearchParams, query, layout]);

  // Enhanced highlighting with comprehensive monitoring and logging
  const getHighlightedText = useCallback((text: string, itemId: string) => {
    if (!highlightingEnabled || !query || !text) {
      return text;
    }

    try {
      const startTime = performance.now();
      const searchTerms = query.split(/\s+/).filter(term => term.length > 0);
      
      const result = highlightSearchTerms(text, searchTerms, {
        highlightClass: 'bg-yellow-200 text-yellow-900 px-0.5 rounded',
      });
      
      const processingTime = Math.round(performance.now() - startTime);
      
      // Record highlighting metrics
      searchMetrics.recordHighlighting(processingTime, searchTerms.length, true);
      
      // Update performance tracking for UI display
      if (processingTime > 50) {
        setHighlightingPerformance(prev => ({
          ...prev,
          [itemId]: processingTime
        }));
        
        // Log slow operations with context
        logger.warn('Slow text highlighting operation detected', {
          operation: 'text_highlighting',
          duration: processingTime,
          textLength: text.length,
          termCount: searchTerms.length,
          itemId,
          threshold: 50
        });
      }

      // Security validation check
      if (!result.securityValidated) {
        const securityError = new Error('Text highlighting security validation failed');
        
        // Log security event
        logger.security({
          eventType: 'validation_failure',
          severity: 'medium',
          requestDetails: {
            operation: 'text_highlighting',
            itemId,
            textLength: text.length,
            termCount: searchTerms.length
          }
        });
        
        if (onHighlightingError) {
          onHighlightingError(securityError);
        }
      }

      // Record successful rendering metrics
      metrics.counter(SEARCH_METRICS.RESULTS_RENDER_TIME, processingTime, {
        itemId,
        hasHighlighting: 'true'
      });

      return result.highlightedText;
    } catch (error) {
      const searchTerms = query.split(/\s+/).filter(term => term.length > 0);
      
      // Record highlighting failure metrics
      searchMetrics.recordHighlighting(0, searchTerms.length, false);
      
      // Structured error logging with categorization
      logger.error(
        'Text highlighting operation failed',
        error as Error,
        ErrorCategory.PERFORMANCE,
        {
          operation: 'text_highlighting',
          itemId,
          textLength: text.length,
          searchTerms: searchTerms.length,
          fallbackUsed: true
        }
      );
      
      if (onHighlightingError) {
        onHighlightingError(error as Error);
      }
      return text; // Secure fallback to original text
    }
  }, [highlightingEnabled, query, performanceMode, onHighlightingError]);

  // Loading skeleton
  if (isLoading) {
    return (
      <div className={cn('space-y-4', className)}>
        {showPerformanceInfo && (
          <Card>
            <CardContent className="p-3">
              <Skeleton className="h-4 w-48" />
            </CardContent>
          </Card>
        )}
        
        {onViewModeChange && (
          <div className="flex justify-between items-center">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-8 w-20" />
          </div>
        )}
        
        <div className={cn(
          layout === 'grid' 
            ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'
            : 'space-y-3'
        )}>
          {Array.from({ length: 6 }).map((_, index) => (
            <Card key={index}>
              <CardContent className="p-4">
                <div className="space-y-3">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                  <Skeleton className="h-3 w-full" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* Enhanced performance information */}
      {showPerformanceInfo && (
        <EnhancedSearchPerformanceInfo results={results} query={query} />
      )}

      {/* View mode controls */}
      {onViewModeChange && (
        <div className="flex justify-between items-center">
          <div className="text-sm text-muted-foreground">
            {results.pagination ? (
              `Page ${results.pagination.currentPage} of ${results.pagination.totalPages}`
            ) : (
              `${results.items.length} of ${results.totalCount} items`
            )}
          </div>
          <ViewModeToggle
            currentMode={layout}
            onViewModeChange={onViewModeChange}
          />
        </div>
      )}

      {/* Results grid/list with keyboard navigation */}
      <div
        ref={keyboardNavigation.containerRef as React.RefObject<HTMLDivElement>}
        role="listbox"
        aria-label={`Search results for ${query || 'inventory items'}`}
        onKeyDown={keyboardNavigation.onKeyDown}
        tabIndex={0}
        className={cn(
          layout === 'grid'
            ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'
            : 'space-y-3'
        )}
      >
        {results.items.map((item, index) => {
          const isFocused = keyboardNavigation.focusedIndex === index;
          return (
            <div
              key={item.id}
              ref={(el) => {
                if (keyboardNavigation.itemRefs.current) {
                  keyboardNavigation.itemRefs.current[index] = el;
                }
              }}
              role="option"
              aria-selected={isFocused}
              aria-label={`Search result ${index + 1}: ${item.name}`}
              tabIndex={isFocused ? 0 : -1}
              className={cn(
                'group focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded-lg',
                isFocused && 'ring-2 ring-primary ring-offset-2'
              )}
              onClick={() => handleItemClick(item)}
            >
            {layout === 'grid' ? (
              <ItemCard
                item={item as any}
                onView={() => handleItemClick(item)}
                className="h-full transition-all hover:shadow-lg cursor-pointer"
                showActions={false}
              />
            ) : (
              <Card 
                className="hover:shadow-md transition-all cursor-pointer"
                onClick={() => handleItemClick(item)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0 space-y-2">
                      {/* Item name with highlighting */}
                      <h3 className="font-semibold truncate">
                        {item.searchHighlight?.nameMatch ? (
                          <span 
                            dangerouslySetInnerHTML={{ 
                              __html: item.searchHighlight.nameMatch 
                            }}
                          />
                        ) : (
                          getHighlightedText(item.name, item.id)
                        )}
                      </h3>

                      {/* Item description with snippet */}
                      {item.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {item.searchHighlight?.descriptionSnippet ? (
                            <span 
                              dangerouslySetInnerHTML={{ 
                                __html: item.searchHighlight.descriptionSnippet 
                              }}
                            />
                          ) : (
                            getHighlightedText(item.description, item.id)
                          )}
                        </p>
                      )}

                      {/* Enhanced location breadcrumbs */}
                      {showLocationBreadcrumbs && item.location && (
                        <div className="flex items-center">
                          <LocationBreadcrumbs
                            pathComponents={item.location.pathComponents || [
                              { id: item.location.id, name: item.location.name }
                            ]}
                            onLocationClick={handleLocationClick}
                            size="sm"
                            maxComponents={3}
                            className="text-xs"
                          />
                        </div>
                      )}

                      {/* Item details */}
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span>Qty: {item.quantity}</span>
                        {item.currentValue && (
                          <span>${item.currentValue.toFixed(2)}</span>
                        )}
                        {item.relevanceScore && (
                          <span>
                            Match: {(item.relevanceScore * 100).toFixed(0)}%
                          </span>
                        )}
                      </div>

                      {/* Tags */}
                      {item.tags?.length && (
                        <div className="flex items-center gap-2 flex-wrap">
                          {item.tags.slice(0, 3).map(tag => (
                            <Badge
                              key={tag.id}
                              variant="secondary"
                              className="text-xs"
                              style={{ backgroundColor: `${tag.color}20`, color: tag.color }}
                            >
                              <Tag className="h-3 w-3 mr-1" />
                              {getHighlightedText(tag.name, `${item.id}-${tag.id}`)}
                            </Badge>
                          ))}
                          
                          {item.tags.length > 3 && (
                            <Badge variant="outline" className="text-xs">
                              +{item.tags.length - 3} more
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Item thumbnail with quick preview */}
                    {item.photos && item.photos.length > 0 && (
                      <div className="ml-4">
                        <div className="relative">
                          <img
                            src={item.photos[0].thumbnailUrl}
                            alt={`${item.name} thumbnail`}
                            className="h-16 w-16 rounded-md object-cover"
                            loading="lazy"
                          />
                          {enableQuickPreview && (
                            <Button
                              variant="secondary"
                              size="sm"
                              className="absolute -top-2 -right-2 h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={(e) => {
                                e.stopPropagation();
                                // TODO: Implement quick preview modal
                              }}
                            >
                              <Eye className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
          );
        })}
      </div>

      {/* Load more button */}
      {results.hasMore && (
        <div className="flex justify-center pt-4">
          <Button
            onClick={onLoadMore}
            disabled={isLoadingMore}
            variant="outline"
            className="min-w-32"
          >
            {isLoadingMore ? (
              <>
                <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                Loading...
              </>
            ) : (
              'Load More Results'
            )}
          </Button>
        </div>
      )}

      {/* Results summary for screen readers */}
      <div className="sr-only" aria-live="polite" role="status">
        {results.totalCount === 0 
          ? `No search results found${query ? ` for "${query}"` : ''}`
          : `Showing ${results.items.length} of ${results.totalCount} search results${query ? ` for "${query}"` : ''}`
        }
        {!securityValidated && 'Warning: Some highlighted content may not be secure'}
      </div>

      {/* Performance warnings */}
      {Object.keys(highlightingPerformance).length > 0 && (
        <div className="sr-only">
          Performance warning: Text highlighting exceeded 50ms for some results
        </div>
      )}
    </div>
  );
}

export default SearchResults;