/**
 * useSearch Hook
 * 
 * A React hook that manages search state and API calls for inventory items.
 * Provides debounced search, loading states, error handling, and result caching.
 * 
 * @category Hooks
 * @since 1.4.0
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useDebounce } from './useDebounce';
import type { SearchQuery, SearchResults, SearchSuggestion } from '@/lib/types/search';

/**
 * Search hook configuration options.
 */
export interface UseSearchOptions {
  /** Debounce delay in milliseconds */
  debounceMs?: number;
  /** Minimum query length before searching */
  minQueryLength?: number;
  /** Whether to automatically search on query changes */
  autoSearch?: boolean;
  /** Whether to include location data in results */
  includeLocation?: boolean;
  /** Whether to include photo data in results */
  includePhotos?: boolean;
  /** Whether to include tag data in results */
  includeTags?: boolean;
  /** Default limit for search results */
  defaultLimit?: number;
}

/**
 * Search hook state and methods.
 */
export interface UseSearchReturn {
  // State
  query: string;
  results: SearchResults | null;
  suggestions: SearchSuggestion[];
  isLoading: boolean;
  isLoadingSuggestions: boolean;
  error: string | null;
  hasSearched: boolean;

  // Actions
  setQuery: (query: string) => void;
  search: (query?: string, options?: Partial<SearchQuery>) => Promise<void>;
  getSuggestions: (query?: string) => Promise<void>;
  clearResults: () => void;
  clearError: () => void;

  // Pagination
  loadMore: () => Promise<void>;
  canLoadMore: boolean;

  // Performance
  responseTime: number | null;
  searchMethod: string | null;
}

/**
 * Custom hook for managing search functionality.
 * 
 * This hook provides a complete search solution with debouncing, caching,
 * error handling, and pagination support. It automatically handles API
 * calls and state management for search operations.
 * 
 * @param options - Configuration options for search behavior
 * @returns Search state and methods
 * 
 * @example Basic search usage
 * ```typescript
 * function SearchPage() {
 *   const {
 *     query,
 *     results,
 *     isLoading,
 *     error,
 *     setQuery,
 *     search,
 *     clearResults,
 *   } = useSearch({
 *     debounceMs: 300,
 *     minQueryLength: 2,
 *     autoSearch: true,
 *     includeLocation: true,
 *   });
 * 
 *   return (
 *     <div>
 *       <input
 *         value={query}
 *         onChange={(e) => setQuery(e.target.value)}
 *         placeholder="Search items..."
 *       />
 *       {isLoading && <div>Searching...</div>}
 *       {error && <div>Error: {error}</div>}
 *       {results && (
 *         <div>
 *           Found {results.totalCount} items
 *           {results.items.map(item => (
 *             <div key={item.id}>{item.name}</div>
 *           ))}
 *         </div>
 *       )}
 *     </div>
 *   );
 * }
 * ```
 */
