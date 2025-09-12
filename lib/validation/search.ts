/**
 * Search validation schemas and utilities.
 * 
 * This module provides comprehensive validation for search operations,
 * including query parameters, response formats, and error handling
 * specifically for the search functionality.
 * 
 * @category Validation
 * @since 1.4.0
 */

import { z } from 'zod';
import { safeValidate } from './common';
import type { SearchQuery, SearchMethod } from '@/lib/types/search';

/**
 * Base search query validation schema.
 * 
 * Validates the core search parameters including text query,
 * pagination, and data inclusion options.
 */
const searchQuerySchema = z.object({
  /**
   * Search text query (2-500 characters).
   * Automatically trimmed and validated for length.
   */
  text: z.string()
    .trim()
    .min(2, 'Search query must be at least 2 characters')
    .max(500, 'Search query too long (max 500 characters)')
    .refine(
      (text) => text.length > 0,
      'Search query cannot be empty after trimming'
    ),

  /**
   * Maximum number of results to return (1-100).
   * @default 20
   */
  limit: z.coerce.number()
    .int('Limit must be an integer')
    .min(1, 'Limit must be at least 1')
    .max(100, 'Limit cannot exceed 100')
    .default(20)
    .optional(),

  /**
   * Number of results to skip for pagination.
   * @minimum 0
   * @default 0
   */
  offset: z.coerce.number()
    .int('Offset must be an integer')
    .min(0, 'Offset cannot be negative')
    .default(0)
    .optional(),

  /**
   * Whether to include location data in results.
   * @default false
   */
  includeLocation: z.coerce.boolean()
    .default(false)
    .optional(),

  /**
   * Whether to include photo thumbnails in results.
   * @default false
   */
  includePhotos: z.coerce.boolean()
    .default(false)
    .optional(),

  /**
   * Whether to include tag data in results.
   * @default false
   */
  includeTags: z.coerce.boolean()
    .default(false)
    .optional(),
});

/**
 * Advanced search filters validation schema.
 * 
 * Validates additional filtering criteria for more sophisticated
 * search operations.
 */
const searchFiltersSchema = z.object({
  /**
   * Filter by specific location IDs.
   */
  locationIds: z.array(z.string().uuid('Invalid location ID'))
    .max(10, 'Cannot filter by more than 10 locations')
    .optional(),

  /**
   * Filter by specific tag IDs.
   */
  tagIds: z.array(z.string().uuid('Invalid tag ID'))
    .max(20, 'Cannot filter by more than 20 tags')
    .optional(),

  /**
   * Filter by item status values.
   */
  statuses: z.array(z.enum(['AVAILABLE', 'BORROWED', 'MAINTENANCE', 'LOST', 'SOLD']))
    .max(5, 'Cannot filter by more than 5 statuses')
    .optional(),

  /**
   * Filter by value range.
   */
  valueRange: z.object({
    min: z.number().min(0, 'Minimum value cannot be negative').optional(),
    max: z.number().min(0, 'Maximum value cannot be negative').optional(),
  }).refine(
    (data) => !data.min || !data.max || data.min <= data.max,
    'Minimum value cannot be greater than maximum value'
  ).optional(),

  /**
   * Filter by date range.
   */
  dateRange: z.object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  }).refine(
    (data) => !data.from || !data.to || data.from <= data.to,
    'From date cannot be later than to date'
  ).optional(),

  /**
   * Filter by quantity range.
   */
  quantityRange: z.object({
    min: z.number().int().min(0, 'Minimum quantity cannot be negative').optional(),
    max: z.number().int().min(0, 'Maximum quantity cannot be negative').optional(),
  }).refine(
    (data) => !data.min || !data.max || data.min <= data.max,
    'Minimum quantity cannot be greater than maximum quantity'
  ).optional(),
});

/**
 * Advanced search query validation schema.
 * 
 * Extends the base search query with filtering and sorting capabilities.
 */
const advancedSearchQuerySchema = searchQuerySchema.extend({
  /**
   * Additional filter criteria.
   */
  filters: searchFiltersSchema.optional(),

  /**
   * Sort field for results ordering.
   * @default 'relevance'
   */
  sortBy: z.enum(['relevance', 'name', 'date', 'value', 'quantity'])
    .default('relevance')
    .optional(),

  /**
   * Sort direction.
   * @default 'desc' for relevance, 'asc' for others
   */
  sortOrder: z.enum(['asc', 'desc'])
    .default('desc')
    .optional(),

  /**
   * Enable fuzzy matching for typo tolerance.
   * @default false
   */
  fuzzy: z.boolean()
    .default(false)
    .optional(),
});

