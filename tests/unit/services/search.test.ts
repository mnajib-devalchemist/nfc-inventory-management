/**
 * @jest-environment node
 */

import { SearchService } from '@/lib/services/search';
import { prisma } from '@/lib/db';
import type { SearchQuery, SearchMethod } from '@/lib/types/search';

// Mock Prisma
jest.mock('@/lib/db', () => ({
  prisma: {
    $queryRaw: jest.fn(),
    $queryRawUnsafe: jest.fn(),
    item: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    itemPhoto: {
      findMany: jest.fn(),
    },
    itemTag: {
      findMany: jest.fn(),
    },
    searchAnalytics: {
      create: jest.fn(),
      aggregate: jest.fn(),
    },
    searchUpdateQueue: {
      count: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    householdMember: {
      findFirst: jest.fn(),
    },
  },
}));

// Mock extensions module
jest.mock('@/lib/db/extensions', () => ({
  checkExtensionAvailability: jest.fn(),
  getSearchConfiguration: jest.fn(),
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const { checkExtensionAvailability, getSearchConfiguration } = require('@/lib/db/extensions');

// Mock household data
const mockHouseholdId = 'household-123';
const mockUserId = 'user-123';

const mockUser = {
  id: mockUserId,
  email: 'test@example.com',
  name: 'Test User',
  defaultHouseholdId: mockHouseholdId,
};

const mockHouseholdMember = {
  id: 'member-123',
  userId: mockUserId,
  householdId: mockHouseholdId,
  role: 'member',
  permissions: {},
  household: {
    id: mockHouseholdId,
    name: 'Test Household',
  },
};

const mockSearchResults = [
  {
    id: 'item-1',
    name: 'Power Drill',
    description: 'Cordless power drill with battery',
    quantity: 1,
    unit: 'piece',
    status: 'AVAILABLE',
    currentValue: 150.00,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    relevance_score: 0.8,
  },
  {
    id: 'item-2',
    name: 'Hammer',
    description: 'Claw hammer for general use',
    quantity: 1,
    unit: 'piece',
    status: 'AVAILABLE',
    currentValue: 25.00,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    relevance_score: 0.6,
  },
];

describe('SearchService', () => {
  let searchService: SearchService;

  beforeEach(() => {
    searchService = new SearchService(mockPrisma);
    jest.clearAllMocks();

    // Setup default mocks
    mockPrisma.user.findUnique.mockResolvedValue(mockUser);
    mockPrisma.householdMember.findFirst.mockResolvedValue(mockHouseholdMember);
    mockPrisma.searchAnalytics.create.mockResolvedValue({} as any);
    
    // Setup extension mocks
    checkExtensionAvailability.mockResolvedValue({
      pg_trgm: true,
      unaccent: true,
      uuid_ossp: true,
    });
    
    getSearchConfiguration.mockResolvedValue({
      useFullTextSearch: true,
      useTrigramSearch: true,
      useUnaccent: true,
    });
  });

  describe('searchItems', () => {
    const basicQuery: SearchQuery = {
      text: 'drill',
      limit: 20,
      offset: 0,
      includeLocation: false,
      includePhotos: false,
      includeTags: false,
    };

    it('should perform full-text search when extensions are available', async () => {
      // Mock full-text search results
      mockPrisma.$queryRaw.mockResolvedValue(mockSearchResults);
      mockPrisma.searchUpdateQueue.count.mockResolvedValue(0);
      mockPrisma.searchAnalytics.aggregate.mockResolvedValue({
        _avg: { responseTimeMs: 150 },
      });

      const result = await searchService.searchItems(mockUserId, basicQuery);

      expect(result.items).toHaveLength(2);
      expect(result.items[0].name).toBe('Power Drill');
      expect(result.searchMethod).toBe('full_text_search');
      expect(result.responseTime).toBeGreaterThanOrEqual(0);
      expect(mockPrisma.searchAnalytics.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          householdId: mockHouseholdId,
          queryLength: 5, // Length of 'drill'
          resultCount: 2,
          searchMethod: 'FULL_TEXT_SEARCH',
        }),
      });
    });

    it('should fallback to trigram search when full-text search fails', async () => {
      // Mock extension check to show pg_trgm available but full-text fails
      mockPrisma.$queryRaw.mockImplementation(async (query: any) => {
        const queryStr = query.strings[0];
        if (queryStr.includes('current_setting')) {
          return [{ current_setting: 'on' }]; // Extensions available
        }
        if (queryStr.includes('ts_rank')) {
          throw new Error('Full-text search failed'); // Simulate failure
        }
        if (queryStr.includes('similarity')) {
          return mockSearchResults; // Trigram search results
        }
        if (queryStr.includes('COUNT(*)')) {
          return [{ count: BigInt(0) }]; // No search vectors
        }
        return [];
      });

      mockPrisma.searchUpdateQueue.count.mockResolvedValue(0);
      mockPrisma.searchAnalytics.aggregate.mockResolvedValue({
        _avg: { responseTimeMs: 200 },
      });

      const result = await searchService.searchItems(mockUserId, basicQuery);

      expect(result.items).toHaveLength(2);
      expect(result.searchMethod).toBe('trigram_search');
      expect(mockPrisma.searchAnalytics.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          searchMethod: 'TRIGRAM_SEARCH',
        }),
      });
    });

    it('should fallback to ILIKE search when all extensions fail', async () => {
      // Mock extension check to show no extensions available
      mockPrisma.$queryRaw.mockImplementation(async (query: any) => {
        const queryStr = query.strings[0];
        if (queryStr.includes('current_setting')) {
          return [{ current_setting: 'off' }]; // Extensions not available
        }
        if (queryStr.includes('COUNT(*)')) {
          return [{ count: BigInt(0) }];
        }
        return [];
      });

      // Mock ILIKE fallback
      mockPrisma.item.findMany.mockResolvedValue(mockSearchResults.map(item => ({
        ...item,
        currentValue: item.currentValue ? { toNumber: () => item.currentValue } : null,
      })) as any);

      mockPrisma.searchUpdateQueue.count.mockResolvedValue(0);
      mockPrisma.searchAnalytics.aggregate.mockResolvedValue({
        _avg: { responseTimeMs: 300 },
      });

      const result = await searchService.searchItems(mockUserId, basicQuery);

      expect(result.items).toHaveLength(2);
      expect(result.searchMethod).toBe('ilike_fallback');
      expect(mockPrisma.item.findMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          householdId: mockHouseholdId,
          OR: expect.arrayContaining([
            { name: { contains: 'drill', mode: 'insensitive' } },
            { description: { contains: 'drill', mode: 'insensitive' } },
          ]),
        }),
      });
    });

    it('should include photos when requested', async () => {
      const queryWithPhotos: SearchQuery = {
        ...basicQuery,
        includePhotos: true,
      };

      const mockPhotos = [
        {
          id: 'photo-1',
          itemId: 'item-1',
          thumbnailUrl: '/photos/thumb1.jpg',
          isPrimary: true,
          displayOrder: 0,
        },
      ];

      mockPrisma.$queryRaw.mockImplementation(async (query: any) => {
        const queryStr = query.strings[0];
        if (queryStr.includes('current_setting')) {
          return [{ current_setting: 'on' }];
        }
        if (queryStr.includes('ts_rank')) {
          return mockSearchResults;
        }
        if (queryStr.includes('COUNT(*)')) {
          return [{ count: BigInt(mockSearchResults.length) }];
        }
        return [];
      });

      mockPrisma.itemPhoto.findMany.mockResolvedValue(mockPhotos as any);
      mockPrisma.itemTag.findMany.mockResolvedValue([]);
      mockPrisma.searchUpdateQueue.count.mockResolvedValue(0);
      mockPrisma.searchAnalytics.aggregate.mockResolvedValue({
        _avg: { responseTimeMs: 150 },
      });

      const result = await searchService.searchItems(mockUserId, queryWithPhotos);

      expect(result.items[0].photos).toEqual([mockPhotos[0]]);
      expect(mockPrisma.itemPhoto.findMany).toHaveBeenCalledWith({
        where: { itemId: { in: ['item-1', 'item-2'] } },
        select: expect.objectContaining({
          id: true,
          itemId: true,
          thumbnailUrl: true,
          isPrimary: true,
          displayOrder: true,
        }),
      });
    });

    it('should include tags when requested', async () => {
      const queryWithTags: SearchQuery = {
        ...basicQuery,
        includeTags: true,
      };

      const mockTags = [
        {
          itemId: 'item-1',
          tagId: 'tag-1',
          tag: {
            id: 'tag-1',
            name: 'Tools',
            color: '#FF0000',
          },
        },
      ];

      mockPrisma.$queryRaw.mockImplementation(async (query: any) => {
        const queryStr = query.strings[0];
        if (queryStr.includes('current_setting')) {
          return [{ current_setting: 'on' }];
        }
        if (queryStr.includes('ts_rank')) {
          return mockSearchResults;
        }
        if (queryStr.includes('COUNT(*)')) {
          return [{ count: BigInt(mockSearchResults.length) }];
        }
        return [];
      });

      mockPrisma.itemPhoto.findMany.mockResolvedValue([]);
      mockPrisma.itemTag.findMany.mockResolvedValue(mockTags as any);
      mockPrisma.searchUpdateQueue.count.mockResolvedValue(0);
      mockPrisma.searchAnalytics.aggregate.mockResolvedValue({
        _avg: { responseTimeMs: 150 },
      });

      const result = await searchService.searchItems(mockUserId, queryWithTags);

      expect(result.items[0].tags).toEqual([mockTags[0].tag]);
      expect(mockPrisma.itemTag.findMany).toHaveBeenCalledWith({
        where: { itemId: { in: ['item-1', 'item-2'] } },
        include: {
          tag: {
            select: { id: true, name: true, color: true },
          },
        },
      });
    });

    it('should handle empty search results', async () => {
      mockPrisma.$queryRaw.mockImplementation(async (query: any) => {
        const queryStr = query.strings[0];
        if (queryStr.includes('current_setting')) {
          return [{ current_setting: 'on' }];
        }
        if (queryStr.includes('ts_rank')) {
          return []; // No results
        }
        if (queryStr.includes('COUNT(*)')) {
          return [{ count: BigInt(0) }];
        }
        return [];
      });

      mockPrisma.searchUpdateQueue.count.mockResolvedValue(0);
      mockPrisma.searchAnalytics.aggregate.mockResolvedValue({
        _avg: { responseTimeMs: 50 },
      });

      const result = await searchService.searchItems(mockUserId, basicQuery);

      expect(result.items).toHaveLength(0);
      expect(result.totalCount).toBe(0);
      expect(result.hasMore).toBe(false);
      expect(mockPrisma.searchAnalytics.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          resultCount: 0,
        }),
      });
    });

    it('should validate household access', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.householdMember.findFirst.mockResolvedValue(null); // No access

      await expect(
        searchService.searchItems(mockUserId, basicQuery)
      ).rejects.toThrow('User does not have access to this household');
    });

    it('should sanitize search terms', async () => {
      const maliciousQuery: SearchQuery = {
        text: "'; DROP TABLE items; --",
        limit: 20,
        offset: 0,
      };

      mockPrisma.$queryRaw.mockImplementation(async (query: any) => {
        const queryStr = query.strings[0];
        if (queryStr.includes('current_setting')) {
          return [{ current_setting: 'on' }];
        }
        if (queryStr.includes('ts_rank')) {
          // Verify the malicious input is sanitized
          expect(query.values).not.toContain("'; DROP TABLE items; --");
          return [];
        }
        if (queryStr.includes('COUNT(*)')) {
          return [{ count: BigInt(0) }];
        }
        return [];
      });

      mockPrisma.searchUpdateQueue.count.mockResolvedValue(0);
      mockPrisma.searchAnalytics.aggregate.mockResolvedValue({
        _avg: { responseTimeMs: 50 },
      });

      const result = await searchService.searchItems(mockUserId, maliciousQuery);

      expect(result.items).toHaveLength(0);
    });

    it('should respect pagination parameters', async () => {
      const paginatedQuery: SearchQuery = {
        text: 'drill',
        limit: 1,
        offset: 1,
      };

      mockPrisma.$queryRaw.mockImplementation(async (query: any) => {
        const queryStr = query.strings[0];
        if (queryStr.includes('current_setting')) {
          return [{ current_setting: 'on' }];
        }
        if (queryStr.includes('ts_rank')) {
          // Verify LIMIT and OFFSET are applied
          expect(queryStr).toContain('LIMIT 1 OFFSET 1');
          return [mockSearchResults[1]]; // Second item
        }
        if (queryStr.includes('COUNT(*)')) {
          return [{ count: BigInt(2) }]; // Total count
        }
        return [];
      });

      mockPrisma.searchUpdateQueue.count.mockResolvedValue(0);
      mockPrisma.searchAnalytics.aggregate.mockResolvedValue({
        _avg: { responseTimeMs: 150 },
      });

      const result = await searchService.searchItems(mockUserId, paginatedQuery);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].name).toBe('Hammer');
      expect(result.totalCount).toBe(2);
      expect(result.hasMore).toBe(false); // offset 1 + limit 1 = 2, which equals totalCount
    });

    it('should handle database errors gracefully', async () => {
      mockPrisma.$queryRaw.mockRejectedValue(new Error('Database connection failed'));

      await expect(
        searchService.searchItems(mockUserId, basicQuery)
      ).rejects.toThrow('Database connection failed');
    });
  });

  describe('getSearchStatus', () => {
    it('should return search configuration and statistics', async () => {
      mockPrisma.$queryRaw.mockImplementation(async (query: any) => {
        const queryStr = query.strings[0];
        if (queryStr.includes('current_setting')) {
          return [{ current_setting: 'on' }]; // Extensions available
        }
        if (queryStr.includes('COUNT(*)')) {
          return [{ count: BigInt(100) }]; // Vector count
        }
        return [];
      });

      mockPrisma.searchUpdateQueue.count.mockResolvedValue(5);
      mockPrisma.searchAnalytics.aggregate.mockResolvedValue({
        _avg: { responseTimeMs: 250 },
      });

      const status = await searchService.getSearchStatus();

      expect(status.extensionsAvailable).toEqual({
        pg_trgm: true,
        unaccent: true,
        uuid_ossp: true,
      });
      expect(status.configuration).toEqual({
        useFullTextSearch: true,
        useTrigramSearch: true,
        useUnaccent: true,
      });
      expect(status.statistics).toEqual({
        indexedItems: 100,
        pendingUpdates: 5,
        avgResponseTime: 250,
      });
    });
  });
});