/**
 * Search Service - Basic PostgreSQL Text Search Implementation
 * 
 * This service provides comprehensive search functionality for inventory items using 
 * PostgreSQL's full-text search capabilities with graceful fallbacks for environments
 * without required extensions.
 * 
 * Features:
 * - Full-text search with tsvector when available
 * - Trigram similarity search fallback
 * - ILIKE pattern matching as final fallback
 * - Search performance analytics without PII
 * - Household isolation for security
 * - Configurable search strategies
 * 
 * @category Services
 * @since 1.4.0
 */

import { prisma } from '@/lib/db';
import { 
  checkExtensionAvailability, 
  getSearchConfiguration,
  type ExtensionStatus,
  type SearchConfiguration 
} from '@/lib/db/extensions';
import type { PrismaClient } from '@prisma/client';

export interface SearchQuery {
  text: string;
  limit?: number;
  offset?: number;
  includeLocation?: boolean;
  includePhotos?: boolean;
  includeTags?: boolean;
}

export interface SearchResult {
  id: string;
  name: string;
  description: string | null;
  quantity: number;
  currentValue: number | null;
  location?: {
    id: string;
    name: string;
    path: string;
  };
  photos?: Array<{
    id: string;
    thumbnailUrl: string;
    isPrimary: boolean;
  }>;
  tags?: Array<{
    id: string;
    name: string;
    color: string;
  }>;
  relevanceScore?: number;
}

export interface SearchResults {
  items: SearchResult[];
  totalCount: number;
  responseTime: number;
  searchMethod: 'full_text_search' | 'trigram_search' | 'ilike_fallback';
  hasMore: boolean;
}

export interface SearchAnalyticsData {
  householdId: string;
  queryLength: number;
  resultCount: number;
  responseTime: number;
  searchMethod: 'full_text_search' | 'trigram_search' | 'ilike_fallback';
}

/**
 * Custom error classes for search operations
 */
export class SearchError extends Error {
  constructor(message: string, public code: string = 'SEARCH_ERROR') {
    super(message);
    this.name = 'SearchError';
  }
}

export class SearchValidationError extends SearchError {
  constructor(message: string) {
    super(message, 'SEARCH_VALIDATION_ERROR');
    this.name = 'SearchValidationError';
  }
}

/**
 * SearchService provides comprehensive search functionality with extension fallbacks.
 * 
 * The service automatically detects available PostgreSQL extensions and uses the most
 * appropriate search strategy for optimal performance while maintaining compatibility.
 * 
 * @example Basic search usage
 * ```typescript
 * const searchService = new SearchService(prisma);
 * const results = await searchService.searchItems('user-123', {
 *   text: 'power drill',
 *   limit: 20
 * });
 * ```
 */
export class SearchService {
  private extensionStatus: ExtensionStatus | null = null;
  private searchConfig: SearchConfiguration | null = null;

  constructor(private prisma: PrismaClient) {}

  /**
   * Search for items within a user's household with configurable options.
   * 
   * This is the main search method that automatically selects the optimal search
   * strategy based on available database extensions and provides comprehensive
   * search results with analytics logging.
   * 
   * @param userId - ID of the user performing the search
   * @param query - Search parameters including text, pagination, and include options
   * @returns Promise<SearchResults> Comprehensive search results with metadata
   * 
   * @throws {SearchValidationError} When search parameters are invalid
   * @throws {SearchError} When search operation fails
   * 
   * @example Search with location and photo data
   * ```typescript
   * const results = await searchService.searchItems('user-123', {
   *   text: 'cordless drill',
   *   limit: 10,
   *   includeLocation: true,
   *   includePhotos: true
   * });
   * 
   * console.log(`Found ${results.totalCount} items in ${results.responseTime}ms`);
   * ```
   */
  async searchItems(userId: string, query: SearchQuery): Promise<SearchResults> {
    const startTime = Date.now();
    
    try {
      // 1. Validate search parameters
      this.validateSearchQuery(query);
      
      // 2. Get user's household for security isolation
      const userHousehold = await this.getUserHousehold(userId);
      
      // 3. Initialize search configuration if needed
      if (!this.searchConfig) {
        await this.initializeSearchConfiguration();
      }
      
      // 4. Execute search with appropriate strategy
      const searchResults = await this.executeSearch(query, userHousehold.id);
      
      // 5. Calculate response time and prepare results
      const responseTime = Date.now() - startTime;
      const searchMethod = this.determineSearchMethod();
      
      const results: SearchResults = {
        items: searchResults,
        totalCount: searchResults.length,
        responseTime,
        searchMethod,
        hasMore: query.limit ? searchResults.length >= query.limit : false,
      };
      
      // 6. Log analytics (anonymized)
      await this.logSearchAnalytics({
        householdId: userHousehold.id,
        queryLength: query.text.length,
        resultCount: results.totalCount,
        responseTime,
        searchMethod,
      });
      
      return results;
      
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      // Log error for monitoring (without query text for privacy)
      await this.logSearchError(userId, query.text.length, responseTime, error);
      
      if (error instanceof SearchValidationError) {
        throw error;
      }
      
      throw new SearchError(
        'Search temporarily unavailable. Please try again.',
        'SEARCH_UNAVAILABLE'
      );
    }
  }

