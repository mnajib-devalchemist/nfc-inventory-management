/**
 * SearchBar Component
 * 
 * A comprehensive search input component with debounced input, autocomplete
 * suggestions, accessibility features, and keyboard navigation support.
 * 
 * @category Components
 * @subcategory Search
 * @since 1.4.0
 */

'use client';

import React, { useState, useRef, useCallback, useEffect, KeyboardEvent } from 'react';
import { Search, X, Clock, MapPin, Tag } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useSearchSuggestions } from '@/lib/hooks/useSearch';
import type { SearchSuggestion } from '@/lib/types/search';

/**
 * Props for the SearchBar component.
 */
export interface SearchBarProps {
  /** Current search query value */
  value?: string;
  
  /** Callback when search query changes */
  onChange?: (query: string) => void;
  
  /** Callback when user performs search (Enter key or search button) */
  onSearch?: (query: string) => void;
  
  /** Callback when user selects a suggestion */
  onSuggestionSelect?: (suggestion: SearchSuggestion) => void;
  
  /** Placeholder text for the input */
  placeholder?: string;
  
  /** Whether the search is currently loading */
  isLoading?: boolean;
  
  /** Whether to show search suggestions */
  showSuggestions?: boolean;
  
  /** Whether the component is disabled */
  disabled?: boolean;
  
  /** Additional CSS class names */
  className?: string;
  
  /** Size variant of the search bar */
  size?: 'sm' | 'md' | 'lg';
  
  /** Whether to auto-focus the input */
  autoFocus?: boolean;
  
  /** Maximum number of suggestions to show */
  maxSuggestions?: number;
}

/**
 * SearchBar component with autocomplete and accessibility features.
 * 
 * Provides a modern search interface with debounced input, real-time suggestions,
 * keyboard navigation, and comprehensive accessibility support. Follows ARIA
 * patterns for combobox components.
 * 
 * @param props - SearchBar component props
 * @returns JSX.Element The rendered search bar component
 * 
 * @example Basic usage
 * ```tsx
 * <SearchBar
 *   placeholder="Search your items..."
 *   onChange={(query) => setSearchQuery(query)}
 *   onSearch={(query) => performSearch(query)}
 *   isLoading={isSearching}
 * />
 * ```
 * 
 * @example With suggestions
 * ```tsx
 * <SearchBar
 *   value={searchQuery}
 *   onChange={setSearchQuery}
 *   onSearch={handleSearch}
 *   onSuggestionSelect={(suggestion) => {
 *     setSearchQuery(suggestion.text);
 *     handleSearch(suggestion.text);
 *   }}
 *   showSuggestions={true}
 *   maxSuggestions={8}
 * />
 * ```
 */
