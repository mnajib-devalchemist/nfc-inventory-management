/**
 * @jest-environment node
 */

import { SearchService } from '@/lib/services/search';
import { prisma } from '@/lib/db';
import type { SearchQuery } from '@/lib/types/search';

// Mock Prisma for performance tests
jest.mock('@/lib/db');
const mockPrisma = prisma as jest.Mocked<typeof prisma>;

// Mock data generators for different dataset sizes
function generateMockItems(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `item-${i + 1}`,
    name: `Item ${i + 1}`,
    description: `Description for item ${i + 1} with searchable content`,
    quantity: Math.floor(Math.random() * 10) + 1,
    unit: 'piece',
    status: 'AVAILABLE',
    currentValue: Math.floor(Math.random() * 1000) + 50,
    createdAt: new Date(),
    updatedAt: new Date(),
    relevance_score: Math.random(),
  }));
}

function generateMockUser() {
  return {
    id: 'user-perf-test',
    email: 'perf@test.com',
    name: 'Performance Test User',
    defaultHouseholdId: 'household-perf',
  };
}

function generateMockHouseholdMember() {
  return {
    id: 'member-perf',
    userId: 'user-perf-test',
    householdId: 'household-perf',
    role: 'member',
    permissions: {},
    household: {
      id: 'household-perf',
      name: 'Performance Test Household',
    },
  };
}