  /**
   * Initialize search configuration by checking database extensions.
   * 
   * This method determines which search strategies are available and caches
   * the configuration for subsequent search operations.
   * 
   * @private
   */
  private async initializeSearchConfiguration(): Promise<void> {
    try {
      this.extensionStatus = await checkExtensionAvailability();
      this.searchConfig = await getSearchConfiguration();
    } catch (error) {
      console.warn('Failed to initialize search configuration:', error);
      
      // Use safe defaults
      this.extensionStatus = {
        pg_trgm: false,
        unaccent: false,
        uuid_ossp: false,
        fullTextSearchCapable: false,
      };
      
      this.searchConfig = {
        useFullTextSearch: false,
        useTrigramSearch: false,
        useUnaccent: false,
        indexingStrategy: 'background',
        fallbackToIlike: true,
      };
    }
  }

  /**
   * Execute search using the most appropriate available strategy.
   * 
   * Tries full-text search first, then trigram search, finally falling back
   * to ILIKE pattern matching for maximum compatibility.
   * 
   * @private
   */
  private async executeSearch(query: SearchQuery, householdId: string): Promise<SearchResult[]> {
    const config = this.searchConfig!;
    
    // Try full-text search first (most accurate and fast)
    if (config.useFullTextSearch) {
      try {
        return await this.searchWithFullText(query, householdId);
      } catch (error) {
        console.warn('Full-text search failed, falling back to trigram search:', error);
      }
    }
    
    // Try trigram search (good similarity matching)
    if (config.useTrigramSearch) {
      try {
        return await this.searchWithTrigram(query, householdId);
      } catch (error) {
        console.warn('Trigram search failed, falling back to ILIKE search:', error);
      }
    }
    
    // Final fallback to ILIKE pattern matching
    return await this.searchWithILIKE(query, householdId);
  }

