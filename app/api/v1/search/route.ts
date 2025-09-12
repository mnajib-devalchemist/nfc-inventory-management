/**
 * Search API Endpoint - PostgreSQL Text Search Implementation
 * 
 * This endpoint provides comprehensive search functionality for inventory items
 * with full-text search capabilities, fallback mechanisms, and performance monitoring.
 * 
 * @route GET /api/v1/search
 * @access Private (requires authentication)
 * @since 1.4.0
 */

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/config';
import { searchService } from '@/lib/services/search';
import { 
  validateSearchQuery,
  transformSearchParams,
  validateSearchRateLimit,
  createSuccessResponse,
  createErrorResponse,
  handleValidationError,
} from '@/lib/validation';
import { getHouseholdContext, handleHouseholdContextError } from '@/lib/utils/household-context';
import { SearchError, SearchValidationError } from '@/lib/services/search';

/**
 * GET /api/v1/search - Search inventory items with full-text capabilities
 * 
 * Provides comprehensive search functionality with automatic fallback mechanisms
 * for different PostgreSQL extension availability scenarios. Includes performance
 * monitoring and security features like rate limiting and household isolation.
 * 
 * @param request - Next.js request object with search query parameters
 * @returns Promise<Response> JSON response with search results and metadata
 * 
 * @throws {400} Bad Request - Invalid search parameters
 * @throws {401} Unauthorized - Missing or invalid authentication
 * @throws {403} Forbidden - Rate limit exceeded or access denied
 * @throws {404} Not Found - No household found for user
 * @throws {500} Internal Server Error - Search service unavailable
 * 
 * @example Basic search request
 * ```
 * GET /api/v1/search?q=power+drill&limit=10&includeLocation=true
 * 
 * Response:
 * {
 *   "data": {
 *     "items": [...],
 *     "totalCount": 5,
 *     "responseTime": 85,
 *     "searchMethod": "full_text_search",
 *     "hasMore": false
 *   },
 *   "meta": {
 *     "timestamp": "2025-01-09T...",
 *     "version": "v1"
 *   }
 * }
 * ```
 * 
 * @example Search with all options
 * ```
 * GET /api/v1/search?q=cordless+drill&limit=20&offset=10&includeLocation=true&includePhotos=true&includeTags=true
 * ```
 */
export async function GET(request: NextRequest): Promise<Response> {
  const startTime = Date.now();
  
  try {
    // 1. Authentication - Verify user session
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json(
        createErrorResponse('UNAUTHORIZED', 'Authentication required'),
        { status: 401 }
      );
    }

    const userId = session.user.id;

    // 2. Rate Limiting - Prevent search abuse
    const isWithinRateLimit = await validateSearchRateLimit(userId);
    if (!isWithinRateLimit) {
      return Response.json(
        createErrorResponse('RATE_LIMIT_EXCEEDED', 'Too many search requests. Please wait before searching again.'),
        { status: 429 }
      );
    }

    // 3. Get user's household context for security isolation
    let householdId: string;
    try {
      householdId = await getHouseholdContext(session);
    } catch (error) {
      return handleHouseholdContextError(error);
    }

    // 4. Extract and validate search parameters from URL
    const { searchParams } = new URL(request.url);
    
    // Transform URL parameters to object for validation
    const searchData = transformSearchParams(searchParams);
    
    // Validate search query parameters
    const validatedQuery = validateSearchQuery(searchData);

    // 5. Execute search using the search service
    const searchResults = await searchService.searchItems(userId, validatedQuery);

    // 6. Calculate total response time including API overhead
    const totalResponseTime = Date.now() - startTime;

    // 7. Return successful search response
    return Response.json({
      data: {
        ...searchResults,
        // Override response time to include API overhead
        responseTime: totalResponseTime,
      },
      meta: {
        timestamp: new Date().toISOString(),
        version: 'v1',
        searchCapabilities: {
          method: searchResults.searchMethod,
          extensionsAvailable: true, // Will be determined by service
        },
      },
    });

  } catch (error) {
    const totalResponseTime = Date.now() - startTime;
    
    // Log error for monitoring (without sensitive query data)
    console.error('Search API error:', {
      userId: (await auth())?.user?.id || 'anonymous',
      error: error instanceof Error ? error.message : 'Unknown error',
      responseTime: totalResponseTime,
      timestamp: new Date().toISOString(),
    });

    // Handle specific search error types
    if (error instanceof SearchValidationError) {
      return Response.json(
        createErrorResponse('VALIDATION_ERROR', error.message),
        { status: 400 }
      );
    }

    if (error instanceof SearchError) {
      switch (error.code) {
        case 'USER_NOT_FOUND':
          return Response.json(
            createErrorResponse('USER_NOT_FOUND', 'User account not found'),
            { status: 404 }
          );
        
        case 'NO_HOUSEHOLD':
          return Response.json(
            createErrorResponse('NO_HOUSEHOLD', 'No household found for user. Please create or join a household first.'),
            { status: 404 }
          );
        
        case 'SEARCH_UNAVAILABLE':
          return Response.json(
            createErrorResponse('SERVICE_UNAVAILABLE', 'Search service temporarily unavailable. Please try again later.'),
            { status: 503 }
          );
        
        default:
          return Response.json(
            createErrorResponse('SEARCH_ERROR', 'Search operation failed'),
            { status: 500 }
          );
      }
    }

    // Handle validation errors from the validation layer
    if (error instanceof Error) {
      const validationError = handleValidationError(error);
      if (validationError.error === 'VALIDATION_ERROR') {
        return Response.json(validationError, { status: 400 });
      }
    }

    // Generic error response for unexpected errors
    return Response.json(
      createErrorResponse(
        'INTERNAL_ERROR', 
        'An unexpected error occurred during search. Please try again.'
      ),
      { status: 500 }
    );
  }
}

