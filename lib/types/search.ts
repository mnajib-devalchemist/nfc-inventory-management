/**
 * Search type definitions for the Digital Inventory Management System.
 * 
 * This module contains all TypeScript type definitions related to search
 * functionality, including query parameters, results, analytics, and
 * configuration types.
 * 
 * @category Types
 * @since 1.4.0
 */

/**
 * Search query parameters for item search operations.
 * 
 * This interface defines all possible parameters for searching items,
 * including text query, pagination, and data inclusion options.
 * 
 * @example Basic search query
 * ```typescript
 * const query: SearchQuery = {
 *   text: 'power drill',
 *   limit: 10,
 *   includeLocation: true
 * };
 * ```
 */
export interface SearchQuery {
  /** 
   * Search text to match against item names, descriptions, and locations.
   * Must be 2-500 characters long.
   */
  text: string;
  
  /** 
   * Maximum number of results to return.
   * @minimum 1
   * @maximum 100
   * @default 20
   */
  limit?: number;
  
  /** 
   * Number of results to skip for pagination.
   * @minimum 0
   * @default 0
   */
  offset?: number;
  
  /** 
   * Whether to include location data in search results.
   * @default false
   */
  includeLocation?: boolean;
  
  /** 
   * Whether to include photo thumbnails in search results.
   * @default false
   */
  includePhotos?: boolean;
  
  /** 
   * Whether to include tag data in search results.
   * @default false
   */
  includeTags?: boolean;
}

/**
 * Location information included in search results.
 * 
 * Contains minimal location data optimized for search result display.
 */
export interface SearchResultLocation {
  /** Unique identifier for the location */
  id: string;
  
  /** Display name of the location */
  name: string;
  
  /** Full hierarchical path to the location (e.g., "House > Garage > Workbench") */
  path: string;
}

/**
 * Photo information included in search results.
 * 
 * Contains minimal photo data optimized for thumbnail display.
 */
export interface SearchResultPhoto {
  /** Unique identifier for the photo */
  id: string;
  
  /** URL to the optimized thumbnail image */
  thumbnailUrl: string;
  
  /** Whether this is the primary photo for the item */
  isPrimary: boolean;
}

/**
 * Tag information included in search results.
 * 
 * Contains tag data for category and visual display.
 */
export interface SearchResultTag {
  /** Unique identifier for the tag */
  id: string;
  
  /** Display name of the tag */
  name: string;
  
  /** Hex color code for tag visualization */
  color: string;
}

/**
 * Individual search result item.
 * 
 * Represents a single inventory item found by the search operation,
 * with optional additional data based on query parameters.
 */
export interface SearchResult {
  /** Unique identifier for the item */
  id: string;
  
  /** Item name/title */
  name: string;
  
  /** Item description (may be null) */
  description: string | null;
  
  /** Quantity of this item */
  quantity: number;
  
  /** Unit of measurement */
  unit: string;
  
  /** Current item status */
  status: 'AVAILABLE' | 'BORROWED' | 'MAINTENANCE' | 'LOST' | 'SOLD';
  
  /** Current estimated value in USD (may be null) */
  currentValue: number | null;
  
  /** When the item was created */
  createdAt: Date;
  
  /** When the item was last updated */
  updatedAt: Date;
  
  /** Location data (included if includeLocation = true) */
  location?: SearchResultLocation;
  
  /** Photo thumbnails (included if includePhotos = true, max 3) */
  photos?: SearchResultPhoto[];
  
  /** Tags (included if includeTags = true) */
  tags?: SearchResultTag[];
  
  /** 
   * Relevance score from search algorithm.
   * Range: 0.0 (lowest) to 1.0 (highest relevance)
   */
  relevanceScore?: number;
}

/**
 * Complete search operation results.
 * 
 * Contains the search results along with metadata about the search
 * operation including performance metrics and pagination information.
 */
export interface SearchResults {
  /** Array of matching items */
  items: SearchResult[];
  
  /** Total number of items found */
  totalCount: number;
  
  /** Search operation response time in milliseconds */
  responseTime: number;
  
