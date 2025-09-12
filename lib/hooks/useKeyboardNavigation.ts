/**
 * Keyboard Navigation Hook for Search Results
 * 
 * Provides comprehensive keyboard navigation support for search result lists
 * with accessibility features including focus management, ARIA announcements,
 * and proper keyboard event handling.
 * 
 * @category Hooks
 * @subcategory Accessibility
 * @since 1.5.1
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Configuration options for keyboard navigation.
 */
export interface KeyboardNavigationOptions {
  /** Whether keyboard navigation is enabled */
  enabled?: boolean;
  /** Whether to wrap around when reaching the end/beginning */
  wrapAround?: boolean;
  /** Whether to auto-focus the first item on mount */
  autoFocusFirst?: boolean;
  /** Custom key bindings */
  keyBindings?: {
    next?: string[];
    previous?: string[];
    select?: string[];
    escape?: string[];
  };
  /** Callback when an item is selected via keyboard */
  onSelect?: (index: number) => void;
  /** Callback when navigation changes */
  onNavigate?: (index: number) => void;
  /** ARIA label for the navigation container */
  ariaLabel?: string;
}

/**
 * Navigation state and handlers.
 */
export interface KeyboardNavigationState {
  /** Currently focused item index */
  focusedIndex: number;
  /** Whether keyboard navigation is active */
  isNavigating: boolean;
  /** Reference to attach to the container element */
  containerRef: React.RefObject<HTMLElement>;
  /** Array of refs for navigable items */
  itemRefs: React.RefObject<(HTMLElement | null)[]>;
  /** Keyboard event handler for the container */
  onKeyDown: (event: React.KeyboardEvent) => void;
  /** Focus a specific item by index */
  focusItem: (index: number) => void;
  /** Reset navigation state */
  reset: () => void;
  /** Set the total number of navigable items */
  setItemCount: (count: number) => void;
}

/**
 * Default keyboard navigation options.
 */
const DEFAULT_OPTIONS: Required<KeyboardNavigationOptions> = {
  enabled: true,
  wrapAround: true,
  autoFocusFirst: false,
  keyBindings: {
    next: ['ArrowDown', 'ArrowRight'],
    previous: ['ArrowUp', 'ArrowLeft'],
    select: ['Enter', ' '],
    escape: ['Escape'],
  },
  onSelect: () => {},
  onNavigate: () => {},
  ariaLabel: 'Search results navigation',
};

/**
 * Custom hook for keyboard navigation in search results.
 * 
 * Provides comprehensive keyboard navigation with focus management, ARIA support,
 * and customizable key bindings for accessible search result interaction.
 * 
 * @param itemCount - Total number of navigable items
 * @param options - Navigation configuration options
 * @returns Navigation state and handlers
 * 
 * @example Basic usage
 * ```tsx
 * const { containerRef, itemRefs, onKeyDown, focusedIndex } = useKeyboardNavigation(
 *   searchResults.length,
 *   {
 *     onSelect: (index) => handleItemClick(searchResults[index]),
 *     onNavigate: (index) => announceCurrentItem(searchResults[index])
 *   }
 * );
 * ```
 * 
 * @example With custom key bindings
 * ```tsx
 * const navigation = useKeyboardNavigation(items.length, {
 *   keyBindings: {
 *     next: ['ArrowDown', 'j'],
 *     previous: ['ArrowUp', 'k'],
 *     select: ['Enter', 'Space'],
 *     escape: ['Escape', 'q']
 *   },
 *   wrapAround: false
 * });
 * ```
 */