/**
 * POST /api/v1/search - Advanced search with complex filters
 * 
 * Provides advanced search functionality with complex filtering, sorting,
 * and search configuration options. Supports more sophisticated search
 * queries that cannot be easily expressed via URL parameters.
 * 
 * @param request - Next.js request object with advanced search data in body
 * @returns Promise<Response> JSON response with search results
 * 
 * @example Advanced search request
 * ```
 * POST /api/v1/search
 * Content-Type: application/json
 * 
 * {
 *   "text": "drill",
 *   "filters": {
 *     "valueRange": { "min": 50, "max": 200 },
 *     "statuses": ["AVAILABLE"],
 *     "locationIds": ["location-uuid-1", "location-uuid-2"]
 *   },
 *   "sortBy": "value",
 *   "sortOrder": "desc",
 *   "includeLocation": true,
 *   "includePhotos": true,
 *   "limit": 25
 * }
 * ```
 */
export async function POST(request: NextRequest): Promise<Response> {
  const startTime = Date.now();
  
  try {
    // 1. Authentication
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json(
        createErrorResponse('UNAUTHORIZED', 'Authentication required'),
        { status: 401 }
      );
    }

    const userId = session.user.id;

    // 2. Rate limiting (stricter for POST requests)
    const isWithinRateLimit = await validateSearchRateLimit(userId, 60000, 20); // 20 per minute for POST
    if (!isWithinRateLimit) {
      return Response.json(
        createErrorResponse('RATE_LIMIT_EXCEEDED', 'Too many advanced search requests. Please wait before searching again.'),
        { status: 429 }
      );
    }

    // 3. Get household context
    let householdId: string;
    try {
      householdId = await getHouseholdContext(session);
    } catch (error) {
      return handleHouseholdContextError(error);
    }

    // 4. Parse and validate request body
    const body = await request.json();
    const validatedQuery = validateSearchQuery(body); // Note: Could extend to validateAdvancedSearchQuery

    // 5. Execute advanced search
    const searchResults = await searchService.searchItems(userId, validatedQuery);

    // 6. Return results
    const totalResponseTime = Date.now() - startTime;

    return Response.json({
      data: {
        ...searchResults,
        responseTime: totalResponseTime,
      },
      meta: {
        timestamp: new Date().toISOString(),
        version: 'v1',
        searchType: 'advanced',
      },
    });

  } catch (error) {
    const totalResponseTime = Date.now() - startTime;
    
    console.error('Advanced search API error:', {
      userId: (await auth())?.user?.id || 'anonymous',
      error: error instanceof Error ? error.message : 'Unknown error',
      responseTime: totalResponseTime,
      timestamp: new Date().toISOString(),
    });

    // Handle errors similar to GET endpoint
    if (error instanceof SearchValidationError) {
      return Response.json(
        createErrorResponse('VALIDATION_ERROR', error.message),
        { status: 400 }
      );
    }

    if (error instanceof SearchError) {
      switch (error.code) {
        case 'NO_HOUSEHOLD':
          return Response.json(
            createErrorResponse('NO_HOUSEHOLD', 'No household found for user'),
            { status: 404 }
          );
        
        default:
          return Response.json(
            createErrorResponse('SEARCH_ERROR', 'Advanced search operation failed'),
            { status: 500 }
          );
      }
    }

    return Response.json(
      createErrorResponse('INTERNAL_ERROR', 'Advanced search failed'),
      { status: 500 }
    );
  }
}