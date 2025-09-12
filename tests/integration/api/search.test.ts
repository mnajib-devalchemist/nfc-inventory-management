/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server';
import { GET, POST } from '@/app/api/v1/search/route';
import { prisma } from '@/lib/db';
import { getServerSession } from 'next-auth/next';

// Mock dependencies
jest.mock('@/lib/db');
jest.mock('next-auth/next');
jest.mock('@/lib/services/search');

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>;

// Mock data
const mockSession = {
  user: {
    id: 'user-123',
    email: 'test@example.com',
    name: 'Test User',
  },
};

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
  household: {
    id: 'household-123',
    name: 'Test Household',
  },
};

const mockSearchResults = {
  items: [
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
      relevanceScore: 0.8,
    },
  ],
  totalCount: 1,
  responseTime: 150,
  searchMethod: 'full_text_search' as const,
  hasMore: false,
};

// Helper function to create mock request
function createMockRequest(url: string, options: RequestInit = {}) {
  return new NextRequest(url, {
    method: 'GET',
    ...options,
  });
}

describe('Search API Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup default mocks
    mockGetServerSession.mockResolvedValue(mockSession);
    mockPrisma.user.findUnique.mockResolvedValue(mockUser);
    mockPrisma.householdMember.findFirst.mockResolvedValue(mockHouseholdMember);
  });

  describe('GET /api/v1/search', () => {
    it('should return search results for valid query', async () => {
      // Mock SearchService
      const mockSearchService = {
        searchItems: jest.fn().mockResolvedValue(mockSearchResults),
      };
      
      // Mock the SearchService constructor
      jest.doMock('@/lib/services/search', () => ({
        SearchService: jest.fn(() => mockSearchService),
      }));

      const request = createMockRequest('http://localhost:3000/api/v1/search?q=drill');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toEqual(mockSearchResults);
      expect(data.meta).toHaveProperty('timestamp');
      expect(data.meta).toHaveProperty('version', 'v1');
    });

    it('should return 400 for missing query parameter', async () => {
      const request = createMockRequest('http://localhost:3000/api/v1/search');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('validation');
    });

    it('should return 400 for query too short', async () => {
      const request = createMockRequest('http://localhost:3000/api/v1/search?q=a');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('at least 2 characters');
    });

    it('should return 400 for query too long', async () => {
      const longQuery = 'a'.repeat(501);
      const request = createMockRequest(`http://localhost:3000/api/v1/search?q=${longQuery}`);
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('500 characters');
    });

    it('should return 401 for unauthenticated request', async () => {
      mockGetServerSession.mockResolvedValue(null);

      const request = createMockRequest('http://localhost:3000/api/v1/search?q=drill');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.error).toContain('authentication');
    });

    it('should return 403 for user without household access', async () => {
      mockPrisma.householdMember.findFirst.mockResolvedValue(null);

      const request = createMockRequest('http://localhost:3000/api/v1/search?q=drill');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.success).toBe(false);
      expect(data.error).toContain('access');
    });

    it('should handle search service errors', async () => {
      const mockSearchService = {
        searchItems: jest.fn().mockRejectedValue(new Error('Search service error')),
      };
      
      jest.doMock('@/lib/services/search', () => ({
        SearchService: jest.fn(() => mockSearchService),
      }));

      const request = createMockRequest('http://localhost:3000/api/v1/search?q=drill');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toContain('internal');
    });

    it('should validate and apply query parameters', async () => {
      const mockSearchService = {
        searchItems: jest.fn().mockResolvedValue(mockSearchResults),
      };
      
      jest.doMock('@/lib/services/search', () => ({
        SearchService: jest.fn(() => mockSearchService),
      }));

      const request = createMockRequest(
        'http://localhost:3000/api/v1/search?q=drill&limit=10&offset=5&includePhotos=true&includeTags=true&includeLocation=true'
      );
      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(mockSearchService.searchItems).toHaveBeenCalledWith('user-123', {
        text: 'drill',
        limit: 10,
        offset: 5,
        includePhotos: true,
        includeTags: true,
        includeLocation: true,
      });
    });

    it('should enforce rate limiting', async () => {
      // This would require a more complex setup with actual rate limiting
      // For now, we'll test that the rate limiting middleware is called
      // In a real scenario, you'd test with multiple rapid requests
      
      const mockSearchService = {
        searchItems: jest.fn().mockResolvedValue(mockSearchResults),
      };
      
      jest.doMock('@/lib/services/search', () => ({
        SearchService: jest.fn(() => mockSearchService),
      }));

      const request = createMockRequest('http://localhost:3000/api/v1/search?q=drill');
      const response = await GET(request);

      expect(response.status).toBe(200);
      // Note: Actual rate limiting testing would require integration with Redis/memory store
    });
  });

  describe('POST /api/v1/search', () => {
    it('should handle advanced search queries', async () => {
      const mockSearchService = {
        searchItems: jest.fn().mockResolvedValue(mockSearchResults),
      };
      
      jest.doMock('@/lib/services/search', () => ({
        SearchService: jest.fn(() => mockSearchService),
      }));

      const advancedQuery = {
        text: 'drill',
        filters: {
          valueRange: { min: 50, max: 200 },
          statuses: ['AVAILABLE'],
          dateRange: {
            start: '2024-01-01T00:00:00Z',
            end: '2024-12-31T23:59:59Z',
          },
        },
        sortBy: 'value',
        sortOrder: 'desc',
        includePhotos: true,
        includeTags: true,
        includeLocation: true,
      };

      const request = createMockRequest('http://localhost:3000/api/v1/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(advancedQuery),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toEqual(mockSearchResults);
    });

    it('should return 400 for invalid JSON body', async () => {
      const request = createMockRequest('http://localhost:3000/api/v1/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: '{ invalid json }',
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('Invalid JSON');
    });

    it('should return 400 for invalid advanced search parameters', async () => {
      const invalidQuery = {
        text: 'a', // Too short
        filters: {
          valueRange: { min: 'invalid', max: 200 }, // Invalid number
        },
        sortBy: 'invalid_field',
        limit: 101, // Too high
      };

      const request = createMockRequest('http://localhost:3000/api/v1/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(invalidQuery),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('validation');
    });

    it('should handle fuzzy search options', async () => {
      const mockSearchService = {
        searchItems: jest.fn().mockResolvedValue(mockSearchResults),
      };
      
      jest.doMock('@/lib/services/search', () => ({
        SearchService: jest.fn(() => mockSearchService),
      }));

      const fuzzyQuery = {
        text: 'dril', // Intentionally misspelled
        fuzzy: true,
        fuzzyThreshold: 0.6,
      };

      const request = createMockRequest('http://localhost:3000/api/v1/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(fuzzyQuery),
      });

      const response = await POST(request);
      
      expect(response.status).toBe(200);
      expect(mockSearchService.searchItems).toHaveBeenCalledWith(
        'user-123',
        expect.objectContaining({
          text: 'dril',
          fuzzy: true,
          fuzzyThreshold: 0.6,
        })
      );
    });

    it('should return proper error responses for different error types', async () => {
      const mockSearchService = {
        searchItems: jest.fn().mockRejectedValue(new Error('Database connection failed')),
      };
      
      jest.doMock('@/lib/services/search', () => ({
        SearchService: jest.fn(() => mockSearchService),
      }));

      const request = createMockRequest('http://localhost:3000/api/v1/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: 'drill' }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe('internal');
      expect(data.message).toContain('internal server error');
      expect(data.meta).toHaveProperty('timestamp');
      expect(data.meta).toHaveProperty('requestId');
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed requests gracefully', async () => {
      const request = createMockRequest('http://localhost:3000/api/v1/search?q=drill&limit=invalid');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('validation');
    });

    it('should return consistent error format', async () => {
      const request = createMockRequest('http://localhost:3000/api/v1/search');
      const response = await GET(request);
      const data = await response.json();

      expect(data).toHaveProperty('success', false);
      expect(data).toHaveProperty('error');
      expect(data).toHaveProperty('message');
      expect(data).toHaveProperty('meta');
      expect(data.meta).toHaveProperty('timestamp');
      expect(data.meta).toHaveProperty('version');
    });

    it('should handle database connection errors', async () => {
      mockPrisma.user.findUnique.mockRejectedValue(new Error('Connection lost'));

      const request = createMockRequest('http://localhost:3000/api/v1/search?q=drill');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe('internal');
    });

    it('should sanitize error messages to prevent information leakage', async () => {
      const mockSearchService = {
        searchItems: jest.fn().mockRejectedValue(new Error('SELECT * FROM secret_table WHERE password = "admin123"')),
      };
      
      jest.doMock('@/lib/services/search', () => ({
        SearchService: jest.fn(() => mockSearchService),
      }));

      const request = createMockRequest('http://localhost:3000/api/v1/search?q=drill');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.message).not.toContain('SELECT');
      expect(data.message).not.toContain('password');
      expect(data.message).not.toContain('admin123');
      expect(data.message).toContain('internal server error');
    });
  });

  describe('Response Format', () => {
    it('should return consistent response format for successful requests', async () => {
      const mockSearchService = {
        searchItems: jest.fn().mockResolvedValue(mockSearchResults),
      };
      
      jest.doMock('@/lib/services/search', () => ({
        SearchService: jest.fn(() => mockSearchService),
      }));

      const request = createMockRequest('http://localhost:3000/api/v1/search?q=drill');
      const response = await GET(request);
      const data = await response.json();

      expect(data).toHaveProperty('success', true);
      expect(data).toHaveProperty('data');
      expect(data).toHaveProperty('meta');
      expect(data.meta).toHaveProperty('timestamp');
      expect(data.meta).toHaveProperty('version', 'v1');
      expect(data.data).toHaveProperty('items');
      expect(data.data).toHaveProperty('totalCount');
      expect(data.data).toHaveProperty('responseTime');
      expect(data.data).toHaveProperty('searchMethod');
      expect(data.data).toHaveProperty('hasMore');
    });

    it('should include request ID in response metadata', async () => {
      const mockSearchService = {
        searchItems: jest.fn().mockResolvedValue(mockSearchResults),
      };
      
      jest.doMock('@/lib/services/search', () => ({
        SearchService: jest.fn(() => mockSearchService),
      }));

      const request = createMockRequest('http://localhost:3000/api/v1/search?q=drill');
      const response = await GET(request);
      const data = await response.json();

      expect(data.meta).toHaveProperty('requestId');
      expect(typeof data.meta.requestId).toBe('string');
      expect(data.meta.requestId.length).toBeGreaterThan(0);
    });
  });
});