export function SearchBar({
  value = '',
  onChange,
  onSearch,
  onSuggestionSelect,
  placeholder = 'Search your items...',
  isLoading = false,
  showSuggestions = true,
  disabled = false,
  className,
  size = 'md',
  autoFocus = false,
  maxSuggestions = 5,
}: SearchBarProps) {
  // Local state
  const [internalValue, setInternalValue] = useState(value);
  const [isFocused, setIsFocused] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
  const [showSuggestionList, setShowSuggestionList] = useState(false);

  // Refs
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  // Search suggestions hook
  const {
    suggestions,
    isLoading: isLoadingSuggestions,
  } = useSearchSuggestions({
    debounceMs: 150,
    minQueryLength: 1,
  });

  // Update internal value when prop changes
  useEffect(() => {
    setInternalValue(value);
  }, [value]);

  // Handle input change
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInternalValue(newValue);
    setSelectedSuggestionIndex(-1);
    setShowSuggestionList(true);
    onChange?.(newValue);
  }, [onChange]);

  // Handle search execution
  const handleSearch = useCallback((query?: string) => {
    const searchQuery = query || internalValue;
    if (searchQuery.trim()) {
      onSearch?.(searchQuery.trim());
      setShowSuggestionList(false);
      inputRef.current?.blur();
    }
  }, [internalValue, onSearch]);

  // Handle suggestion selection
  const handleSuggestionSelect = useCallback((suggestion: SearchSuggestion) => {
    setInternalValue(suggestion.text);
    setShowSuggestionList(false);
    setSelectedSuggestionIndex(-1);
    
    onChange?.(suggestion.text);
    onSuggestionSelect?.(suggestion);
    
    // Focus back to input
    inputRef.current?.focus();
  }, [onChange, onSuggestionSelect]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions || suggestions.length === 0) {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSearch();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedSuggestionIndex(prev => 
          prev < suggestions.length - 1 ? prev + 1 : prev
        );
        break;
        
      case 'ArrowUp':
        e.preventDefault();
        setSelectedSuggestionIndex(prev => prev > 0 ? prev - 1 : -1);
        break;
        
      case 'Enter':
        e.preventDefault();
        if (selectedSuggestionIndex >= 0) {
          handleSuggestionSelect(suggestions[selectedSuggestionIndex]);
        } else {
          handleSearch();
        }
        break;
        
      case 'Escape':
        e.preventDefault();
        setShowSuggestionList(false);
        setSelectedSuggestionIndex(-1);
        break;
        
      case 'Tab':
        setShowSuggestionList(false);
        break;
    }
  }, [showSuggestions, suggestions, selectedSuggestionIndex, handleSearch, handleSuggestionSelect]);

  // Handle input focus
  const handleFocus = useCallback(() => {
    setIsFocused(true);
    if (showSuggestions && internalValue.length > 0) {
      setShowSuggestionList(true);
    }
  }, [showSuggestions, internalValue]);

  // Handle input blur
  const handleBlur = useCallback(() => {
    setIsFocused(false);
    // Delay hiding suggestions to allow for suggestion clicks
    setTimeout(() => {
      setShowSuggestionList(false);
      setSelectedSuggestionIndex(-1);
    }, 150);
  }, []);

  // Clear search
  const handleClear = useCallback(() => {
    setInternalValue('');
    setShowSuggestionList(false);
    setSelectedSuggestionIndex(-1);
    onChange?.('');
    inputRef.current?.focus();
  }, [onChange]);

  // Click outside handler
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowSuggestionList(false);
        setSelectedSuggestionIndex(-1);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Get suggestion icon based on type
  const getSuggestionIcon = useCallback((type: string) => {
    switch (type) {
      case 'location':
        return <MapPin className="h-4 w-4 text-muted-foreground" />;
      case 'tag':
        return <Tag className="h-4 w-4 text-muted-foreground" />;
      default:
        return <Search className="h-4 w-4 text-muted-foreground" />;
    }
  }, []);

  // Size classes
  const sizeClasses = {
    sm: 'h-8 text-sm',
    md: 'h-10 text-base',
    lg: 'h-12 text-lg',
  };

  // Determine if suggestions should be shown
  const shouldShowSuggestions = showSuggestions && 
    showSuggestionList && 
    suggestions.length > 0 && 
    isFocused;

  return (
    <div 
      ref={containerRef}
      className={cn('relative w-full', className)}
      role="combobox"
      aria-expanded={shouldShowSuggestions}
      aria-haspopup="listbox"
      aria-controls="suggestions-list"
    >
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        
        <Input
          ref={inputRef}
          type="text"
          value={internalValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={placeholder}
          disabled={disabled}
          autoFocus={autoFocus}
          className={cn(
            'pl-10 pr-20',
            sizeClasses[size],
            isFocused && 'ring-2 ring-primary'
          )}
          aria-label="Search inventory items"
          aria-autocomplete="list"
          aria-activedescendant={
            selectedSuggestionIndex >= 0 
              ? `suggestion-${selectedSuggestionIndex}`
              : undefined
          }
        />

        <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
          {/* Loading spinner */}
          {(isLoading || isLoadingSuggestions) && (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          )}
          
          {/* Clear button */}
          {internalValue && !disabled && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleClear}
              className="h-6 w-6 p-0 hover:bg-muted"
              aria-label="Clear search"
            >
              <X className="h-3 w-3" />
            </Button>
          )}
          
          {/* Search button */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => handleSearch()}
            disabled={disabled || !internalValue.trim()}
            className="h-6 w-6 p-0 hover:bg-muted"
            aria-label="Search"
          >
            <Search className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Suggestions dropdown */}
      {shouldShowSuggestions && (
        <div className="absolute top-full z-50 mt-1 w-full rounded-md border bg-popover p-1 shadow-md">
          <div
            id="suggestions-list"
            role="listbox"
            aria-label="Search suggestions"
            className="max-h-60 overflow-y-auto"
          >
            {suggestions.slice(0, maxSuggestions).map((suggestion, index) => (
              <button
                key={`${suggestion.type}-${suggestion.text}`}
                ref={(el) => { suggestionRefs.current[index] = el; }}
                id={`suggestion-${index}`}
                role="option"
                aria-selected={index === selectedSuggestionIndex}
                onClick={() => handleSuggestionSelect(suggestion)}
                onMouseEnter={() => setSelectedSuggestionIndex(index)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-sm px-2 py-2 text-left text-sm hover:bg-accent',
                  index === selectedSuggestionIndex && 'bg-accent'
                )}
              >
                {getSuggestionIcon(suggestion.type)}
                
                <div className="flex-1 min-w-0">
                  <div className="truncate font-medium">
                    {suggestion.text}
                  </div>
                  {suggestion.count > 1 && (
                    <div className="text-xs text-muted-foreground">
                      {suggestion.count} items
                    </div>
                  )}
                </div>
                
                <Badge variant="secondary" className="text-xs">
                  {suggestion.type}
                </Badge>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default SearchBar;