  /** Search method used for this operation */
  searchMethod: SearchMethod;
  
  /** Whether there are more results available (for pagination) */
  hasMore: boolean;
}

/**
 * Search method/strategy used for a search operation.
 * 
 * Indicates which search implementation was used, useful for analytics
 * and debugging performance issues.
 */
export type SearchMethod = 
  | 'full_text_search'    // PostgreSQL tsvector full-text search
  | 'trigram_search'      // pg_trgm similarity search  
  | 'ilike_fallback';     // Basic ILIKE pattern matching

/**
 * Search performance analytics data.
 * 
 * Anonymous performance data collected for search optimization.
 * No actual query text is stored to protect user privacy.
 */
export interface SearchAnalyticsData {
  /** Household ID for segmentation */
  householdId: string;
  
  /** Length of search query (not the actual text) */
  queryLength: number;
  
  /** Number of results returned */
  resultCount: number;
  
  /** Response time in milliseconds */
  responseTime: number;
  
  /** Search method used */
  searchMethod: SearchMethod;
}

/**
 * Search error types for specific error handling.
 * 
 * Categorizes different types of search errors for appropriate
 * user messaging and error recovery.
 */
export type SearchErrorCode = 
  | 'SEARCH_VALIDATION_ERROR'  // Invalid query parameters
  | 'SEARCH_UNAVAILABLE'       // Service temporarily down
  | 'USER_NOT_FOUND'          // Invalid user ID
  | 'NO_HOUSEHOLD'            // User has no household access
  | 'SEARCH_ERROR';           // Generic search error

/**
 * Search suggestion for autocomplete functionality.
 * 
 * Represents a suggested search term based on user's inventory
 * and search history.
 */
export interface SearchSuggestion {
  /** Suggested search text */
  text: string;
  
  /** Type of suggestion (item name, location, tag, etc.) */
  type: 'item' | 'location' | 'tag' | 'description';
  
  /** Number of matching items for this suggestion */
  count: number;
  
  /** Relevance score for ordering suggestions */
  score: number;
}

/**
 * Search autocomplete results.
 * 
 * Contains suggested search terms and their metadata for
 * displaying autocomplete dropdowns.
 */
export interface SearchSuggestions {
  /** Array of search suggestions */
  suggestions: SearchSuggestion[];
  
  /** Whether more suggestions are available */
  hasMore: boolean;
  
  /** Response time for suggestion generation */
  responseTime: number;
}

/**
 * Search filter options for advanced search functionality.
 * 
 * Additional filtering criteria that can be applied to search
 * operations for more precise results.
 */
export interface SearchFilters {
  /** Filter by specific locations */
  locationIds?: string[];
  
  /** Filter by specific tags */
  tagIds?: string[];
  
  /** Filter by item status */
  statuses?: Array<'AVAILABLE' | 'BORROWED' | 'MAINTENANCE' | 'LOST' | 'SOLD'>;
  
  /** Filter by value range */
  valueRange?: {
    min?: number;
    max?: number;
  };
  
  /** Filter by date range */
  dateRange?: {
    from?: Date;
    to?: Date;
  };
  
  /** Filter by quantity range */
  quantityRange?: {
    min?: number;
    max?: number;
  };
}

/**
 * Advanced search query with filtering capabilities.
 * 
 * Extended search query that includes filtering and sorting
 * options for more sophisticated search operations.
 */
export interface AdvancedSearchQuery extends SearchQuery {
  /** Additional filter criteria */
  filters?: SearchFilters;
  
  /** Sort order for results */
  sortBy?: 'relevance' | 'name' | 'date' | 'value' | 'quantity';
  
  /** Sort direction */
  sortOrder?: 'asc' | 'desc';
  
  /** Enable fuzzy matching for typo tolerance */
  fuzzy?: boolean;
}

/**
 * Search capabilities and configuration information.
 * 
 * Describes the current search system capabilities and
 * configuration for client optimization.
 */
