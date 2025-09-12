/**
 * @jest-environment node
 * 
 * Simplified SearchService unit tests focusing on core functionality
 * and fallback scenarios as required by QA.
 */

import { SearchService } from '@/lib/services/search';
import { prisma } from '@/lib/db';
import type { SearchQuery } from '@/lib/types/search';

// Mock Prisma
jest.mock('@/lib/db', () => ({
  prisma: {
    $queryRaw: jest.fn(),
    item: { findMany: jest.fn() },
    itemPhoto: { findMany: jest.fn() },
    itemTag: { findMany: jest.fn() },
    searchAnalytics: { create: jest.fn(), aggregate: jest.fn() },
    searchUpdateQueue: { count: jest.fn() },
    user: { findUnique: jest.fn() },
    householdMember: { findFirst: jest.fn() },
  },
}));

// Mock extensions module
jest.mock('@/lib/db/extensions', () => ({
  checkExtensionAvailability: jest.fn(),
  getSearchConfiguration: jest.fn(),
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const { checkExtensionAvailability, getSearchConfiguration } = require('@/lib/db/extensions');

// Test data
const mockUser = {
  id: 'user-123',
  email: 'test@example.com',
  name: 'Test User',
  defaultHouseholdId: 'household-123',
};

const mockHouseholdMember = {
  id: 'member-123',
  userId: 'user-123',
  householdId: 'household-123',
  role: 'member',
  permissions: {},
  household: { id: 'household-123', name: 'Test Household' },
};

const mockSearchResults = [
  {
    id: 'item-1',
    name: 'Power Drill',
    description: 'Cordless power drill',
    quantity: 1,
    unit: 'piece',
    status: 'AVAILABLE',
    currentValue: 150,
    createdAt: new Date(),
    updatedAt: new Date(),
    relevance_score: 0.8,
  },
];

describe('SearchService Core Functionality', () => {
  let searchService: SearchService;
  const basicQuery: SearchQuery = {
    text: 'drill',
    limit: 20,
    offset: 0,
  };

  beforeEach(() => {
    searchService = new SearchService(mockPrisma);
    jest.clearAllMocks();

    // Default mocks
    mockPrisma.user.findUnique.mockResolvedValue(mockUser);
    mockPrisma.householdMember.findFirst.mockResolvedValue(mockHouseholdMember);
    mockPrisma.searchAnalytics.create.mockResolvedValue({} as any);
    mockPrisma.searchUpdateQueue.count.mockResolvedValue(0);
    mockPrisma.searchAnalytics.aggregate.mockResolvedValue({
      _avg: { responseTimeMs: 150 },
    });

    // Extension mocks
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

  describe('Full-Text Search', () => {
    it('should use full-text search when extensions are available', async () => {
      mockPrisma.$queryRaw.mockResolvedValue(mockSearchResults);

      const result = await searchService.searchItems('user-123', basicQuery);

      expect(result.searchMethod).toBe('full_text_search');
      expect(result.items).toHaveLength(1);
      expect(result.items[0].name).toBe('Power Drill');
      expect(mockPrisma.searchAnalytics.create).toHaveBeenCalled();
    });

    it('should fallback to trigram when full-text search fails', async () => {
      // Mock full-text search to fail, trigram to succeed
      checkExtensionAvailability.mockResolvedValue({
        pg_trgm: true,
        unaccent: true,
        uuid_ossp: true,
      });

      getSearchConfiguration.mockResolvedValue({
        useFullTextSearch: false, // FTS disabled
        useTrigramSearch: true,
        useUnaccent: true,
      });

      mockPrisma.$queryRaw.mockResolvedValue(mockSearchResults);

      const result = await searchService.searchItems('user-123', basicQuery);

      expect(result.searchMethod).toBe('trigram_search');
      expect(result.items).toHaveLength(1);
    });

    it('should fallback to ILIKE when all advanced search fails', async () => {
      // Mock no extensions available
      checkExtensionAvailability.mockResolvedValue({
        pg_trgm: false,
        unaccent: false,
        uuid_ossp: false,
      });

      getSearchConfiguration.mockResolvedValue({
        useFullTextSearch: false,
        useTrigramSearch: false,
        useUnaccent: false,
      });

      mockPrisma.item.findMany.mockResolvedValue(
        mockSearchResults.map(item => ({
          ...item,
          currentValue: { toNumber: () => item.currentValue },
        })) as any
      );

      const result = await searchService.searchItems('user-123', basicQuery);

      expect(result.searchMethod).toBe('ilike_fallback');
      expect(result.items).toHaveLength(1);
      expect(mockPrisma.item.findMany).toHaveBeenCalled();
    });
  });

  describe('Data Enrichment', () => {
    it('should include photos when requested', async () => {
      mockPrisma.$queryRaw.mockResolvedValue(mockSearchResults);
      mockPrisma.itemPhoto.findMany.mockResolvedValue([
        {
          id: 'photo-1',
          itemId: 'item-1',
          thumbnailUrl: '/thumb.jpg',
          isPrimary: true,
          displayOrder: 0,
        },
      ] as any);
      mockPrisma.itemTag.findMany.mockResolvedValue([]);

      const queryWithPhotos: SearchQuery = { ...basicQuery, includePhotos: true };
      const result = await searchService.searchItems('user-123', queryWithPhotos);

      expect(result.items[0].photos).toBeDefined();
      expect(result.items[0].photos).toHaveLength(1);
    });

    it('should include tags when requested', async () => {
      mockPrisma.$queryRaw.mockResolvedValue(mockSearchResults);
      mockPrisma.itemPhoto.findMany.mockResolvedValue([]);
      mockPrisma.itemTag.findMany.mockResolvedValue([
        {
          itemId: 'item-1',
          tag: {
            id: 'tag-1',
            name: 'Tools',
            color: '#FF0000',
          },
        },
      ] as any);

      const queryWithTags: SearchQuery = { ...basicQuery, includeTags: true };
      const result = await searchService.searchItems('user-123', queryWithTags);

      expect(result.items[0].tags).toBeDefined();
      expect(result.items[0].tags).toHaveLength(1);
      expect(result.items[0].tags![0].name).toBe('Tools');
    });
  });

  describe('Security & Validation', () => {
    it('should validate household access', async () => {
      mockPrisma.householdMember.findFirst.mockResolvedValue(null);

      await expect(
        searchService.searchItems('user-123', basicQuery)
      ).rejects.toThrow();
    });

    it('should handle empty search results', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);

      const result = await searchService.searchItems('user-123', basicQuery);

      expect(result.items).toHaveLength(0);
      expect(result.totalCount).toBe(0);
      expect(result.hasMore).toBe(false);
    });

    it('should respect pagination limits', async () => {
      const paginatedQuery: SearchQuery = { ...basicQuery, limit: 1, offset: 0 };
      mockPrisma.$queryRaw.mockResolvedValue(mockSearchResults.slice(0, 1));

      const result = await searchService.searchItems('user-123', paginatedQuery);

      expect(result.items).toHaveLength(1);
    });
  });

  describe('Error Handling', () => {
    it('should handle database connection errors', async () => {
      mockPrisma.$queryRaw.mockRejectedValue(new Error('Database connection failed'));

      await expect(
        searchService.searchItems('user-123', basicQuery)
      ).rejects.toThrow();
    });

    it('should log search analytics on success', async () => {
      mockPrisma.$queryRaw.mockResolvedValue(mockSearchResults);

      await searchService.searchItems('user-123', basicQuery);

      expect(mockPrisma.searchAnalytics.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          householdId: 'household-123',
          queryLength: 5,
          resultCount: 1,
          searchMethod: 'FULL_TEXT_SEARCH',
        }),
      });
    });
  });

  describe('Extension Status', () => {
    it('should return search configuration status', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ count: BigInt(100) }]);

      const status = await searchService.getSearchStatus();

      expect(status).toHaveProperty('extensionsAvailable');
      expect(status).toHaveProperty('configuration');
      expect(status).toHaveProperty('statistics');
      expect(status.extensionsAvailable).toEqual({
        pg_trgm: true,
        unaccent: true,
        uuid_ossp: true,
      });
    });
  });
});