describe('Search Performance Tests', () => {
  let searchService: SearchService;

  beforeEach(() => {
    searchService = new SearchService(mockPrisma);
    jest.clearAllMocks();

    // Setup basic mocks
    mockPrisma.user.findUnique.mockResolvedValue(generateMockUser());
    mockPrisma.householdMember.findFirst.mockResolvedValue(generateMockHouseholdMember());
    mockPrisma.searchAnalytics.create.mockResolvedValue({} as any);
    mockPrisma.searchUpdateQueue.count.mockResolvedValue(0);
    mockPrisma.searchAnalytics.aggregate.mockResolvedValue({
      _avg: { responseTimeMs: 150 },
    });
  });

  describe('Response Time Targets', () => {
    it('should meet <300ms target for 500 items with full-text search', async () => {
      const mockItems = generateMockItems(500);
      
      // Mock full-text search scenario
      mockPrisma.$queryRaw.mockImplementation(async (query: any) => {
        const queryStr = query.strings[0];
        if (queryStr.includes('current_setting')) {
          return [{ current_setting: 'on' }]; // Extensions available
        }
        if (queryStr.includes('ts_rank')) {
          // Simulate database processing time for 500 items
          await new Promise(resolve => setTimeout(resolve, 50)); // 50ms DB time
          return mockItems.slice(0, 20); // Return first 20 results
        }
        if (queryStr.includes('COUNT(*)')) {
          return [{ count: BigInt(500) }];
        }
        return [];
      });

      const query: SearchQuery = {
        text: 'searchable content',
        limit: 20,
        offset: 0,
      };

      const startTime = Date.now();
      const result = await searchService.searchItems('user-perf-test', query);
      const endTime = Date.now();
      const responseTime = endTime - startTime;

      expect(responseTime).toBeLessThan(300);
      expect(result.items).toHaveLength(20);
      expect(result.searchMethod).toBe('full_text_search');
      expect(result.responseTime).toBeGreaterThan(0);
    });

    it('should meet <600ms target for 1000 items with full-text search', async () => {
      const mockItems = generateMockItems(1000);
      
      mockPrisma.$queryRaw.mockImplementation(async (query: any) => {
        const queryStr = query.strings[0];
        if (queryStr.includes('current_setting')) {
          return [{ current_setting: 'on' }];
        }
        if (queryStr.includes('ts_rank')) {
          // Simulate database processing time for 1000 items
          await new Promise(resolve => setTimeout(resolve, 120)); // 120ms DB time
          return mockItems.slice(0, 20);
        }
        if (queryStr.includes('COUNT(*)')) {
          return [{ count: BigInt(1000) }];
        }
        return [];
      });

      const query: SearchQuery = {
        text: 'searchable content',
        limit: 20,
        offset: 0,
      };

      const startTime = Date.now();
      const result = await searchService.searchItems('user-perf-test', query);
      const endTime = Date.now();
      const responseTime = endTime - startTime;

      expect(responseTime).toBeLessThan(600);
      expect(result.items).toHaveLength(20);
      expect(result.searchMethod).toBe('full_text_search');
    });

    it('should handle trigram search within reasonable time for 500 items', async () => {
      const mockItems = generateMockItems(500);
      
      // Mock trigram search scenario (pg_trgm available)
      mockPrisma.$queryRaw.mockImplementation(async (query: any) => {
        const queryStr = query.strings[0];
        if (queryStr.includes('current_setting')) {
          return [{ current_setting: 'on' }]; // Extensions available
        }
        if (queryStr.includes('ts_rank')) {
          throw new Error('Full-text search failed'); // Force fallback
        }
        if (queryStr.includes('similarity')) {
          // Simulate trigram processing time
          await new Promise(resolve => setTimeout(resolve, 80)); // 80ms for similarity calculation
          return mockItems.slice(0, 20);
        }
        if (queryStr.includes('COUNT(*)')) {
          return [{ count: BigInt(0) }]; // No search vectors
        }
        return [];
      });

      const query: SearchQuery = {
        text: 'fuzzy match test',
        limit: 20,
        offset: 0,
      };

      const startTime = Date.now();
      const result = await searchService.searchItems('user-perf-test', query);
      const endTime = Date.now();
      const responseTime = endTime - startTime;

      expect(responseTime).toBeLessThan(400); // Slightly higher for trigram
      expect(result.searchMethod).toBe('trigram_search');
    });

    it('should handle ILIKE fallback within acceptable time', async () => {
      const mockItems = generateMockItems(100);
      
      // Mock ILIKE fallback scenario
      mockPrisma.$queryRaw.mockImplementation(async (query: any) => {
        const queryStr = query.strings[0];
        if (queryStr.includes('current_setting')) {
          return [{ current_setting: 'off' }]; // No extensions
        }
        if (queryStr.includes('COUNT(*)')) {
          return [{ count: BigInt(0) }];
        }
        return [];
      });

      mockPrisma.item.findMany.mockImplementation(async () => {
        // Simulate ILIKE processing time
        await new Promise(resolve => setTimeout(resolve, 30)); // 30ms for simple pattern matching
        return mockItems.slice(0, 20).map(item => ({
          ...item,
          currentValue: item.currentValue ? { toNumber: () => item.currentValue } : null,
        })) as any;
      });

      const query: SearchQuery = {
        text: 'simple search',
        limit: 20,
        offset: 0,
      };

      const startTime = Date.now();
      const result = await searchService.searchItems('user-perf-test', query);
      const endTime = Date.now();
      const responseTime = endTime - startTime;

      expect(responseTime).toBeLessThan(200); // ILIKE should be fastest for small datasets
      expect(result.searchMethod).toBe('ilike_fallback');
    });
  });

  describe('Concurrent User Performance', () => {
    it('should handle 5 concurrent users within response time targets', async () => {
      const mockItems = generateMockItems(500);
      
      mockPrisma.$queryRaw.mockImplementation(async (query: any) => {
        const queryStr = query.strings[0];
        if (queryStr.includes('current_setting')) {
          return [{ current_setting: 'on' }];
        }
        if (queryStr.includes('ts_rank')) {
          // Simulate realistic database load with concurrent users
          await new Promise(resolve => setTimeout(resolve, 60));
          return mockItems.slice(0, 20);
        }
        if (queryStr.includes('COUNT(*)')) {
          return [{ count: BigInt(500) }];
        }
        return [];
      });

      const query: SearchQuery = {
        text: 'concurrent search test',
        limit: 20,
        offset: 0,
      };

      // Simulate 5 concurrent users
      const concurrentSearches = Array.from({ length: 5 }, (_, i) => ({
        userId: `user-concurrent-${i}`,
        query,
      }));

      // Setup mocks for each user
      mockPrisma.user.findUnique.mockImplementation(async (args: any) => ({
        id: args.where.id,
        email: `${args.where.id}@test.com`,
        name: `User ${args.where.id}`,
        defaultHouseholdId: 'household-perf',
      }));

      const startTime = Date.now();
      const results = await Promise.all(
        concurrentSearches.map(search =>
          searchService.searchItems(search.userId, search.query)
        )
      );
      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // All requests should complete within reasonable time
      expect(totalTime).toBeLessThan(1000); // 5 concurrent requests < 1 second
      
      // Each result should be valid
      results.forEach(result => {
        expect(result.items).toBeDefined();
        expect(result.responseTime).toBeGreaterThan(0);
        expect(result.searchMethod).toBe('full_text_search');
      });
    });

    it('should handle 10 concurrent users with acceptable degradation', async () => {
      const mockItems = generateMockItems(1000);
      
      mockPrisma.$queryRaw.mockImplementation(async (query: any) => {
        const queryStr = query.strings[0];
        if (queryStr.includes('current_setting')) {
          return [{ current_setting: 'on' }];
        }
        if (queryStr.includes('ts_rank')) {
          // Simulate increased load with more concurrent users
          await new Promise(resolve => setTimeout(resolve, 100));
          return mockItems.slice(0, 20);
        }
        if (queryStr.includes('COUNT(*)')) {
          return [{ count: BigInt(1000) }];
        }
        return [];
      });

      const query: SearchQuery = {
        text: 'heavy load test',
        limit: 20,
        offset: 0,
      };

      const concurrentSearches = Array.from({ length: 10 }, (_, i) => ({
        userId: `user-load-${i}`,
        query,
      }));

      mockPrisma.user.findUnique.mockImplementation(async (args: any) => ({
        id: args.where.id,
        email: `${args.where.id}@test.com`,
        name: `User ${args.where.id}`,
        defaultHouseholdId: 'household-perf',
      }));

      const startTime = Date.now();
      const results = await Promise.all(
        concurrentSearches.map(search =>
          searchService.searchItems(search.userId, search.query)
        )
      );
      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // Accept some degradation but should still be reasonable
      expect(totalTime).toBeLessThan(2000); // 10 concurrent requests < 2 seconds
      
      results.forEach(result => {
        expect(result.items).toBeDefined();
        expect(result.responseTime).toBeGreaterThan(0);
      });
    });
  });

  describe('Memory and Resource Usage', () => {
    it('should handle large result sets efficiently', async () => {
      const largeDataset = generateMockItems(2000);
      
      mockPrisma.$queryRaw.mockImplementation(async (query: any) => {
        const queryStr = query.strings[0];
        if (queryStr.includes('current_setting')) {
          return [{ current_setting: 'on' }];
        }
        if (queryStr.includes('ts_rank')) {
          // Return large result set but only requested limit
          await new Promise(resolve => setTimeout(resolve, 100));
          return largeDataset.slice(0, 100); // Still respect limit
        }
        if (queryStr.includes('COUNT(*)')) {
          return [{ count: BigInt(2000) }];
        }
        return [];
      });

      const query: SearchQuery = {
        text: 'large dataset search',
        limit: 100,
        offset: 0,
        includePhotos: true,
        includeTags: true,
        includeLocation: true,
      };

      // Mock photo and tag data
      mockPrisma.itemPhoto.findMany.mockResolvedValue([]);
      mockPrisma.itemTag.findMany.mockResolvedValue([]);

      const startTime = Date.now();
      const result = await searchService.searchItems('user-perf-test', query);
      const endTime = Date.now();
      const responseTime = endTime - startTime;

      expect(responseTime).toBeLessThan(800); // Allow more time for enrichment
      expect(result.items).toHaveLength(100);
      expect(result.totalCount).toBe(2000);
    });

    it('should efficiently handle pagination through large datasets', async () => {
      const largeDataset = generateMockItems(5000);
      
      mockPrisma.$queryRaw.mockImplementation(async (query: any) => {
        const queryStr = query.strings[0];
        if (queryStr.includes('current_setting')) {
          return [{ current_setting: 'on' }];
        }
        if (queryStr.includes('ts_rank')) {
          // Simulate pagination query
          const offsetMatch = queryStr.match(/OFFSET (\d+)/);
          const offset = offsetMatch ? parseInt(offsetMatch[1]) : 0;
          const limitMatch = queryStr.match(/LIMIT (\d+)/);
          const limit = limitMatch ? parseInt(limitMatch[1]) : 20;
          
          await new Promise(resolve => setTimeout(resolve, 50));
          return largeDataset.slice(offset, offset + limit);
        }
        if (queryStr.includes('COUNT(*)')) {
          return [{ count: BigInt(5000) }];
        }
        return [];
      });

      // Test multiple pages
      const pageQueries = [
        { text: 'pagination test', limit: 50, offset: 0 },
        { text: 'pagination test', limit: 50, offset: 50 },
        { text: 'pagination test', limit: 50, offset: 100 },
        { text: 'pagination test', limit: 50, offset: 4950 }, // Near end
      ];

      const startTime = Date.now();
      const results = await Promise.all(
        pageQueries.map(query => searchService.searchItems('user-perf-test', query))
      );
      const endTime = Date.now();
      const totalTime = endTime - startTime;

      expect(totalTime).toBeLessThan(1000); // All pagination queries < 1 second
      
      results.forEach((result, index) => {
        expect(result.items).toBeDefined();
        expect(result.items.length).toBeLessThanOrEqual(50);
        expect(result.totalCount).toBe(5000);
      });
    });
  });

  describe('Extension Fallback Performance', () => {
    it('should fallback quickly when extensions fail', async () => {
      const mockItems = generateMockItems(200);
      
      // Mock progressive fallback scenario
      let fallbackStep = 0;
      mockPrisma.$queryRaw.mockImplementation(async (query: any) => {
        const queryStr = query.strings[0];
        if (queryStr.includes('current_setting')) {
          return [{ current_setting: 'on' }]; // Extensions available
        }
        if (queryStr.includes('ts_rank')) {
          fallbackStep = 1;
          throw new Error('Full-text search failed');
        }
        if (queryStr.includes('similarity')) {
          fallbackStep = 2;
          throw new Error('Trigram search failed');
        }
        if (queryStr.includes('COUNT(*)')) {
          return [{ count: BigInt(0) }];
        }
        return [];
      });

      mockPrisma.item.findMany.mockImplementation(async () => {
        fallbackStep = 3;
        await new Promise(resolve => setTimeout(resolve, 25)); // ILIKE is fast
        return mockItems.slice(0, 20).map(item => ({
          ...item,
          currentValue: item.currentValue ? { toNumber: () => item.currentValue } : null,
        })) as any;
      });

      const query: SearchQuery = {
        text: 'fallback performance test',
        limit: 20,
        offset: 0,
      };

      const startTime = Date.now();
      const result = await searchService.searchItems('user-perf-test', query);
      const endTime = Date.now();
      const responseTime = endTime - startTime;

      expect(responseTime).toBeLessThan(300); // Should still be fast despite fallbacks
      expect(fallbackStep).toBe(3); // Should have fallen back to ILIKE
      expect(result.searchMethod).toBe('ilike_fallback');
      expect(result.items).toBeDefined();
    });
  });
});