/**
 * Search Suggestions API Endpoint
 * 
 * This endpoint provides autocomplete suggestions for search queries based on
 * the user's inventory items, locations, and tags. Optimized for real-time
 * search-as-you-type functionality.
 * 
 * @route GET /api/v1/search/suggestions
 * @access Private (requires authentication)
 * @since 1.4.0
 */

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/config';
import { 
  validateSearchSuggestionsQuery,
  createSuccessResponse,
  createErrorResponse,
  handleValidationError,
} from '@/lib/validation';
import { getHouseholdContext, handleHouseholdContextError } from '@/lib/utils/household-context';
import { prisma } from '@/lib/db';
import type { SearchSuggestion } from '@/lib/types/search';

/**
 * GET /api/v1/search/suggestions - Get search autocomplete suggestions
 * 
 * Provides intelligent search suggestions based on the user's inventory content.
 * Suggestions include item names, locations, tags, and description keywords
 * ranked by relevance and usage frequency.
 * 
 * @param request - Next.js request object with suggestion query parameters
 * @returns Promise<Response> JSON response with suggestion array
 * 
 * @throws {400} Bad Request - Invalid query parameters
 * @throws {401} Unauthorized - Missing or invalid authentication
 * @throws {429} Too Many Requests - Rate limit exceeded
 * @throws {500} Internal Server Error - Service unavailable
 * 
 * @example Basic suggestions request
 * ```
 * GET /api/v1/search/suggestions?text=dr&limit=5
 * 
 * Response:
 * {
 *   "data": {
 *     "suggestions": [
 *       { "text": "drill", "type": "item", "count": 3, "score": 0.95 },
 *       { "text": "driver", "type": "item", "count": 2, "score": 0.87 },
 *       { "text": "drawer", "type": "location", "count": 5, "score": 0.82 }
 *     ],
 *     "hasMore": false,
 *     "responseTime": 15
 *   }
 * }
 * ```
 */
export async function GET(request: NextRequest): Promise<Response> {
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

    // 2. Get household context
    let householdId: string;
    try {
      householdId = await getHouseholdContext(session);
    } catch (error) {
      return handleHouseholdContextError(error);
    }

    // 3. Extract and validate parameters
    const { searchParams } = new URL(request.url);
    const queryData = {
      text: searchParams.get('text') || searchParams.get('q'),
      limit: searchParams.get('limit'),
      types: searchParams.get('types')?.split(','),
    };

    const validatedQuery = validateSearchSuggestionsQuery(queryData);

    // 4. Generate suggestions based on query text
    const suggestions = await generateSuggestions(
      householdId, 
      validatedQuery.text, 
      validatedQuery.limit || 5,
      validatedQuery.types || ['item', 'location', 'tag']
    );

    // 5. Calculate response time
    const responseTime = Date.now() - startTime;

    return Response.json({
      data: {
        suggestions,
        hasMore: suggestions.length >= (validatedQuery.limit || 5),
        responseTime,
      },
      meta: {
        timestamp: new Date().toISOString(),
        version: 'v1',
      },
    });

  } catch (error) {
    const responseTime = Date.now() - startTime;
    
    console.error('Search suggestions error:', {
      userId: (await auth())?.user?.id || 'anonymous',
      error: error instanceof Error ? error.message : 'Unknown error',
      responseTime,
      timestamp: new Date().toISOString(),
    });

    if (error instanceof Error) {
      const validationError = handleValidationError(error);
      if (validationError.error === 'VALIDATION_ERROR') {
        return Response.json(validationError, { status: 400 });
      }
    }

    return Response.json(
      createErrorResponse('INTERNAL_ERROR', 'Failed to generate suggestions'),
      { status: 500 }
    );
  }
}

/**
 * Generate search suggestions based on user's inventory content.
 * 
 * This function queries the user's household data to provide intelligent
 * suggestions including item names, locations, tags, and description keywords.
 * 
 * @param householdId - User's household ID for data isolation
 * @param text - Partial search text to match against
 * @param limit - Maximum number of suggestions to return
 * @param types - Types of suggestions to include
 * @returns Array of search suggestions with relevance scoring
 * 
 * @private
 */
