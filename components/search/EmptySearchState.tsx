/**
 * EmptySearchState Component
 * 
 * A helpful component displayed when search results are empty, providing
 * users with search tips, suggestions, and alternative actions.
 * 
 * @category Components
 * @subcategory Search
 * @since 1.4.0
 */

'use client';

import React from 'react';
import { Search, Lightbulb, Plus, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

/**
 * Props for the EmptySearchState component.
 */
export interface EmptySearchStateProps {
  /** The search query that returned no results */
  query?: string;
  
  /** Whether this is the first search or a subsequent one */
  hasSearched?: boolean;
  
  /** Callback when user clicks "Try Again" */
  onTryAgain?: () => void;
  
  /** Callback when user clicks "Add Item" */
  onAddItem?: () => void;
  
  /** Callback when user clicks a suggestion */
  onSuggestionClick?: (suggestion: string) => void;
  
  /** Custom search suggestions to display */
  suggestions?: string[];
  
  /** Additional CSS class names */
  className?: string;
  
  /** Custom title override */
  title?: string;
  
  /** Custom description override */
  description?: string;
  
  /** Whether to show search tips */
  showTips?: boolean;
  
  /** Whether to show suggestion examples */
  showSuggestions?: boolean;
  
  /** Whether to show action buttons */
  showActions?: boolean;
}

/**
 * Default search suggestions for common inventory items.
 */
const DEFAULT_SUGGESTIONS = [
  'power tools',
  'kitchen appliances',
  'electronics',
  'furniture',
  'books',
  'sports equipment',
  'garden tools',
  'office supplies',
];

/**
 * Search tips to help users improve their search results.
 */
const SEARCH_TIPS = [
  {
    icon: <Search className="h-4 w-4" />,
    title: 'Try different keywords',
    description: 'Use alternative words like "drill" instead of "power tool"',
  },
  {
    icon: <Lightbulb className="h-4 w-4" />,
    title: 'Search by location',
    description: 'Try searching for "garage", "kitchen", or other room names',
  },
  {
    icon: <Badge className="h-4 w-4" />,
    title: 'Use partial matches',
    description: 'Search for "screw" to find "screwdriver" or "screws"',
  },
];

/**
 * EmptySearchState component for displaying helpful content when no results are found.
 * 
 * Provides users with actionable guidance when their search returns no results,
 * including search tips, example suggestions, and alternative actions. Helps
 * users understand how to improve their search experience.
 * 
 * @param props - EmptySearchState component props
 * @returns JSX.Element The rendered empty search state component
 * 
 * @example Basic usage
 * ```tsx
 * <EmptySearchState
 *   query="rare vintage item"
 *   hasSearched={true}
 *   onTryAgain={() => setQuery('')}
 *   onAddItem={() => navigate('/items/new')}
 * />
 * ```
 * 
 * @example With custom suggestions
 * ```tsx
 * <EmptySearchState
 *   query={searchQuery}
 *   suggestions={['laptop', 'monitor', 'keyboard', 'mouse']}
 *   onSuggestionClick={(suggestion) => {
 *     setQuery(suggestion);
 *     performSearch(suggestion);
 *   }}
 *   showTips={true}
 *   showActions={true}
 * />
 * ```
 */
export function EmptySearchState({
  query,
  hasSearched = true,
  onTryAgain,
  onAddItem,
  onSuggestionClick,
  suggestions = DEFAULT_SUGGESTIONS,
  className,
  title,
  description,
  showTips = true,
  showSuggestions = true,
  showActions = true,
}: EmptySearchStateProps) {
  // Determine the appropriate title and description
  const displayTitle = title || (
    query 
      ? `No items found for "${query}"`
      : hasSearched 
        ? 'No search results found'
        : 'Start searching your inventory'
  );

  const displayDescription = description || (
    query
      ? 'Try adjusting your search terms or check the suggestions below.'
      : hasSearched
        ? 'Try a different search term or browse by category.'
        : 'Enter a search term to find items in your household inventory.'
  );

  return (
    <div 
      className={cn('flex flex-col items-center justify-center py-12 px-4', className)}
      role="region"
      aria-label="Empty search results"
    >
      <div className="w-full max-w-2xl space-y-6 text-center">
        {/* Main icon and message */}
        <div className="space-y-4">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-muted">
            <Search className="h-10 w-10 text-muted-foreground" />
          </div>
          
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold text-foreground">
              {displayTitle}
            </h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              {displayDescription}
            </p>
          </div>
        </div>

        {/* Search tips */}
        {showTips && (
          <Card>
            <CardHeader className="pb-3">
              <h3 className="font-medium flex items-center gap-2">
                <Lightbulb className="h-4 w-4" />
                Search Tips
              </h3>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="grid gap-3 md:grid-cols-3">
                {SEARCH_TIPS.map((tip, index) => (
                  <div key={index} className="space-y-1">
                    <div className="flex items-center gap-2 font-medium text-sm">
                      {tip.icon}
                      {tip.title}
                    </div>
                    <p className="text-xs text-muted-foreground text-left">
                      {tip.description}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Search suggestions */}
        {showSuggestions && suggestions.length > 0 && (
          <div className="space-y-3">
            <h3 className="font-medium text-sm text-muted-foreground">
              Try searching for:
            </h3>
            <div className="flex flex-wrap justify-center gap-2">
              {suggestions.slice(0, 8).map((suggestion, index) => (
                <Button
                  key={index}
                  variant="outline"
                  size="sm"
                  onClick={() => onSuggestionClick?.(suggestion)}
                  className="text-sm hover:bg-primary hover:text-primary-foreground"
                >
                  {suggestion}
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Action buttons */}
        {showActions && (
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            {onTryAgain && (
              <Button
                onClick={onTryAgain}
                variant="outline"
                className="flex items-center gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                Try Different Search
              </Button>
            )}
            
            {onAddItem && (
              <Button
                onClick={onAddItem}
                className="flex items-center gap-2"
              >
                <Plus className="h-4 w-4" />
                Add New Item
              </Button>
            )}
          </div>
        )}

        {/* Additional help text */}
        <div className="pt-4 border-t border-muted">
          <p className="text-xs text-muted-foreground">
            Can&apos;t find what you&apos;re looking for?{' '}
            <button
              onClick={onAddItem}
              className="text-primary hover:underline focus:outline-none focus:underline"
            >
              Add it to your inventory
            </button>
            {' '}or try browsing by category.
          </p>
        </div>
      </div>

      {/* Screen reader announcement */}
      <div className="sr-only" aria-live="polite" role="status">
        {query 
          ? `No search results found for "${query}". Try adjusting your search terms.`
          : 'No search results to display. Enter a search term to find items.'
        }
      </div>
    </div>
  );
}

/**
 * Simplified empty state for loading or initial states.
 */
export function SimpleEmptySearchState({
  message = 'Start typing to search your inventory',
  icon: Icon = Search,
  className,
}: {
  message?: string;
  icon?: React.ComponentType<{ className?: string }>;
  className?: string;
}) {
  return (
    <div 
      className={cn('flex flex-col items-center justify-center py-8 text-center', className)}
      role="region"
      aria-label="Empty search state"
    >
      <div className="space-y-3">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <Icon className="h-6 w-6 text-muted-foreground" />
        </div>
        <p className="text-muted-foreground text-sm max-w-xs">
          {message}
        </p>
      </div>
    </div>
  );
}

export default EmptySearchState;