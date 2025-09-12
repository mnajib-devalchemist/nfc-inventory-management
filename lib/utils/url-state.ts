/**
 * URL state management utilities for search functionality.
 * 
 * Provides utilities for managing search state in URL parameters with
 * validation, serialization, and browser navigation support for the
 * enhanced search interface.
 * 
 * @category Utilities
 * @subcategory Navigation
 * @since 1.5.0
 */

import { ReadonlyURLSearchParams } from 'next/navigation';

/**
 * Search URL state parameters.
 */
export interface SearchUrlState {
  /** Search query text */
  query?: string;
  /** Current view mode */
  viewMode?: 'grid' | 'list';
  /** Current page number */
  page?: number;
  /** Sort order */
  sort?: 'relevance' | 'name' | 'date' | 'value';
  /** Sort direction */
  sortDir?: 'asc' | 'desc';
  /** Filter by location IDs */
  locations?: string[];
  /** Filter by tag IDs */
  tags?: string[];
  /** Filter by status */
  statuses?: string[];
}

/**
 * Navigation context for back-to-search functionality.
 */
export interface NavigationContext {
  /** Previous page type */
  from?: 'search' | 'inventory' | 'dashboard';
  /** Original search query for back navigation */
  originalQuery?: string;
  /** Previous view mode */
  previousViewMode?: 'grid' | 'list';
  /** Previous page number */
  previousPage?: number;
}

/**
 * URL parameter validation configuration.
 */
interface UrlParamValidation {
  /** Parameter name */
  param: string;
  /** Allowed values (for enum-like params) */
  allowedValues?: string[];
  /** Minimum value (for numeric params) */
  min?: number;
  /** Maximum value (for numeric params) */
  max?: number;
  /** Maximum length (for string params) */
  maxLength?: number;
  /** Regex pattern for validation */
  pattern?: RegExp;
}

/**
 * URL parameter validation rules.
 */