  /**
   * Full-text search implementation using PostgreSQL tsvector.
   * 
   * Uses the pre-computed search vectors for fast, accurate text matching
   * with ranking based on content weights (name > description > location > tags).
   * 
   * @private
   */
  private async searchWithFullText(query: SearchQuery, householdId: string): Promise<SearchResult[]> {
    const searchTerm = this.sanitizeSearchTerm(query.text);
    const limit = Math.min(query.limit || 20, 100);
    const offset = Math.max(query.offset || 0, 0);
    
    // Build the search query with ts_rank for relevance scoring
    const items = await this.prisma.$queryRaw<Array<SearchResult & { relevance_score: number }>>`
      SELECT 
        i.id,
        i.name,
        i.description,
        i.quantity,
        i.unit,
        i.status,
        i.current_value as "currentValue",
        i.created_at as "createdAt",
        i.updated_at as "updatedAt",
        ts_rank(i.search_vector, websearch_to_tsquery('english', ${searchTerm})) as relevance_score
        ${query.includeLocation ? ', json_build_object(\'id\', l.id, \'name\', l.name, \'path\', l.path) as location' : ''}
      FROM items i
      ${query.includeLocation ? 'JOIN locations l ON i.location_id = l.id' : ''}
      WHERE 
        i.household_id = ${householdId}
        AND i.search_vector @@ websearch_to_tsquery('english', ${searchTerm})
      ORDER BY ts_rank(i.search_vector, websearch_to_tsquery('english', ${searchTerm})) DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
    
    // Add photos and tags if requested
    return await this.enrichSearchResults(items, query);
  }

  /**
   * Trigram similarity search implementation.
   * 
   * Uses pg_trgm extension for fuzzy text matching, useful when full-text
   * search vectors are not available or query doesn't match exactly.
   * 
   * @private
   */
  private async searchWithTrigram(query: SearchQuery, householdId: string): Promise<SearchResult[]> {
    const searchTerm = query.text.trim();
    const limit = Math.min(query.limit || 20, 100);
    const offset = Math.max(query.offset || 0, 0);
    
    // Use similarity() function for relevance scoring
    const items = await this.prisma.$queryRaw<Array<SearchResult & { relevance_score: number }>>`
      SELECT 
        i.id,
        i.name,
        i.description,
        i.quantity,
        i.unit,
        i.status,
        i.current_value as "currentValue",
        i.created_at as "createdAt",
        i.updated_at as "updatedAt",
        GREATEST(
          similarity(i.name, ${searchTerm}),
          similarity(COALESCE(i.description, ''), ${searchTerm})
        ) as relevance_score
        ${query.includeLocation ? ', json_build_object(\'id\', l.id, \'name\', l.name, \'path\', l.path) as location' : ''}
      FROM items i
      ${query.includeLocation ? 'JOIN locations l ON i.location_id = l.id' : ''}
      WHERE 
        i.household_id = ${householdId}
        AND (
          similarity(i.name, ${searchTerm}) > 0.3
          OR similarity(COALESCE(i.description, ''), ${searchTerm}) > 0.3
        )
      ORDER BY GREATEST(
        similarity(i.name, ${searchTerm}),
        similarity(COALESCE(i.description, ''), ${searchTerm})
      ) DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
    
    return await this.enrichSearchResults(items, query);
  }

  /**
   * ILIKE pattern search implementation (fallback).
   * 
   * Uses basic SQL pattern matching as the most compatible search method.
   * Works on any PostgreSQL installation without extensions.
   * 
   * @private
   */
  private async searchWithILIKE(query: SearchQuery, householdId: string): Promise<SearchResult[]> {
    const searchPattern = `%${query.text.trim()}%`;
    const limit = Math.min(query.limit || 20, 100);
    const offset = Math.max(query.offset || 0, 0);
    
    const whereClause = {
      householdId,
      OR: [
        { name: { contains: query.text.trim(), mode: 'insensitive' as const } },
        { description: { contains: query.text.trim(), mode: 'insensitive' as const } },
      ],
    };
    
    const include = {
      location: query.includeLocation ? {
        select: { id: true, name: true, path: true }
      } : false,
      photos: query.includePhotos ? {
        select: { id: true, thumbnailUrl: true, isPrimary: true },
        take: 3,
        orderBy: [
          { isPrimary: 'desc' as const },
          { displayOrder: 'asc' as const }
        ]
      } : false,
      tags: query.includeTags ? {
        select: {
          tag: {
            select: { id: true, name: true, color: true }
          }
        }
      } : false,
    };
    
    const items = await this.prisma.item.findMany({
      where: whereClause,
      include,
      take: limit,
      skip: offset,
      orderBy: [
        { name: 'asc' },
        { createdAt: 'desc' }
      ],
    });
    
    // Transform Prisma results to match SearchResult interface
    return items.map(item => ({
      id: item.id,
      name: item.name,
      description: item.description,
      quantity: item.quantity,
      unit: item.unit,
      status: item.status,
      currentValue: item.currentValue ? Number(item.currentValue) : null,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      location: query.includeLocation ? item.location : undefined,
      photos: query.includePhotos ? item.photos : undefined,
      tags: query.includeTags ? item.tags?.map((itemTag: any) => itemTag.tag) : undefined,
      relevanceScore: 0.5, // Static score for ILIKE fallback
    }));
  }

