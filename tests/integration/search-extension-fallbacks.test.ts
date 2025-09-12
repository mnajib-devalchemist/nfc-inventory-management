/**
 * @jest-environment node
 */

import { SearchService } from '@/lib/services/search';
import { prisma } from '@/lib/db';
import type { SearchQuery } from '@/lib/types/search';

// Mock Prisma
jest.mock('@/lib/db');
const mockPrisma = prisma as jest.Mocked<typeof prisma>;

// Test data
const mockUser = {
  id: 'user-extension-test',
  email: 'extension@test.com',
  name: 'Extension Test User',
  defaultHouseholdId: 'household-extension',
};

const mockHouseholdMember = {
  id: 'member-extension',
  userId: 'user-extension-test',
  householdId: 'household-extension',
  role: 'member',
  permissions: {},
  household: {
    id: 'household-extension',
    name: 'Extension Test Household',
  },
};

const mockSearchResults = [
  {
    id: 'item-1',
    name: 'Test Item',
    description: 'Test description',
    quantity: 1,
    unit: 'piece',
    status: 'AVAILABLE',
    currentValue: 100,
    createdAt: new Date(),
    updatedAt: new Date(),
    relevance_score: 0.8,
  },
];

describe('Search Extension Fallback Tests', () => {
  let searchService: SearchService;
  const basicQuery: SearchQuery = {
    text: 'test query',
    limit: 20,
    offset: 0,
  };

  beforeEach(() => {
    searchService = new SearchService(mockPrisma);
    jest.clearAllMocks();

    // Setup basic mocks
    mockPrisma.user.findUnique.mockResolvedValue(mockUser);
    mockPrisma.householdMember.findFirst.mockResolvedValue(mockHouseholdMember);
    mockPrisma.searchAnalytics.create.mockResolvedValue({} as any);
    mockPrisma.searchUpdateQueue.count.mockResolvedValue(0);
    mockPrisma.searchAnalytics.aggregate.mockResolvedValue({
      _avg: { responseTimeMs: 150 },
    });
  });

  describe('Extension Availability Detection', () => {
    it('should detect when all extensions are available', async () => {
      mockPrisma.$queryRaw.mockImplementation(async (query: any) => {
        const queryStr = query.strings[0];
        if (queryStr.includes('current_setting')) {
          // Mock all extensions as available
          return [{ current_setting: 'on' }];
        }
        if (queryStr.includes('ts_rank')) {
          return mockSearchResults;
        }
        if (queryStr.includes('COUNT(*)')) {
          return [{ count: BigInt(1) }];
        }
        return [];
      });

      const result = await searchService.searchItems('user-extension-test', basicQuery);

      expect(result.searchMethod).toBe('full_text_search');
      expect(result.items).toHaveLength(1);
    });

    it('should detect when pg_trgm is unavailable but unaccent is available', async () => {
      let extensionCheckCount = 0;
      mockPrisma.$queryRaw.mockImplementation(async (query: any) => {
        const queryStr = query.strings[0];
        if (queryStr.includes('current_setting')) {
          extensionCheckCount++;
          // Mock pg_trgm as unavailable, unaccent as available
          if (queryStr.includes('pg_trgm')) {
            return [{ current_setting: 'off' }];
          } else if (queryStr.includes('unaccent')) {
            return [{ current_setting: 'on' }];
          } else if (queryStr.includes('uuid-ossp')) {
            return [{ current_setting: 'on' }];
          }
        }
        if (queryStr.includes('ts_rank')) {
          return mockSearchResults;
        }
        if (queryStr.includes('COUNT(*)')) {
          return [{ count: BigInt(1) }];
        }
        return [];
      });

      const result = await searchService.searchItems('user-extension-test', basicQuery);

      expect(result.searchMethod).toBe('full_text_search'); // Can still use FTS without pg_trgm
      expect(extensionCheckCount).toBe(3); // Should check all 3 extensions
    });

    it('should detect when all extensions are unavailable', async () => {
      mockPrisma.$queryRaw.mockImplementation(async (query: any) => {
        const queryStr = query.strings[0];
        if (queryStr.includes('current_setting')) {
          return [{ current_setting: 'off' }]; // All extensions unavailable
        }
        if (queryStr.includes('COUNT(*)')) {
          return [{ count: BigInt(0) }];
        }
        return [];
      });

      // Mock ILIKE fallback
      mockPrisma.item.findMany.mockResolvedValue(
        mockSearchResults.map(item => ({
          ...item,
          currentValue: item.currentValue ? { toNumber: () => item.currentValue } : null,
        })) as any
      );

      const result = await searchService.searchItems('user-extension-test', basicQuery);

      expect(result.searchMethod).toBe('ilike_fallback');
      expect(result.items).toHaveLength(1);
    });
  });

  describe('Full-Text Search Fallback Scenarios', () => {
    it('should fallback to trigram when full-text search fails due to no search vectors', async () => {
      mockPrisma.$queryRaw.mockImplementation(async (query: any) => {
        const queryStr = query.strings[0];
        if (queryStr.includes('current_setting')) {
          return [{ current_setting: 'on' }]; // Extensions available
        }
        if (queryStr.includes('ts_rank')) {
          return []; // No results from full-text search (no vectors)
        }
        if (queryStr.includes('similarity')) {
          return mockSearchResults; // Trigram search works
        }
        if (queryStr.includes('COUNT(*)')) {
          return [{ count: BigInt(0) }]; // No search vectors available
        }
        return [];
      });

      const result = await searchService.searchItems('user-extension-test', basicQuery);

      expect(result.searchMethod).toBe('trigram_search');
      expect(result.items).toHaveLength(1);
    });

    it('should fallback to trigram when full-text search throws error', async () => {
      mockPrisma.$queryRaw.mockImplementation(async (query: any) => {
        const queryStr = query.strings[0];
        if (queryStr.includes('current_setting')) {
          return [{ current_setting: 'on' }];
        }
        if (queryStr.includes('ts_rank')) {
          throw new Error('Full-text search configuration error');
        }
        if (queryStr.includes('similarity')) {
          return mockSearchResults;
        }
        if (queryStr.includes('COUNT(*)')) {
          return [{ count: BigInt(100) }]; // Search vectors exist but FTS fails
        }
        return [];
      });

      const result = await searchService.searchItems('user-extension-test', basicQuery);

      expect(result.searchMethod).toBe('trigram_search');
      expect(result.items).toHaveLength(1);
    });

    it('should fallback to ILIKE when both full-text and trigram fail', async () => {
      mockPrisma.$queryRaw.mockImplementation(async (query: any) => {
        const queryStr = query.strings[0];
        if (queryStr.includes('current_setting')) {
          return [{ current_setting: 'on' }];
        }
        if (queryStr.includes('ts_rank')) {
          throw new Error('Full-text search failed');
        }
        if (queryStr.includes('similarity')) {
          throw new Error('Trigram search failed');
        }
        if (queryStr.includes('COUNT(*)')) {
          return [{ count: BigInt(0) }];
        }
        return [];
      });

      mockPrisma.item.findMany.mockResolvedValue(
        mockSearchResults.map(item => ({
          ...item,
          currentValue: item.currentValue ? { toNumber: () => item.currentValue } : null,
        })) as any
      );

      const result = await searchService.searchItems('user-extension-test', basicQuery);

      expect(result.searchMethod).toBe('ilike_fallback');
      expect(result.items).toHaveLength(1);
    });
  });

  describe('Trigram Search Fallback Scenarios', () => {
    it('should fallback to ILIKE when trigram search fails due to missing extension', async () => {
      let trigram_available = true;
      mockPrisma.$queryRaw.mockImplementation(async (query: any) => {
        const queryStr = query.strings[0];
        if (queryStr.includes('current_setting')) {
          if (queryStr.includes('pg_trgm')) {
            return [{ current_setting: trigram_available ? 'on' : 'off' }];
          }
          return [{ current_setting: 'on' }];
        }
        if (queryStr.includes('ts_rank')) {
          return []; // No full-text results
        }
        if (queryStr.includes('similarity')) {
          // Simulate extension being disabled during search
          trigram_available = false;
          throw new Error('function similarity(text, text) does not exist');
        }
        if (queryStr.includes('COUNT(*)')) {
          return [{ count: BigInt(0) }];
        }
        return [];
      });

      mockPrisma.item.findMany.mockResolvedValue(
        mockSearchResults.map(item => ({
          ...item,
          currentValue: item.currentValue ? { toNumber: () => item.currentValue } : null,
        })) as any
      );

      const result = await searchService.searchItems('user-extension-test', basicQuery);

      expect(result.searchMethod).toBe('ilike_fallback');
      expect(result.items).toHaveLength(1);
    });

    it('should handle trigram search timeout and fallback', async () => {
      mockPrisma.$queryRaw.mockImplementation(async (query: any) => {
        const queryStr = query.strings[0];
        if (queryStr.includes('current_setting')) {
          return [{ current_setting: 'on' }];
        }
        if (queryStr.includes('ts_rank')) {
          return [];
        }
        if (queryStr.includes('similarity')) {
          // Simulate timeout
          await new Promise(resolve => setTimeout(resolve, 1000));
          throw new Error('Query timeout');
        }
        if (queryStr.includes('COUNT(*)')) {
          return [{ count: BigInt(0) }];
        }
        return [];
      });

      mockPrisma.item.findMany.mockResolvedValue(
        mockSearchResults.map(item => ({
          ...item,
          currentValue: item.currentValue ? { toNumber: () => item.currentValue } : null,
        })) as any
      );

      const result = await searchService.searchItems('user-extension-test', basicQuery);

      expect(result.searchMethod).toBe('ilike_fallback');
      expect(result.items).toHaveLength(1);
    });
  });

  describe('Environment-Specific Extension Behavior', () => {
    it('should handle development environment without extensions', async () => {
      // Mock development environment where extensions might not be installed
      mockPrisma.$queryRaw.mockImplementation(async (query: any) => {
        const queryStr = query.strings[0];
        if (queryStr.includes('current_setting')) {
          // Simulate development environment
          return [{ current_setting: 'off' }];
        }
        if (queryStr.includes('COUNT(*)')) {
          return [{ count: BigInt(0) }];
        }
        return [];
      });

      mockPrisma.item.findMany.mockResolvedValue(
        mockSearchResults.map(item => ({
          ...item,
          currentValue: item.currentValue ? { toNumber: () => item.currentValue } : null,
        })) as any
      );

      const result = await searchService.searchItems('user-extension-test', basicQuery);

      expect(result.searchMethod).toBe('ilike_fallback');
      expect(result.items).toHaveLength(1);
      expect(result.responseTime).toBeGreaterThan(0);
    });

    it('should handle production environment with full extension support', async () => {
      // Mock production environment with all extensions
      mockPrisma.$queryRaw.mockImplementation(async (query: any) => {
        const queryStr = query.strings[0];
        if (queryStr.includes('current_setting')) {
          return [{ current_setting: 'on' }];
        }
        if (queryStr.includes('ts_rank')) {
          return mockSearchResults;
        }
        if (queryStr.includes('COUNT(*)')) {
          return [{ count: BigInt(100) }];
        }
        return [];
      });

      const result = await searchService.searchItems('user-extension-test', basicQuery);

      expect(result.searchMethod).toBe('full_text_search');
      expect(result.items).toHaveLength(1);
    });

    it('should handle staging environment with partial extension support', async () => {
      // Mock staging environment with some extensions
      mockPrisma.$queryRaw.mockImplementation(async (query: any) => {
        const queryStr = query.strings[0];
        if (queryStr.includes('current_setting')) {
          if (queryStr.includes('pg_trgm')) {
            return [{ current_setting: 'on' }]; // Trigram available
          } else if (queryStr.includes('unaccent')) {
            return [{ current_setting: 'off' }]; // Unaccent not available
          } else {
            return [{ current_setting: 'on' }];
          }
        }
        if (queryStr.includes('ts_rank')) {
          return []; // FTS doesn't work well without unaccent
        }
        if (queryStr.includes('similarity')) {
          return mockSearchResults; // Trigram works
        }
        if (queryStr.includes('COUNT(*)')) {
          return [{ count: BigInt(0) }];
        }
        return [];
      });

      const result = await searchService.searchItems('user-extension-test', basicQuery);

      expect(result.searchMethod).toBe('trigram_search');
      expect(result.items).toHaveLength(1);
    });
  });

  describe('Extension Configuration Caching', () => {
    it('should cache extension status and not check repeatedly', async () => {
      let extensionCheckCount = 0;
      mockPrisma.$queryRaw.mockImplementation(async (query: any) => {
        const queryStr = query.strings[0];
        if (queryStr.includes('current_setting')) {
          extensionCheckCount++;
          return [{ current_setting: 'on' }];
        }
        if (queryStr.includes('ts_rank')) {
          return mockSearchResults;
        }
        if (queryStr.includes('COUNT(*)')) {
          return [{ count: BigInt(1) }];
        }
        return [];
      });

      // Perform multiple searches
      await searchService.searchItems('user-extension-test', basicQuery);
      await searchService.searchItems('user-extension-test', basicQuery);
      await searchService.searchItems('user-extension-test', basicQuery);

      // Extension checks should be cached after first search
      expect(extensionCheckCount).toBeLessThan(9); // Should be 3 (one per extension) for first search only
    });

    it('should handle extension status changes during runtime', async () => {
      let extensionEnabled = true;
      mockPrisma.$queryRaw.mockImplementation(async (query: any) => {
        const queryStr = query.strings[0];
        if (queryStr.includes('current_setting')) {
          return [{ current_setting: extensionEnabled ? 'on' : 'off' }];
        }
        if (queryStr.includes('ts_rank')) {
          if (extensionEnabled) {
            return mockSearchResults;
          } else {
            throw new Error('Extension not available');
          }
        }
        if (queryStr.includes('similarity')) {
          return mockSearchResults;
        }
        if (queryStr.includes('COUNT(*)')) {
          return [{ count: BigInt(extensionEnabled ? 1 : 0) }];
        }
        return [];
      });

      mockPrisma.item.findMany.mockResolvedValue(
        mockSearchResults.map(item => ({
          ...item,
          currentValue: item.currentValue ? { toNumber: () => item.currentValue } : null,
        })) as any
      );

      // First search with extensions enabled
      const result1 = await searchService.searchItems('user-extension-test', basicQuery);
      expect(result1.searchMethod).toBe('full_text_search');

      // Simulate extension being disabled
      extensionEnabled = false;

      // Create new service instance to reset cache
      const newSearchService = new SearchService(mockPrisma);
      const result2 = await newSearchService.searchItems('user-extension-test', basicQuery);
      
      // Should fallback appropriately
      expect(['trigram_search', 'ilike_fallback']).toContain(result2.searchMethod);
    });
  });

  describe('Error Recovery and Resilience', () => {
    it('should recover from intermittent extension failures', async () => {
      let failureCount = 0;
      mockPrisma.$queryRaw.mockImplementation(async (query: any) => {
        const queryStr = query.strings[0];
        if (queryStr.includes('current_setting')) {
          return [{ current_setting: 'on' }];
        }
        if (queryStr.includes('ts_rank')) {
          failureCount++;
          if (failureCount < 2) {
            throw new Error('Intermittent failure');
          }
          return mockSearchResults; // Succeeds on retry
        }
        if (queryStr.includes('similarity')) {
          return mockSearchResults;
        }
        if (queryStr.includes('COUNT(*)')) {
          return [{ count: BigInt(1) }];
        }
        return [];
      });

      const result = await searchService.searchItems('user-extension-test', basicQuery);

      // Should have fallen back to trigram after FTS failure
      expect(result.searchMethod).toBe('trigram_search');
      expect(result.items).toHaveLength(1);
    });

    it('should provide consistent results across different search methods', async () => {
      const queries = [
        'drill power tool',
        'hammer claw',
        'screwdriver set',
      ];

      // Test each query with different extension scenarios
      const scenarios = [
        'full_text_search',
        'trigram_search',
        'ilike_fallback',
      ];

      for (const scenario of scenarios) {
        mockPrisma.$queryRaw.mockImplementation(async (query: any) => {
          const queryStr = query.strings[0];
          if (queryStr.includes('current_setting')) {
            return [{ current_setting: scenario === 'ilike_fallback' ? 'off' : 'on' }];
          }
          if (queryStr.includes('ts_rank')) {
            if (scenario === 'full_text_search') {
              return mockSearchResults;
            } else {
              throw new Error('FTS not available');
            }
          }
          if (queryStr.includes('similarity')) {
            if (scenario === 'trigram_search') {
              return mockSearchResults;
            } else {
              throw new Error('Trigram not available');
            }
          }
          if (queryStr.includes('COUNT(*)')) {
            return [{ count: BigInt(scenario === 'full_text_search' ? 1 : 0) }];
          }
          return [];
        });

        mockPrisma.item.findMany.mockResolvedValue(
          scenario === 'ilike_fallback' ? 
          mockSearchResults.map(item => ({
            ...item,
            currentValue: item.currentValue ? { toNumber: () => item.currentValue } : null,
          })) as any : []
        );

        for (const queryText of queries) {
          const result = await searchService.searchItems('user-extension-test', {
            text: queryText,
            limit: 20,
            offset: 0,
          });

          expect(result.searchMethod).toBe(scenario);
          expect(result.items).toBeDefined();
          expect(result.responseTime).toBeGreaterThan(0);
        }
      }
    });
  });
});