export interface SearchCapabilities {
  /** Available database extensions */
  extensionsAvailable: {
    pg_trgm: boolean;
    unaccent: boolean;
    uuid_ossp: boolean;
    fullTextSearchCapable: boolean;
  };
  
  /** Current search configuration */
  configuration: {
    useFullTextSearch: boolean;
    useTrigramSearch: boolean;
    useUnaccent: boolean;
    indexingStrategy: 'background' | 'trigger' | 'manual';
    fallbackToIlike: boolean;
  };
  
  /** Performance statistics */
  statistics: {
    totalSearchVectors: number;
    queuedUpdates: number;
    avgResponseTime: number;
  };
}

/**
 * Search queue status for background processing.
 * 
 * Represents the status of search vector update operations
 * in the background processing queue.
 */
export interface SearchQueueStatus {
  /** Total items in the queue */
  totalQueued: number;
  
  /** Items currently being processed */
  processing: number;
  
  /** Items completed successfully */
  completed: number;
  
  /** Items that failed processing */
  failed: number;
  
  /** Average processing time per item */
  avgProcessingTime: number;
}

/**
 * Search performance metrics for monitoring.
 * 
 * Aggregated performance data for search operations
 * over various time periods.
 */
export interface SearchMetrics {
  /** Time period for these metrics */
  period: '1h' | '1d' | '1w' | '1m';
  
  /** Total number of searches */
  totalSearches: number;
  
  /** Average response time in milliseconds */
  avgResponseTime: number;
  
  /** 95th percentile response time */
  p95ResponseTime: number;
  
  /** Search method usage breakdown */
  methodUsage: Record<SearchMethod, number>;
  
  /** Average results per search */
  avgResultsPerSearch: number;
  
  /** Error rate as percentage */
  errorRate: number;
}

/**
 * Enhanced location information for Story 1.5 navigation features.
 * 
 * Extended location data that includes hierarchical path information
 * for breadcrumb navigation and location drill-down functionality.
 */
export interface EnhancedSearchResultLocation extends SearchResultLocation {
  /** Hierarchical path components for breadcrumb display */
  pathComponents: Array<{
    id: string;
    name: string;
  }>;
  
  /** Full formatted path with separators (e.g., "Garage → Metal Shelf → Red Toolbox") */
  fullPath: string;
}

/**
 * Search highlighting information for text emphasis.
 * 
 * Contains highlighted text with search term emphasis for display purposes.
 * All highlighted content has been security validated against XSS attacks.
 */
export interface SearchHighlight {
  /** Highlighted item name with <mark> tags (XSS safe) */
  nameMatch: string | null;
  
  /** Highlighted description snippet with context (XSS safe) */
  descriptionSnippet: string | null;
  
  /** Highlighted location path (XSS safe) */
  locationMatch: string | null;
  
  /** Whether security validation was successful */
  securityValidated: boolean;
}

/**
 * Enhanced search result item for Story 1.5 with navigation and highlighting.
 * 
 * Extended search result that includes enhanced location data, search highlighting,
 * and additional metadata required for the improved search results interface.
 */
export interface EnhancedSearchResult extends SearchResult {
  /** Enhanced location with hierarchical path data */
  location?: EnhancedSearchResultLocation;
  
  /** Search term highlighting data (security validated) */
  searchHighlight?: SearchHighlight;
  
  /** Navigation metadata for item detail links */
  navigation?: {
    detailUrl: string;
    backToSearchUrl: string;
  };
}

/**
 * Enhanced search results with additional Story 1.5 features.
 * 
 * Extended search results that include enhanced items, search statistics,
 * and performance monitoring data for the improved search interface.
 */
export interface EnhancedSearchResults extends Omit<SearchResults, 'items'> {
  /** Enhanced search result items with navigation and highlighting */
  items: EnhancedSearchResult[];
  
  /** Search statistics for result count display */
  searchStats: {
    exactMatches: number;
    partialMatches: number;
    locationMatches: number;
  };
  
  /** Current page information for pagination */
  pagination?: {
    currentPage: number;
    totalPages: number;
    pageSize: number;
  };
}