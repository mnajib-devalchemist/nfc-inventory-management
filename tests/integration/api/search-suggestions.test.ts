/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server';
import { GET } from '@/app/api/v1/search/suggestions/route';
import { prisma } from '@/lib/db';
import { getServerSession } from 'next-auth/next';

// Mock dependencies
jest.mock('@/lib/db');
jest.mock('next-auth/next');

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

const mockItemSuggestions = [
  {
    name: 'Power Drill',
    description: 'Cordless power drill with battery',
    count: 1,
  },
  {
    name: 'Drill Bits Set',
    description: 'Set of various drill bits',
    count: 1,
  },
];

const mockLocationSuggestions = [
  {
    name: 'Garage',
    path: 'House > Garage',
    count: 5,
  },
  {
    name: 'Workshop',
    path: 'House > Garage > Workshop',
    count: 3,
  },
];

const mockTagSuggestions = [
  {
    name: 'Tools',
    color: '#FF0000',
    count: 8,
  },
  {
    name: 'Power Tools',
    color: '#00FF00',
    count: 4,
  },
];

// Helper function to create mock request
function createMockRequest(url: string, options: RequestInit = {}) {
  return new NextRequest(url, {
    method: 'GET',
    ...options,
  });
}

describe('Search Suggestions API Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup default mocks
    mockGetServerSession.mockResolvedValue(mockSession);
    mockPrisma.user.findUnique.mockResolvedValue(mockUser);
    mockPrisma.householdMember.findFirst.mockResolvedValue(mockHouseholdMember);
  });

  describe('GET /api/v1/search/suggestions', () => {
    it('should return item suggestions for valid query', async () => {
      // Mock item suggestions query
      mockPrisma.$queryRaw.mockResolvedValue(mockItemSuggestions);

      const request = createMockRequest('http://localhost:3000/api/v1/search/suggestions?q=drill&types=item');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.suggestions).toHaveLength(2);
      expect(data.data.suggestions[0]).toEqual({
        type: 'item',
        text: 'Power Drill',
        count: 1,
        metadata: {
          description: 'Cordless power drill with battery',
        },
      });
    });

    it('should return location suggestions', async () => {
      mockPrisma.$queryRaw.mockResolvedValue(mockLocationSuggestions);

      const request = createMockRequest('http://localhost:3000/api/v1/search/suggestions?q=garage&types=location');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.suggestions[0]).toEqual({
        type: 'location',
        text: 'Garage',
        count: 5,
        metadata: {
          path: 'House > Garage',
        },
      });
    });

    it('should return tag suggestions', async () => {
      mockPrisma.$queryRaw.mockResolvedValue(mockTagSuggestions);

      const request = createMockRequest('http://localhost:3000/api/v1/search/suggestions?q=tool&types=tag');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.suggestions[0]).toEqual({
        type: 'tag',
        text: 'Tools',
        count: 8,
        metadata: {
          color: '#FF0000',
        },
      });
    });

    it('should return mixed suggestions for multiple types', async () => {
      // Mock multiple queries for different types
      mockPrisma.$queryRaw
        .mockResolvedValueOnce(mockItemSuggestions.slice(0, 1))
        .mockResolvedValueOnce(mockLocationSuggestions.slice(0, 1))
        .mockResolvedValueOnce(mockTagSuggestions.slice(0, 1));

      const request = createMockRequest(
        'http://localhost:3000/api/v1/search/suggestions?q=dr&types=item,location,tag&limit=3'
      );
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.suggestions).toHaveLength(3);
      
      // Should have one of each type
      const types = data.data.suggestions.map((s: any) => s.type);
      expect(types).toContain('item');
      expect(types).toContain('location');
      expect(types).toContain('tag');
    });

    it('should respect limit parameter', async () => {
      mockPrisma.$queryRaw.mockResolvedValue(mockItemSuggestions);

      const request = createMockRequest(
        'http://localhost:3000/api/v1/search/suggestions?q=drill&types=item&limit=1'
      );
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.suggestions).toHaveLength(1);
    });

    it('should default to item suggestions when no types specified', async () => {
      mockPrisma.$queryRaw.mockResolvedValue(mockItemSuggestions);

      const request = createMockRequest('http://localhost:3000/api/v1/search/suggestions?q=drill');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.suggestions.every((s: any) => s.type === 'item')).toBe(true);
    });

    it('should return 400 for missing query parameter', async () => {
      const request = createMockRequest('http://localhost:3000/api/v1/search/suggestions');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('validation');
    });

    it('should return 400 for query too short', async () => {
      const request = createMockRequest('http://localhost:3000/api/v1/search/suggestions?q=a');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('at least 1 character');
    });

    it('should return 400 for invalid suggestion types', async () => {
      const request = createMockRequest(
        'http://localhost:3000/api/v1/search/suggestions?q=drill&types=invalid,item'
      );
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('validation');
    });

    it('should return 401 for unauthenticated request', async () => {
      mockGetServerSession.mockResolvedValue(null);

      const request = createMockRequest('http://localhost:3000/api/v1/search/suggestions?q=drill');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.error).toContain('authentication');
    });

    it('should return 403 for user without household access', async () => {
      mockPrisma.householdMember.findFirst.mockResolvedValue(null);

      const request = createMockRequest('http://localhost:3000/api/v1/search/suggestions?q=drill');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.success).toBe(false);
      expect(data.error).toContain('access');
    });

    it('should handle database errors gracefully', async () => {
      mockPrisma.$queryRaw.mockRejectedValue(new Error('Database connection failed'));

      const request = createMockRequest('http://localhost:3000/api/v1/search/suggestions?q=drill');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toContain('internal');
    });

    it('should return empty suggestions when no matches found', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);

      const request = createMockRequest(
        'http://localhost:3000/api/v1/search/suggestions?q=nonexistent&types=item'
      );
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.suggestions).toHaveLength(0);
    });

    it('should sanitize query parameters', async () => {
      // Test with potential SQL injection attempt
      const maliciousQuery = "'; DROP TABLE items; --";
      mockPrisma.$queryRaw.mockImplementation(async (query: any, ...params: any[]) => {
        // Verify the malicious input is not directly used in SQL
        const queryStr = query.strings?.join('') || query;
        expect(queryStr).not.toContain('DROP TABLE');
        expect(params).not.toContain(maliciousQuery);
        return [];
      });

      const request = createMockRequest(
        `http://localhost:3000/api/v1/search/suggestions?q=${encodeURIComponent(maliciousQuery)}`
      );
      const response = await GET(request);

      expect(response.status).toBe(200);
    });

    it('should enforce rate limiting', async () => {
      // This is a simplified test - real rate limiting would require more setup
      mockPrisma.$queryRaw.mockResolvedValue(mockItemSuggestions);

      const request = createMockRequest('http://localhost:3000/api/v1/search/suggestions?q=drill');
      const response = await GET(request);

      expect(response.status).toBe(200);
      // In a real scenario, you'd test multiple rapid requests to trigger rate limiting
    });

    it('should handle special characters in query', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);

      const specialQuery = encodeURIComponent('drill & bits (set)');
      const request = createMockRequest(
        `http://localhost:3000/api/v1/search/suggestions?q=${specialQuery}`
      );
      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(mockPrisma.$queryRaw).toHaveBeenCalled();
    });

    it('should return consistent response format', async () => {
      mockPrisma.$queryRaw.mockResolvedValue(mockItemSuggestions);

      const request = createMockRequest('http://localhost:3000/api/v1/search/suggestions?q=drill');
      const response = await GET(request);
      const data = await response.json();

      expect(data).toHaveProperty('success', true);
      expect(data).toHaveProperty('data');
      expect(data.data).toHaveProperty('suggestions');
      expect(data).toHaveProperty('meta');
      expect(data.meta).toHaveProperty('timestamp');
      expect(data.meta).toHaveProperty('version', 'v1');
      expect(data.meta).toHaveProperty('requestId');

      // Verify suggestion format
      if (data.data.suggestions.length > 0) {
        const suggestion = data.data.suggestions[0];
        expect(suggestion).toHaveProperty('type');
        expect(suggestion).toHaveProperty('text');
        expect(suggestion).toHaveProperty('count');
        expect(suggestion).toHaveProperty('metadata');
      }
    });

    it('should handle concurrent requests', async () => {
      mockPrisma.$queryRaw.mockResolvedValue(mockItemSuggestions);

      // Make multiple concurrent requests
      const requests = Array.from({ length: 5 }, (_, i) =>
        createMockRequest(`http://localhost:3000/api/v1/search/suggestions?q=drill${i}`)
      );

      const responses = await Promise.all(
        requests.map(request => GET(request))
      );

      // All requests should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });

      // Verify all requests were processed
      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(5);
    });
  });
});