  /**
   * Enrich search results with additional data (photos, tags) when requested.
   * 
   * @private
   */
  private async enrichSearchResults(
    items: Array<SearchResult & { relevance_score?: number }>,
    query: SearchQuery
  ): Promise<SearchResult[]> {
    if (!query.includePhotos && !query.includeTags) {
      return items.map(item => ({
        ...item,
        relevanceScore: item.relevance_score || 0,
      }));
    }
    
    // Batch fetch photos and tags for all items to avoid N+1 queries
    const itemIds = items.map(item => item.id);
    
    const [photos, tags] = await Promise.all([
      query.includePhotos 
        ? this.prisma.itemPhoto.findMany({
            where: { itemId: { in: itemIds } },
            select: {
              id: true,
              itemId: true,
              thumbnailUrl: true,
              isPrimary: true,
              displayOrder: true,
            },
            orderBy: [
              { isPrimary: 'desc' },
              { displayOrder: 'asc' }
            ],
          })
        : [],
      query.includeTags
        ? this.prisma.itemTag.findMany({
            where: { itemId: { in: itemIds } },
            include: {
              tag: {
                select: { id: true, name: true, color: true }
              }
            },
          })
        : [],
    ]);
    
    // Group photos and tags by item ID
    const photosByItem = photos.reduce((acc, photo) => {
      if (!acc[photo.itemId]) acc[photo.itemId] = [];
      acc[photo.itemId].push(photo);
      return acc;
    }, {} as Record<string, Array<any>>);
    
    const tagsByItem = tags.reduce((acc, itemTag) => {
      if (!acc[itemTag.itemId]) acc[itemTag.itemId] = [];
      acc[itemTag.itemId].push(itemTag.tag);
      return acc;
    }, {} as Record<string, Array<{ id: string; name: string; color: string }>>);
    
    return items.map(item => ({
      ...item,
      photos: query.includePhotos ? photosByItem[item.id]?.slice(0, 3) : undefined,
      tags: query.includeTags ? tagsByItem[item.id] : undefined,
      relevanceScore: item.relevance_score || 0,
    }));
  }

