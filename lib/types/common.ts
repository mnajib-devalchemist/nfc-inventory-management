/**
 * Common type definitions used throughout the application.
 * 
 * @category Type Definitions
 * @since 1.0.0
 */

/**
 * Standard API response format for all endpoints.
 * 
 * @template T - The type of the data payload
 */
export interface ApiResponse<T = unknown> {
  /** Response data payload */
  data: T;
  /** Response metadata */
  meta?: {
    /** Response timestamp in ISO format */
    timestamp: string;
    /** API version used */
    version: string;
    /** Request ID for tracing */
    requestId?: string;
  };
}

/**
 * Standard API error response format.
 */
export interface ApiError {
  /** Error message */
  error: string;
  /** Additional error details (development only) */
  details?: unknown;
  /** Error code for client handling */
  code?: string;
}

/**
 * Pagination metadata for list responses.
 */
export interface PaginationMeta {
  /** Current page number (1-based) */
  page: number;
  /** Number of items per page */
  limit: number;
  /** Total number of items */
  totalCount: number;
  /** Total number of pages */
  totalPages: number;
  /** Whether there is a next page */
  hasNext: boolean;
  /** Whether there is a previous page */
  hasPrev: boolean;
}

/**
 * Paginated API response format.
 * 
 * @template T - The type of items in the array
 */
export interface PaginatedResponse<T = unknown> {
  /** Array of items for current page */
  data: T[];
  /** Pagination metadata */
  pagination: PaginationMeta;
}