const URL_PARAM_VALIDATION: Record<string, UrlParamValidation> = {
  q: {
    param: 'q',
    maxLength: 500,
    pattern: /^[^<>\"'&;]*$/, // Basic XSS prevention
  },
  view: {
    param: 'view',
    allowedValues: ['grid', 'list'],
  },
  page: {
    param: 'page',
    min: 1,
    max: 1000,
  },
  sort: {
    param: 'sort',
    allowedValues: ['relevance', 'name', 'date', 'value'],
  },
  sortDir: {
    param: 'sortDir',
    allowedValues: ['asc', 'desc'],
  },
  from: {
    param: 'from',
    allowedValues: ['search', 'inventory', 'dashboard'],
  },
};

/**
 * Validates a URL parameter value against defined rules.
 * 
 * @param param - Parameter name
 * @param value - Parameter value to validate
 * @returns True if valid, false otherwise
 */
function validateUrlParam(param: string, value: string): boolean {
  const validation = URL_PARAM_VALIDATION[param];
  if (!validation) return true; // Allow unknown parameters

  // Check allowed values
  if (validation.allowedValues && !validation.allowedValues.includes(value)) {
    return false;
  }

  // Check numeric constraints
  if (validation.min !== undefined || validation.max !== undefined) {
    const numValue = parseInt(value, 10);
    if (isNaN(numValue)) return false;
    if (validation.min !== undefined && numValue < validation.min) return false;
    if (validation.max !== undefined && numValue > validation.max) return false;
  }

  // Check string length
  if (validation.maxLength && value.length > validation.maxLength) {
    return false;
  }

  // Check pattern
  if (validation.pattern && !validation.pattern.test(value)) {
    return false;
  }

  return true;
}

/**
 * Parses search state from URL search parameters with validation.
 * 
 * Extracts and validates search-related parameters from URL search params,
 * applying security validation and type conversion as needed.
 * 
 * @param searchParams - URL search parameters from Next.js
 * @returns Parsed and validated search state
 * 
 * @example
 * ```typescript
 * const searchParams = useSearchParams();
 * const state = parseSearchState(searchParams);
 * console.log(state.query); // "power drill"
 * console.log(state.viewMode); // "grid"
 * ```
 */
export function parseSearchState(searchParams: ReadonlyURLSearchParams): SearchUrlState {
  const state: SearchUrlState = {};

  // Parse query
  const query = searchParams.get('q');
  if (query && validateUrlParam('q', query)) {
    state.query = query.trim();
  }

  // Parse view mode
  const viewMode = searchParams.get('view');
  if (viewMode && validateUrlParam('view', viewMode)) {
    state.viewMode = viewMode as 'grid' | 'list';
  }

  // Parse page number
  const page = searchParams.get('page');
  if (page && validateUrlParam('page', page)) {
    state.page = parseInt(page, 10);
  }

  // Parse sort order
  const sort = searchParams.get('sort');
  if (sort && validateUrlParam('sort', sort)) {
    state.sort = sort as 'relevance' | 'name' | 'date' | 'value';
  }

  // Parse sort direction
  const sortDir = searchParams.get('sortDir');
  if (sortDir && validateUrlParam('sortDir', sortDir)) {
    state.sortDir = sortDir as 'asc' | 'desc';
  }

  // Parse location filters (comma-separated)
  const locationsParam = searchParams.get('locations');
  if (locationsParam) {
    const locationIds = locationsParam.split(',').filter(id => id.trim().length > 0);
    if (locationIds.length > 0 && locationIds.length <= 20) { // Reasonable limit
      state.locations = locationIds;
    }
  }

  // Parse tag filters (comma-separated)
  const tagsParam = searchParams.get('tags');
  if (tagsParam) {
    const tagIds = tagsParam.split(',').filter(id => id.trim().length > 0);
    if (tagIds.length > 0 && tagIds.length <= 20) { // Reasonable limit
      state.tags = tagIds;
    }
  }

  // Parse status filters (comma-separated)
  const statusesParam = searchParams.get('statuses');
  if (statusesParam) {
    const statuses = statusesParam.split(',').filter(status => status.trim().length > 0);
    const validStatuses = statuses.filter(status => 
      ['AVAILABLE', 'BORROWED', 'MAINTENANCE', 'LOST', 'SOLD'].includes(status)
    );
    if (validStatuses.length > 0) {
      state.statuses = validStatuses;
    }
  }

  return state;
}

/**
 * Parses navigation context from URL search parameters.
 * 
 * Extracts navigation-related parameters used for back-to-search functionality
 * and breadcrumb navigation.
 * 
 * @param searchParams - URL search parameters from Next.js
 * @returns Parsed navigation context
 */
export function parseNavigationContext(searchParams: ReadonlyURLSearchParams): NavigationContext {
  const context: NavigationContext = {};

  // Parse source page
  const from = searchParams.get('from');
  if (from && validateUrlParam('from', from)) {
    context.from = from as 'search' | 'inventory' | 'dashboard';
  }

  // Parse original query for back navigation
  const originalQuery = searchParams.get('originalQuery');
  if (originalQuery && validateUrlParam('q', originalQuery)) {
    context.originalQuery = originalQuery.trim();
  }

  // Parse previous view mode
  const prevViewMode = searchParams.get('prevView');
  if (prevViewMode && validateUrlParam('view', prevViewMode)) {
    context.previousViewMode = prevViewMode as 'grid' | 'list';
  }

  // Parse previous page
  const prevPage = searchParams.get('prevPage');
  if (prevPage && validateUrlParam('page', prevPage)) {
    context.previousPage = parseInt(prevPage, 10);
  }

  return context;
}

/**
 * Serializes search state to URL search parameters.
 * 
 * Converts search state object to URL search parameters string with proper
 * encoding and validation.
 * 
 * @param state - Search state to serialize
 * @param baseParams - Existing URL search parameters to merge with
 * @returns URL search parameters string
 * 
 * @example
 * ```typescript
 * const params = serializeSearchState({
 *   query: 'power drill',
 *   viewMode: 'grid',
 *   page: 2
 * });
 * console.log(params); // "q=power%20drill&view=grid&page=2"
 * ```
 */
export function serializeSearchState(
  state: SearchUrlState,
  baseParams?: URLSearchParams
): URLSearchParams {
  const params = baseParams ? new URLSearchParams(baseParams) : new URLSearchParams();

  // Set query parameter
  if (state.query?.trim()) {
    params.set('q', state.query.trim());
  } else {
    params.delete('q');
  }

  // Set view mode
  if (state.viewMode) {
    params.set('view', state.viewMode);
  } else {
    params.delete('view');
  }

  // Set page number
  if (state.page && state.page > 1) {
    params.set('page', state.page.toString());
  } else {
    params.delete('page');
  }

  // Set sort parameters
  if (state.sort && state.sort !== 'relevance') {
    params.set('sort', state.sort);
  } else {
    params.delete('sort');
  }

  if (state.sortDir && state.sortDir !== 'desc') {
    params.set('sortDir', state.sortDir);
  } else {
    params.delete('sortDir');
  }

  // Set filter parameters
  if (state.locations?.length) {
    params.set('locations', state.locations.join(','));
  } else {
    params.delete('locations');
  }

  if (state.tags?.length) {
    params.set('tags', state.tags.join(','));
  } else {
    params.delete('tags');
  }

  if (state.statuses?.length) {
    params.set('statuses', state.statuses.join(','));
  } else {
    params.delete('statuses');
  }

  return params;
}

/**
 * Serializes navigation context to URL search parameters.
 * 
 * Converts navigation context to URL parameters for preserving navigation
 * state across page transitions.
 * 
 * @param context - Navigation context to serialize
 * @param baseParams - Existing URL search parameters to merge with
 * @returns URL search parameters with navigation context
 */
export function serializeNavigationContext(
  context: NavigationContext,
  baseParams?: URLSearchParams
): URLSearchParams {
  const params = baseParams ? new URLSearchParams(baseParams) : new URLSearchParams();

  // Set navigation context
  if (context.from) {
    params.set('from', context.from);
  } else {
    params.delete('from');
  }

  if (context.originalQuery?.trim()) {
    params.set('originalQuery', context.originalQuery.trim());
  } else {
    params.delete('originalQuery');
  }

  if (context.previousViewMode) {
    params.set('prevView', context.previousViewMode);
  } else {
    params.delete('prevView');
  }

  if (context.previousPage && context.previousPage > 1) {
    params.set('prevPage', context.previousPage.toString());
  } else {
    params.delete('prevPage');
  }

  return params;
}

/**
 * Builds URL for item detail navigation with search context.
 * 
 * Creates a URL for navigating to item detail page while preserving
 * search context for back navigation functionality.
 * 
 * @param itemId - Item ID for detail page
 * @param searchState - Current search state
 * @returns URL string for item detail navigation
 * 
 * @example
 * ```typescript
 * const detailUrl = buildItemDetailUrl('item-123', {
 *   query: 'drill',
 *   viewMode: 'grid',
 *   page: 2
 * });
 * console.log(detailUrl); // "/inventory/item-123?from=search&originalQuery=drill&prevView=grid"
 * ```
 */
export function buildItemDetailUrl(itemId: string, searchState: SearchUrlState): string {
  const context: NavigationContext = {
    from: 'search',
    originalQuery: searchState.query,
    previousViewMode: searchState.viewMode,
    previousPage: searchState.page,
  };

  const params = serializeNavigationContext(context);
  const paramString = params.toString();
  
  return `/inventory/${itemId}${paramString ? `?${paramString}` : ''}`;
}

/**
 * Builds URL for location navigation with search context.
 * 
 * Creates a URL for navigating to location page while preserving
 * search context for back navigation.
 * 
 * @param locationId - Location ID for location page
 * @param searchState - Current search state  
 * @returns URL string for location navigation
 */
export function buildLocationUrl(locationId: string, searchState: SearchUrlState): string {
  const context: NavigationContext = {
    from: 'search',
    originalQuery: searchState.query,
    previousViewMode: searchState.viewMode,
    previousPage: searchState.page,
  };

  const params = serializeNavigationContext(context);
  const paramString = params.toString();
  
  return `/locations/${locationId}${paramString ? `?${paramString}` : ''}`;
}

/**
 * Builds back-to-search URL from navigation context.
 * 
 * Creates a URL for returning to search results with preserved state.
 * 
 * @param context - Navigation context with previous search state
 * @returns URL string for back-to-search navigation
 */
export function buildBackToSearchUrl(context: NavigationContext): string {
  const searchState: SearchUrlState = {
    query: context.originalQuery,
    viewMode: context.previousViewMode,
    page: context.previousPage,
  };

  const params = serializeSearchState(searchState);
  const paramString = params.toString();
  
  return `/search${paramString ? `?${paramString}` : ''}`;
}