/**
 * Search suggestions query validation schema.
 */
const searchSuggestionsQuerySchema = z.object({
  /**
   * Partial search text for suggestions (1-100 characters).
   */
  text: z.string()
    .trim()
    .min(1, 'Suggestion query must be at least 1 character')
    .max(100, 'Suggestion query too long (max 100 characters)'),

  /**
   * Maximum number of suggestions to return (1-10).
   * @default 5
   */
  limit: z.coerce.number()
    .int()
    .min(1, 'Limit must be at least 1')
    .max(10, 'Limit cannot exceed 10')
    .default(5)
    .optional(),

  /**
   * Types of suggestions to include.
   * @default ['item', 'location', 'tag']
   */
  types: z.array(z.enum(['item', 'location', 'tag', 'description']))
    .default(['item', 'location', 'tag'])
    .optional(),
});

/**
 * Search analytics query validation schema.
 * 
 * Validates parameters for retrieving search performance metrics.
 */
const searchAnalyticsQuerySchema = z.object({
  /**
   * Time period for analytics data.
   * @default '1d'
   */
  period: z.enum(['1h', '1d', '1w', '1m'])
    .default('1d')
    .optional(),

  /**
   * Search method to filter analytics.
   */
  method: z.enum(['full_text_search', 'trigram_search', 'ilike_fallback'])
    .optional(),

  /**
   * Minimum response time threshold for filtering.
   */
  minResponseTime: z.coerce.number()
    .min(0, 'Minimum response time cannot be negative')
    .optional(),

  /**
   * Maximum response time threshold for filtering.
   */
  maxResponseTime: z.coerce.number()
    .min(0, 'Maximum response time cannot be negative')
    .optional(),
}).refine(
  (data) => !data.minResponseTime || !data.maxResponseTime || 
           data.minResponseTime <= data.maxResponseTime,
  'Minimum response time cannot be greater than maximum response time'
);

// Type inference from schemas
export type SearchQueryInput = z.infer<typeof searchQuerySchema>;
export type SearchFiltersInput = z.infer<typeof searchFiltersSchema>;
export type AdvancedSearchQueryInput = z.infer<typeof advancedSearchQuerySchema>;
export type SearchSuggestionsQueryInput = z.infer<typeof searchSuggestionsQuerySchema>;
export type SearchAnalyticsQueryInput = z.infer<typeof searchAnalyticsQuerySchema>;

/**
 * Validate basic search query parameters.
 * 
 * Validates and sanitizes search query parameters from API requests,
 * providing type-safe and sanitized input for search operations.
 * 
 * @param data - Raw search query data from API request
 * @returns Validated and sanitized search query parameters
 * 
 * @throws {ValidationError} When validation fails
 * 
 * @example Validate search request
 * ```typescript
 * const searchParams = validateSearchQuery({
 *   text: '  power drill  ',
 *   limit: '10',
 *   includeLocation: 'true'
 * });
 * // Returns: { text: 'power drill', limit: 10, includeLocation: true, ... }
 * ```
 */
export function validateSearchQuery(data: unknown): SearchQueryInput {
  const result = safeValidate(searchQuerySchema, data);
  if (!result.success) {
    throw new Error(result.error.message);
  }
  return result.data;
}

/**
 * Validate advanced search query with filters and sorting.
 * 
 * Validates complex search queries that include filtering criteria,
 * sorting options, and advanced search features.
 * 
 * @param data - Raw advanced search data from API request
 * @returns Validated advanced search query parameters
 * 
 * @throws {ValidationError} When validation fails
 * 
 * @example Validate advanced search request
 * ```typescript
 * const advancedQuery = validateAdvancedSearchQuery({
 *   text: 'drill',
 *   filters: {
 *     valueRange: { min: 50, max: 200 },
 *     statuses: ['AVAILABLE']
 *   },
 *   sortBy: 'value',
 *   sortOrder: 'desc'
 * });
 * ```
 */
export function validateAdvancedSearchQuery(data: unknown): AdvancedSearchQueryInput {
  const result = safeValidate(advancedSearchQuerySchema, data);
  if (!result.success) {
    throw new Error(result.error.message);
  }
  return result.data;
}

/**
 * Validate search suggestions query parameters.
 * 
 * Validates parameters for autocomplete/suggestion requests.
 * 
 * @param data - Raw suggestions query data
 * @returns Validated suggestions query parameters
 * 
 * @throws {ValidationError} When validation fails
 */
export function validateSearchSuggestionsQuery(data: unknown): SearchSuggestionsQueryInput {
  const result = safeValidate(searchSuggestionsQuerySchema, data);
  if (!result.success) {
    throw new Error(result.error.message);
  }
  return result.data;
}