  /**
   * Get user's household for security isolation.
   * 
   * @private
   */
  private async getUserHousehold(userId: string): Promise<{ id: string; name: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        defaultHouseholdId: true,
        households: {
          select: { household: { select: { id: true, name: true } } },
          take: 1,
        },
      },
    });
    
    if (!user) {
      throw new SearchError('User not found', 'USER_NOT_FOUND');
    }
    
    // Use default household or first available household
    const household = user.defaultHouseholdId 
      ? { id: user.defaultHouseholdId, name: 'Default' }
      : user.households[0]?.household;
    
    if (!household) {
      throw new SearchError('No household found for user', 'NO_HOUSEHOLD');
    }
    
    return household;
  }

  /**
   * Validate search query parameters.
   * 
   * @private
   */
  private validateSearchQuery(query: SearchQuery): void {
    if (!query.text || typeof query.text !== 'string') {
      throw new SearchValidationError('Search query text is required');
    }
    
    if (query.text.trim().length < 2) {
      throw new SearchValidationError('Search query must be at least 2 characters');
    }
    
    if (query.text.length > 500) {
      throw new SearchValidationError('Search query too long (max 500 characters)');
    }
    
    if (query.limit && (query.limit < 1 || query.limit > 100)) {
      throw new SearchValidationError('Search limit must be between 1 and 100');
    }
    
    if (query.offset && query.offset < 0) {
      throw new SearchValidationError('Search offset cannot be negative');
    }
  }

  /**
   * Sanitize search term for safe use in SQL queries.
   * 
   * @private
   */
  private sanitizeSearchTerm(text: string): string {
    return text
      .trim()
      .replace(/[^\w\s\-\.]/g, ' ') // Remove special chars except basic punctuation
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }

  /**
   * Determine which search method was used for analytics.
   * 
   * @private
   */
  private determineSearchMethod(): 'full_text_search' | 'trigram_search' | 'ilike_fallback' {
    if (this.searchConfig?.useFullTextSearch) {
      return 'full_text_search';
    }
    if (this.searchConfig?.useTrigramSearch) {
      return 'trigram_search';
    }
    return 'ilike_fallback';
  }

  /**
   * Log search analytics without storing sensitive query data.
   * 
   * @private
   */
  private async logSearchAnalytics(data: SearchAnalyticsData): Promise<void> {
    try {
      await this.prisma.searchAnalytics.create({
        data: {
          householdId: data.householdId,
          queryLength: data.queryLength,
          resultCount: data.resultCount,
          responseTimeMs: data.responseTime,
          searchMethod: data.searchMethod.toUpperCase() as any,
        },
      });
    } catch (error) {
      // Don't throw on analytics failure, but log for monitoring
      console.warn('Failed to log search analytics:', error);
    }
  }

  /**
   * Log search errors for monitoring and debugging.
   * 
   * @private
   */
  private async logSearchError(
    userId: string,
    queryLength: number,
    responseTime: number,
    error: unknown
  ): Promise<void> {
    try {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Search error for user', userId, {
        queryLength,
        responseTime,
        error: errorMessage,
        timestamp: new Date().toISOString(),
      });
    } catch (logError) {
      // Ignore logging errors
    }
  }

  /**
   * Queue an item for search vector update.
   * 
   * This method adds an item to the background processing queue for search
   * vector regeneration, typically called after item updates.
   * 
   * @param itemId - UUID of the item to update
   * @param priority - Priority level (1-10, higher = more urgent)
   * 
   * @example Queue search update after item modification
   * ```typescript
   * await searchService.queueSearchUpdate('item-uuid', 8);
   * ```
   */
  async queueSearchUpdate(itemId: string, priority: number = 5): Promise<void> {
    try {
      await this.prisma.$executeRaw`SELECT queue_search_update(${itemId}::uuid, ${priority})`;
    } catch (error) {
      console.warn(`Failed to queue search update for item ${itemId}:`, error);
      // Don't throw as this is a background optimization
    }
  }

  /**
   * Process pending search vector updates.
   * 
   * This method processes queued search vector updates and should be called
   * by background job processors or during maintenance windows.
   * 
   * @param batchSize - Number of updates to process in one batch
   * @returns Number of updates processed
   * 
   * @example Process search queue updates
   * ```typescript
   * const processed = await searchService.processSearchQueue(50);
   * console.log(`Processed ${processed} search updates`);
   * ```
   */
  async processSearchQueue(batchSize: number = 10): Promise<number> {
    try {
      const result = await this.prisma.$queryRaw<[{ process_search_queue: number }]>`
        SELECT process_search_queue(${batchSize}) as process_search_queue
      `;
      return result[0]?.process_search_queue || 0;
    } catch (error) {
      console.error('Failed to process search queue:', error);
      return 0;
    }
  }

  /**
   * Get current search configuration and statistics.
   * 
   * This method returns information about the current search capabilities,
   * extension availability, and performance statistics.
   * 
   * @returns Promise<SearchCapabilities> Current search configuration
   */
  async getSearchCapabilities(): Promise<{
    extensionsAvailable: ExtensionStatus;
    configuration: SearchConfiguration;
    statistics: {
      totalSearchVectors: number;
      queuedUpdates: number;
      avgResponseTime: number;
    };
  }> {
    if (!this.extensionStatus || !this.searchConfig) {
      await this.initializeSearchConfiguration();
    }

    // Get current statistics
    const [vectorCount, queueCount, avgResponseTime] = await Promise.all([
      this.prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*) as count FROM items WHERE search_vector IS NOT NULL
      `.then(result => Number(result[0].count)),
      this.prisma.searchUpdateQueue.count({ where: { status: 'PENDING' } }),
      this.prisma.searchAnalytics.aggregate({
        _avg: { responseTimeMs: true },
        where: { timestamp: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      }).then(result => result._avg.responseTimeMs || 0),
    ]);

    return {
      extensionsAvailable: this.extensionStatus!,
      configuration: this.searchConfig!,
      statistics: {
        totalSearchVectors: vectorCount,
        queuedUpdates: queueCount,
        avgResponseTime: Math.round(avgResponseTime),
      },
    };
  }
}

// Export singleton instance
export const searchService = new SearchService(prisma);