export function useSearch(options: UseSearchOptions = {}): UseSearchReturn {
  const {
    debounceMs = 300,
    minQueryLength = 2,
    autoSearch = true,
    includeLocation = false,
    includePhotos = false,
    includeTags = false,
    defaultLimit = 20,
  } = options;

  // State
  const [query, setQueryState] = useState('');
  const [results, setResults] = useState<SearchResults | null>(null);
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [responseTime, setResponseTime] = useState<number | null>(null);
  const [searchMethod, setSearchMethod] = useState<string | null>(null);

  // Refs for managing requests
  const searchAbortControllerRef = useRef<AbortController | null>(null);
  const suggestionsAbortControllerRef = useRef<AbortController | null>(null);

  // Debounced query for automatic searching
  const debouncedQuery = useDebounce(query, debounceMs);

  // Set query and clear previous results/errors
  const setQuery = useCallback((newQuery: string) => {
    setQueryState(newQuery);
    setError(null);
    
    // Clear results if query is too short
    if (newQuery.length < minQueryLength) {
      setResults(null);
      setHasSearched(false);
    }
  }, [minQueryLength]);

  // Execute search API call
  const search = useCallback(async (
    searchQuery?: string, 
    searchOptions?: Partial<SearchQuery>
  ) => {
    const queryToSearch = searchQuery || query;
    
    // Validate query length
    if (queryToSearch.length < minQueryLength) {
      return;
    }

    // Cancel previous search
    if (searchAbortControllerRef.current) {
      searchAbortControllerRef.current.abort();
    }

    // Create new abort controller
    const abortController = new AbortController();
    searchAbortControllerRef.current = abortController;

    setIsLoading(true);
    setError(null);

    try {
      const searchParams = new URLSearchParams({
        q: queryToSearch,
        limit: (searchOptions?.limit || defaultLimit).toString(),
        offset: (searchOptions?.offset || 0).toString(),
        includeLocation: (searchOptions?.includeLocation ?? includeLocation).toString(),
        includePhotos: (searchOptions?.includePhotos ?? includePhotos).toString(),
        includeTags: (searchOptions?.includeTags ?? includeTags).toString(),
      });

      const response = await fetch(`/api/v1/search?${searchParams}`, {
        signal: abortController.signal,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Search failed');
      }

      const data = await response.json();
      setResults(data.data);
      setResponseTime(data.data.responseTime);
      setSearchMethod(data.data.searchMethod);
      setHasSearched(true);

    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setError(err.message);
      }
    } finally {
      setIsLoading(false);
      searchAbortControllerRef.current = null;
    }
  }, [query, minQueryLength, defaultLimit, includeLocation, includePhotos, includeTags]);

  // Get search suggestions
  const getSuggestions = useCallback(async (suggestionQuery?: string) => {
    const queryToSearch = suggestionQuery || query;
    
    if (queryToSearch.length === 0) {
      setSuggestions([]);
      return;
    }

    // Cancel previous suggestion request
    if (suggestionsAbortControllerRef.current) {
      suggestionsAbortControllerRef.current.abort();
    }

    // Create new abort controller
    const abortController = new AbortController();
    suggestionsAbortControllerRef.current = abortController;

    setIsLoadingSuggestions(true);

    try {
      const searchParams = new URLSearchParams({
        text: queryToSearch,
        limit: '5',
      });

      const response = await fetch(`/api/v1/search/suggestions?${searchParams}`, {
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new Error('Failed to get suggestions');
      }

      const data = await response.json();
      setSuggestions(data.data.suggestions || []);

    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        // Silently fail for suggestions - not critical
        console.warn('Failed to get suggestions:', err.message);
      }
    } finally {
      setIsLoadingSuggestions(false);
      suggestionsAbortControllerRef.current = null;
    }
  }, [query]);

  // Load more results (pagination)
  const loadMore = useCallback(async () => {
    if (!results || !results.hasMore || isLoading) {
      return;
    }

    await search(query, {
      offset: results.items.length,
      limit: defaultLimit,
    });
  }, [results, isLoading, search, query, defaultLimit]);

  // Clear results
  const clearResults = useCallback(() => {
    setResults(null);
    setSuggestions([]);
    setHasSearched(false);
    setError(null);
    setResponseTime(null);
    setSearchMethod(null);
    
    // Cancel any pending requests
    if (searchAbortControllerRef.current) {
      searchAbortControllerRef.current.abort();
    }
    if (suggestionsAbortControllerRef.current) {
      suggestionsAbortControllerRef.current.abort();
    }
  }, []);

  // Clear error
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Auto-search when debounced query changes
  useEffect(() => {
    if (autoSearch && debouncedQuery.length >= minQueryLength) {
      search(debouncedQuery);
    }
  }, [debouncedQuery, autoSearch, minQueryLength, search]);

  // Auto-get suggestions when query changes
  useEffect(() => {
    if (query.length > 0) {
      getSuggestions(query);
    } else {
      setSuggestions([]);
    }
  }, [query, getSuggestions]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (searchAbortControllerRef.current) {
        searchAbortControllerRef.current.abort();
      }
      if (suggestionsAbortControllerRef.current) {
        suggestionsAbortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    // State
    query,
    results,
    suggestions,
    isLoading,
    isLoadingSuggestions,
    error,
    hasSearched,

    // Actions
    setQuery,
    search,
    getSuggestions,
    clearResults,
    clearError,

    // Pagination
    loadMore,
    canLoadMore: Boolean(results?.hasMore && !isLoading),

    // Performance
    responseTime,
    searchMethod,
  };
}

/**
 * Search suggestions hook with separate state management.
 * 
 * Lightweight hook focused specifically on search suggestions/autocomplete.
 * 
 * @param options - Configuration options
 * @returns Suggestions state and methods
 */
export function useSearchSuggestions(options: {
  debounceMs?: number;
  minQueryLength?: number;
} = {}) {
  const { debounceMs = 150, minQueryLength = 1 } = options;
  
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const debouncedQuery = useDebounce(query, debounceMs);

  useEffect(() => {
    if (debouncedQuery.length >= minQueryLength) {
      setIsLoading(true);
      
      const searchParams = new URLSearchParams({
        text: debouncedQuery,
        limit: '5',
      });

      fetch(`/api/v1/search/suggestions?${searchParams}`)
        .then(res => res.json())
        .then(data => {
          setSuggestions(data.data.suggestions || []);
        })
        .catch(err => {
          console.warn('Failed to get suggestions:', err);
          setSuggestions([]);
        })
        .finally(() => {
          setIsLoading(false);
        });
    } else {
      setSuggestions([]);
    }
  }, [debouncedQuery, minQueryLength]);

  return {
    query,
    setQuery,
    suggestions,
    isLoading,
  };
}