/**
 * Validate search analytics query parameters.
 * 
 * Validates parameters for retrieving search performance analytics.
 * 
 * @param data - Raw analytics query data
 * @returns Validated analytics query parameters
 * 
 * @throws {ValidationError} When validation fails
 */
export function validateSearchAnalyticsQuery(data: unknown): SearchAnalyticsQueryInput {
  const result = safeValidate(searchAnalyticsQuerySchema, data);
  if (!result.success) {
    throw new Error(result.error.message);
  }
  return result.data;
}

/**
 * Validate search method enum value.
 * 
 * Ensures search method strings are valid enum values.
 * 
 * @param method - Search method string
 * @returns Validated search method
 * 
 * @throws {ValidationError} When method is invalid
 */
export function validateSearchMethod(method: unknown): SearchMethod {
  const schema = z.enum(['full_text_search', 'trigram_search', 'ilike_fallback']);
  const result = safeValidate(schema, method);
  if (!result.success) {
    throw new Error(result.error.message);
  }
  return result.data;
}

/**
 * Transform URL search parameters to search query object.
 * 
 * Converts URL search parameters to a properly typed search query object,
 * handling type coercion and default values appropriately.
 * 
 * @param searchParams - URLSearchParams from request
 * @returns Search query object ready for validation
 * 
 * @example Transform URL parameters
 * ```typescript
 * const url = new URL(request.url);
 * const queryData = transformSearchParams(url.searchParams);
 * const validatedQuery = validateSearchQuery(queryData);
 * ```
 */
export function transformSearchParams(searchParams: URLSearchParams): Record<string, unknown> {
  const query = searchParams.get('q') || searchParams.get('text');
  if (!query) {
    throw new Error('Search query is required');
  }

  return {
    text: query,
    limit: searchParams.get('limit'),
    offset: searchParams.get('offset'),
    includeLocation: searchParams.get('includeLocation'),
    includePhotos: searchParams.get('includePhotos'),
    includeTags: searchParams.get('includeTags'),
  };
}

/**
 * Validate and sanitize search query text for SQL safety.
 * 
 * Performs additional sanitization beyond basic validation to ensure
 * search queries are safe for database operations.
 * 
 * @param text - Raw search text
 * @returns Sanitized search text
 * 
 * @example Sanitize search input
 * ```typescript
 * const safeText = sanitizeSearchText("power; DROP TABLE items; --");
 * // Returns: "power DROP TABLE items"
 * ```
 */
export function sanitizeSearchText(text: string): string {
  return text
    .trim()
    // Remove potentially dangerous SQL characters
    .replace(/[;'"\\]/g, ' ')
    // Remove control characters
    .replace(/[\x00-\x1f\x7f]/g, ' ')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Rate limiting validation for search requests.
 * 
 * Validates that search requests are within acceptable rate limits
 * to prevent abuse and ensure system stability.
 * 
 * @param userId - ID of the user making the search request
 * @param windowMs - Time window in milliseconds
 * @param maxRequests - Maximum requests allowed in the window
 * @returns Whether the request is within rate limits
 */
export async function validateSearchRateLimit(
  userId: string, 
  windowMs: number = 60000, // 1 minute
  maxRequests: number = 30   // 30 requests per minute
): Promise<boolean> {
  const { rateLimit, RATE_LIMIT_CONFIGS } = await import('@/lib/utils/rate-limit');
  
  const result = await rateLimit(userId, {
    maxRequests,
    windowMs,
    keyPrefix: 'search',
  });
  
  return result.allowed;
}

/**
 * Error messages for search validation failures.
 * 
 * Provides user-friendly error messages for different types of
 * search validation errors.
 */
export const SEARCH_ERROR_MESSAGES = {
  QUERY_TOO_SHORT: 'Search query must be at least 2 characters long',
  QUERY_TOO_LONG: 'Search query is too long (maximum 500 characters)',
  INVALID_LIMIT: 'Search limit must be between 1 and 100',
  INVALID_OFFSET: 'Search offset must be a non-negative number',
  RATE_LIMIT_EXCEEDED: 'Too many search requests. Please wait before searching again.',
  INVALID_FILTERS: 'One or more search filters are invalid',
  INVALID_SORT: 'Invalid sort field or direction specified',
} as const;

/**
 * Search validation error class.
 * 
 * Specialized error class for search-specific validation failures.
 */
export class SearchValidationError extends Error {
  constructor(
    message: string, 
    public field: string,
    public code: keyof typeof SEARCH_ERROR_MESSAGES
  ) {
    super(message);
    this.name = 'SearchValidationError';
  }
}