async function generateSuggestions(
  householdId: string,
  text: string,
  limit: number,
  types: string[]
): Promise<SearchSuggestion[]> {
  const suggestions: SearchSuggestion[] = [];
  const searchPattern = `%${text.toLowerCase()}%`;
  
  // Get suggestions from different sources in parallel
  const suggestionPromises = [];

  // Item name suggestions
  if (types.includes('item')) {
    suggestionPromises.push(
      prisma.item.findMany({
        where: {
          householdId,
          name: {
            contains: text,
            mode: 'insensitive',
          },
        },
        select: {
          name: true,
        },
        take: Math.ceil(limit * 0.4), // 40% of suggestions from items
        orderBy: {
          name: 'asc',
        },
      }).then(items => 
        items.map((item, index) => ({
          text: item.name,
          type: 'item' as const,
          count: 1, // Could be enhanced to show actual count
          score: Math.max(0.1, 1 - (index * 0.1)), // Decreasing relevance
        }))
      )
    );
  }

  // Location suggestions
  if (types.includes('location')) {
    suggestionPromises.push(
      prisma.location.findMany({
        where: {
          householdId,
          OR: [
            {
              name: {
                contains: text,
                mode: 'insensitive',
              },
            },
            {
              path: {
                contains: text,
                mode: 'insensitive',
              },
            },
          ],
        },
        select: {
          name: true,
          itemCount: true,
        },
        take: Math.ceil(limit * 0.3), // 30% of suggestions from locations
        orderBy: {
          itemCount: 'desc', // Popular locations first
        },
      }).then(locations =>
        locations.map((location, index) => ({
          text: location.name,
          type: 'location' as const,
          count: location.itemCount,
          score: Math.max(0.1, 0.9 - (index * 0.1)),
        }))
      )
    );
  }

  // Tag suggestions
  if (types.includes('tag')) {
    suggestionPromises.push(
      prisma.tag.findMany({
        where: {
          householdId,
          name: {
            contains: text,
            mode: 'insensitive',
          },
        },
        select: {
          name: true,
          usageCount: true,
        },
        take: Math.ceil(limit * 0.2), // 20% of suggestions from tags
        orderBy: {
          usageCount: 'desc', // Popular tags first
        },
      }).then(tags =>
        tags.map((tag, index) => ({
          text: tag.name,
          type: 'tag' as const,
          count: tag.usageCount,
          score: Math.max(0.1, 0.8 - (index * 0.1)),
        }))
      )
    );
  }

  // Description keyword suggestions (more complex, lower priority)
  if (types.includes('description')) {
    suggestionPromises.push(
      prisma.item.findMany({
        where: {
          householdId,
          description: {
            contains: text,
            mode: 'insensitive',
          },
          NOT: {
            description: null,
          },
        },
        select: {
          description: true,
        },
        take: 10, // Limited sample for keyword extraction
      }).then(items => {
        // Extract keywords from descriptions that match the search text
        const keywords = new Set<string>();
        
        items.forEach(item => {
          if (item.description) {
            const words = item.description.toLowerCase().split(/\s+/);
            words.forEach(word => {
              if (word.includes(text.toLowerCase()) && word.length > 2) {
                keywords.add(word.replace(/[^\w]/g, '')); // Clean word
              }
            });
          }
        });

        return Array.from(keywords)
          .slice(0, Math.ceil(limit * 0.1)) // 10% from descriptions
          .map((keyword, index) => ({
            text: keyword,
            type: 'description' as const,
            count: 1,
            score: Math.max(0.1, 0.7 - (index * 0.1)),
          }));
      })
    );
  }

  // Wait for all suggestion queries to complete
  const suggestionArrays = await Promise.all(suggestionPromises);
  
  // Flatten and combine all suggestions
  suggestionArrays.forEach(array => suggestions.push(...array));

  // Remove duplicates and sort by relevance score
  const uniqueSuggestions = suggestions
    .reduce((acc, suggestion) => {
      const existing = acc.find(s => s.text === suggestion.text && s.type === suggestion.type);
      if (existing) {
        // Merge duplicates, taking higher score and sum counts
        existing.score = Math.max(existing.score, suggestion.score);
        existing.count += suggestion.count;
      } else {
        acc.push(suggestion);
      }
      return acc;
    }, [] as SearchSuggestion[])
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return uniqueSuggestions;
}