export function useKeyboardNavigation(
  initialItemCount: number = 0,
  options: KeyboardNavigationOptions = {}
): KeyboardNavigationState {
  const mergedOptions = { ...DEFAULT_OPTIONS, ...options };
  const { 
    enabled, 
    wrapAround, 
    autoFocusFirst, 
    keyBindings, 
    onSelect, 
    onNavigate,
    ariaLabel 
  } = mergedOptions;

  // State
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const [isNavigating, setIsNavigating] = useState<boolean>(false);
  const [itemCount, setItemCount] = useState<number>(initialItemCount);

  // Refs
  const containerRef = useRef<HTMLElement>(null);
  const itemRefs = useRef<(HTMLElement | null)[]>([]);
  const announcementRef = useRef<HTMLDivElement>(null);

  // Initialize item refs array when count changes
  useEffect(() => {
    itemRefs.current = Array.from({ length: itemCount }, (_, i) => itemRefs.current[i] || null);
  }, [itemCount]);

  // Auto-focus first item if enabled
  useEffect(() => {
    if (enabled && autoFocusFirst && itemCount > 0 && focusedIndex === -1) {
      setFocusedIndex(0);
      setIsNavigating(true);
    }
  }, [enabled, autoFocusFirst, itemCount, focusedIndex]);

  // Focus management
  const focusItem = useCallback((index: number) => {
    if (!enabled || index < 0 || index >= itemCount) return;

    const item = itemRefs.current[index];
    if (item) {
      item.focus();
      setFocusedIndex(index);
      setIsNavigating(true);
      onNavigate(index);

      // Announce to screen readers
      announceToScreenReader(`Item ${index + 1} of ${itemCount} focused`);
    }
  }, [enabled, itemCount, onNavigate]);

  // Screen reader announcements
  const announceToScreenReader = useCallback((message: string) => {
    if (announcementRef.current) {
      announcementRef.current.textContent = message;
    }
  }, []);

  // Navigate to next item
  const navigateNext = useCallback(() => {
    if (!enabled || itemCount === 0) return;

    let nextIndex = focusedIndex + 1;
    
    if (nextIndex >= itemCount) {
      if (wrapAround) {
        nextIndex = 0;
      } else {
        return; // Don't navigate beyond last item
      }
    }

    focusItem(nextIndex);
  }, [enabled, itemCount, focusedIndex, wrapAround, focusItem]);

  // Navigate to previous item
  const navigatePrevious = useCallback(() => {
    if (!enabled || itemCount === 0) return;

    let prevIndex = focusedIndex - 1;
    
    if (prevIndex < 0) {
      if (wrapAround) {
        prevIndex = itemCount - 1;
      } else {
        return; // Don't navigate before first item
      }
    }

    focusItem(prevIndex);
  }, [enabled, itemCount, focusedIndex, wrapAround, focusItem]);

  // Select current item
  const selectCurrentItem = useCallback(() => {
    if (!enabled || focusedIndex < 0 || focusedIndex >= itemCount) return;

    onSelect(focusedIndex);
    announceToScreenReader(`Item ${focusedIndex + 1} selected`);
  }, [enabled, focusedIndex, itemCount, onSelect]);

  // Reset navigation state
  const reset = useCallback(() => {
    setFocusedIndex(-1);
    setIsNavigating(false);
    announceToScreenReader('Navigation reset');
  }, []);

  // Keyboard event handler
  const onKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (!enabled) return;

    const { key } = event;

    // Check for navigation keys
    if (keyBindings.next?.includes(key)) {
      event.preventDefault();
      navigateNext();
      return;
    }

    if (keyBindings.previous?.includes(key)) {
      event.preventDefault();
      navigatePrevious();
      return;
    }

    if (keyBindings.select?.includes(key)) {
      event.preventDefault();
      selectCurrentItem();
      return;
    }

    if (keyBindings.escape?.includes(key)) {
      event.preventDefault();
      reset();
      return;
    }

    // Handle number keys for direct navigation (1-9)
    if (/^[1-9]$/.test(key)) {
      const index = parseInt(key, 10) - 1;
      if (index < itemCount) {
        event.preventDefault();
        focusItem(index);
      }
      return;
    }

    // Handle Home/End keys
    if (key === 'Home') {
      event.preventDefault();
      focusItem(0);
      return;
    }

    if (key === 'End') {
      event.preventDefault();
      focusItem(itemCount - 1);
      return;
    }
  }, [enabled, keyBindings, navigateNext, navigatePrevious, selectCurrentItem, reset, focusItem, itemCount]);

  // Handle mouse interactions to sync with keyboard navigation
  const handleMouseEnter = useCallback((index: number) => {
    if (enabled && isNavigating) {
      setFocusedIndex(index);
    }
  }, [enabled, isNavigating]);

  // Set up container ARIA attributes
  useEffect(() => {
    if (containerRef.current && enabled) {
      const container = containerRef.current;
      container.setAttribute('role', 'listbox');
      container.setAttribute('aria-label', ariaLabel);
      container.setAttribute('aria-activedescendant', 
        focusedIndex >= 0 ? `search-result-${focusedIndex}` : '');
      
      // Make container focusable if no specific item is focused
      if (focusedIndex === -1) {
        container.tabIndex = 0;
      } else {
        container.tabIndex = -1;
      }
    }
  }, [enabled, ariaLabel, focusedIndex]);

  // Set up item ARIA attributes
  useEffect(() => {
    itemRefs.current.forEach((item, index) => {
      if (item && enabled) {
        item.setAttribute('role', 'option');
        item.setAttribute('id', `search-result-${index}`);
        item.setAttribute('aria-selected', (index === focusedIndex).toString());
        item.tabIndex = index === focusedIndex ? 0 : -1;
        
        // Add mouse event handlers
        item.onmouseenter = () => handleMouseEnter(index);
      }
    });
  }, [enabled, focusedIndex, handleMouseEnter]);

  return {
    focusedIndex,
    isNavigating,
    containerRef,
    itemRefs,
    onKeyDown,
    focusItem,
    reset,
    setItemCount,
  };
}