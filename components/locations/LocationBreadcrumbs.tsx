/**
 * LocationBreadcrumbs Component
 * 
 * Displays hierarchical location paths with navigation capabilities and
 * accessibility features for location drill-down functionality.
 * 
 * @category Components
 * @subcategory Locations
 * @since 1.5.0
 */

'use client';

import React from 'react';
import { ChevronRight, MapPin, Home } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

/**
 * Individual path component for breadcrumb navigation.
 */
export interface LocationPathComponent {
  /** Unique identifier for the location */
  id: string;
  /** Display name of the location */
  name: string;
}

/**
 * Props for the LocationBreadcrumbs component.
 */
export interface LocationBreadcrumbsProps {
  /** Array of path components from root to current location */
  pathComponents: LocationPathComponent[];
  
  /** Callback when a location in the breadcrumb is clicked */
  onLocationClick?: (locationId: string, locationName: string) => void;
  
  /** Whether the breadcrumbs are clickable for navigation */
  interactive?: boolean;
  
  /** Maximum number of components to show before truncating */
  maxComponents?: number;
  
  /** Custom separator icon/text between breadcrumb items */
  separator?: React.ReactNode;
  
  /** Additional CSS class names */
  className?: string;
  
  /** Size variant for the breadcrumbs */
  size?: 'sm' | 'md' | 'lg';
  
  /** Whether to show a home icon for the root location */
  showHomeIcon?: boolean;
  
  /** Custom aria-label for accessibility */
  ariaLabel?: string;
}

/**
 * LocationBreadcrumbs component for hierarchical location path display.
 * 
 * Provides an accessible navigation interface for location hierarchies with
 * truncation support for long paths, keyboard navigation, and customizable
 * appearance. Follows ARIA breadcrumb navigation patterns.
 * 
 * @param props - LocationBreadcrumbs component props
 * @returns JSX.Element The rendered location breadcrumbs
 * 
 * @example Basic usage
 * ```tsx
 * <LocationBreadcrumbs
 *   pathComponents={[
 *     { id: '1', name: 'House' },
 *     { id: '2', name: 'Garage' },
 *     { id: '3', name: 'Workbench' }
 *   ]}
 *   onLocationClick={(id, name) => navigateToLocation(id)}
 * />
 * ```
 * 
 * @example With truncation
 * ```tsx
 * <LocationBreadcrumbs
 *   pathComponents={longPath}
 *   maxComponents={3}
 *   interactive={true}
 *   showHomeIcon={true}
 * />
 * ```
 */
export function LocationBreadcrumbs({
  pathComponents,
  onLocationClick,
  interactive = true,
  maxComponents = 4,
  separator = <ChevronRight className="h-4 w-4 text-muted-foreground" />,
  className,
  size = 'md',
  showHomeIcon = true,
  ariaLabel = 'Location breadcrumb navigation',
}: LocationBreadcrumbsProps) {
  // Handle empty or invalid path
  if (!pathComponents || pathComponents.length === 0) {
    return null;
  }

  // Size classes
  const sizeClasses = {
    sm: 'text-xs gap-1',
    md: 'text-sm gap-2', 
    lg: 'text-base gap-3',
  };

  const buttonSizeClasses = {
    sm: 'h-6 px-2 text-xs',
    md: 'h-8 px-3 text-sm',
    lg: 'h-10 px-4 text-base',
  };

  // Handle path truncation if needed
  let displayComponents = pathComponents;
  let showEllipsis = false;

  if (pathComponents.length > maxComponents) {
    showEllipsis = true;
    // Show first item, ellipsis, and last (maxComponents - 2) items
    const keepLast = maxComponents - 2;
    displayComponents = [
      pathComponents[0],
      ...pathComponents.slice(-keepLast),
    ];
  }

  // Handle location click
  const handleLocationClick = (component: LocationPathComponent) => {
    if (interactive && onLocationClick) {
      onLocationClick(component.id, component.name);
    }
  };

  // Handle keyboard navigation
  const handleKeyDown = (
    e: React.KeyboardEvent,
    component: LocationPathComponent
  ) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleLocationClick(component);
    }
  };

  return (
    <nav
      aria-label={ariaLabel}
      className={cn('flex items-center', sizeClasses[size], className)}
    >
      <ol className="flex items-center gap-1 min-w-0">
        {displayComponents.map((component, index) => {
          const isFirst = index === 0;
          const isLast = index === displayComponents.length - 1;
          const isClickable = interactive && !isLast; // Last item is usually current location

          return (
            <li key={component.id} className="flex items-center gap-1 min-w-0">
              {/* Separator (except for first item) */}
              {!isFirst && (
                <span className="flex-shrink-0" aria-hidden="true">
                  {separator}
                </span>
              )}
              
              {/* Ellipsis indicator */}
              {showEllipsis && index === 1 && (
                <>
                  <span 
                    className="flex-shrink-0 px-2 text-muted-foreground"
                    aria-label="Additional locations not shown"
                  >
                    ...
                  </span>
                  <span className="flex-shrink-0" aria-hidden="true">
                    {separator}
                  </span>
                </>
              )}

              {/* Location item */}
              {isClickable ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleLocationClick(component)}
                  onKeyDown={(e) => handleKeyDown(e, component)}
                  className={cn(
                    'justify-start min-w-0 h-auto p-1 font-normal hover:bg-accent/50',
                    buttonSizeClasses[size]
                  )}
                  aria-current={isLast ? 'location' : undefined}
                >
                  {isFirst && showHomeIcon && (
                    <Home className="h-3 w-3 mr-1 flex-shrink-0" />
                  )}
                  {!isFirst && !showHomeIcon && (
                    <MapPin className="h-3 w-3 mr-1 flex-shrink-0" />
                  )}
                  <span className="truncate">{component.name}</span>
                </Button>
              ) : (
                <span
                  className={cn(
                    'flex items-center min-w-0 px-1',
                    isLast ? 'font-medium text-foreground' : 'text-muted-foreground'
                  )}
                  aria-current={isLast ? 'location' : undefined}
                >
                  {isFirst && showHomeIcon && (
                    <Home className="h-3 w-3 mr-1 flex-shrink-0" />
                  )}
                  {!isFirst && !showHomeIcon && (
                    <MapPin className="h-3 w-3 mr-1 flex-shrink-0" />
                  )}
                  <span className="truncate" title={component.name}>
                    {component.name}
                  </span>
                </span>
              )}
            </li>
          );
        })}
      </ol>

      {/* Screen reader summary */}
      <div className="sr-only">
        Location path: {pathComponents.map(c => c.name).join(' → ')}
      </div>
    </nav>
  );
}

export default LocationBreadcrumbs;