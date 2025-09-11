/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server';
import { GET, POST } from '@/app/api/v1/items/route';
import { GET as getItem, PATCH, DELETE } from '@/app/api/v1/items/[id]/route';
import { auth } from '@/lib/auth/config';

// Mock authentication
jest.mock('@/lib/auth/config', () => ({
  auth: jest.fn(),
}));

// Mock Prisma
jest.mock('@/lib/db', () => ({
  prisma: {
    $transaction: jest.fn(),
    item: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    location: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));

const mockAuth = auth as jest.MockedFunction<typeof auth>;

describe('Items API Routes', () => {
  const mockUser = {
    id: 'user-1',
    email: 'test@example.com',
    name: 'Test User',
  };

  const mockSession = {
    user: mockUser,
    expires: '2024-12-31',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.mockResolvedValue(mockSession);
  });

  describe('GET /api/v1/items', () => {
    it('should return 401 when not authenticated', async () => {
      mockAuth.mockResolvedValue(null);

      const request = new NextRequest('http://localhost:3000/api/v1/items');
      const response = await GET(request);

      expect(response.status).toBe(401);
      
      const data = await response.json();
      expect(data.error).toBe('UNAUTHORIZED');
    });

    it('should return items list when authenticated', async () => {
      const mockItems = [
        {
          id: 'item-1',
          name: 'Test Item 1',
          description: 'First test item',
          status: 'AVAILABLE',
          location: { name: 'Test Location', path: '/Test Location' },
        },
        {
          id: 'item-2',
          name: 'Test Item 2',
          description: 'Second test item',
          status: 'AVAILABLE',
          location: { name: 'Test Location', path: '/Test Location' },
        },
      ];

      // Mock the service to return items
      const { prisma } = require('@/lib/db');
      prisma.item.findMany.mockResolvedValue(mockItems);
      prisma.item.count.mockResolvedValue(2);

      const request = new NextRequest('http://localhost:3000/api/v1/items');
      const response = await GET(request);

      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(2);
      expect(data.data[0].name).toBe('Test Item 1');
    });

    it('should handle search parameters correctly', async () => {
      const { prisma } = require('@/lib/db');
      prisma.item.findMany.mockResolvedValue([]);
      prisma.item.count.mockResolvedValue(0);

      const request = new NextRequest(
        'http://localhost:3000/api/v1/items?q=test&status=AVAILABLE&page=2&limit=10'
      );
      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(prisma.item.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 10, // (page - 1) * limit
          take: 10,
          where: expect.objectContaining({
            householdId: 'household-1', // Mock household ID
            status: 'AVAILABLE',
          }),
        })
      );
    });

    it('should return 400 for invalid query parameters', async () => {
      const request = new NextRequest(
        'http://localhost:3000/api/v1/items?page=0&limit=101'
      );
      const response = await GET(request);

      expect(response.status).toBe(400);
      
      const data = await response.json();
      expect(data.error).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /api/v1/items', () => {
    const validItemData = {
      name: 'New Test Item',
      description: 'A new test item',
      locationId: '123e4567-e89b-12d3-a456-426614174000',
      quantity: 1,
      unit: 'piece',
    };

    it('should create item successfully', async () => {
      const mockLocation = {
        id: validItemData.locationId,
        name: 'Test Location',
        path: '/Test Location',
        householdId: 'household-1',
      };

      const mockCreatedItem = {
        id: 'new-item-1',
        ...validItemData,
        householdId: 'household-1',
        createdBy: mockUser.id,
        status: 'AVAILABLE',
        location: {
          name: mockLocation.name,
          path: mockLocation.path,
        },
      };

      const { prisma } = require('@/lib/db');
      prisma.$transaction.mockImplementation((callback: any) =>
        callback({
          location: {
            findUnique: jest.fn().mockResolvedValue(mockLocation),
            update: jest.fn(),
          },
          item: {
            create: jest.fn().mockResolvedValue(mockCreatedItem),
          },
        })
      );

      const request = new NextRequest('http://localhost:3000/api/v1/items', {
        method: 'POST',
        body: JSON.stringify(validItemData),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      expect(response.status).toBe(201);
      
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.name).toBe(validItemData.name);
    });

    it('should return 401 when not authenticated', async () => {
      mockAuth.mockResolvedValue(null);

      const request = new NextRequest('http://localhost:3000/api/v1/items', {
        method: 'POST',
        body: JSON.stringify(validItemData),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      expect(response.status).toBe(401);
    });

    it('should return 400 for invalid item data', async () => {
      const invalidData = {
        name: '', // Empty name
        locationId: 'invalid-uuid',
        quantity: -1,
      };

      const request = new NextRequest('http://localhost:3000/api/v1/items', {
        method: 'POST',
        body: JSON.stringify(invalidData),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      expect(response.status).toBe(400);
      
      const data = await response.json();
      expect(data.error).toBe('VALIDATION_ERROR');
    });

    it('should return 404 when location not found', async () => {
      const { prisma } = require('@/lib/db');
      prisma.$transaction.mockImplementation((callback: any) =>
        callback({
          location: {
            findUnique: jest.fn().mockResolvedValue(null),
          },
        })
      );

      const request = new NextRequest('http://localhost:3000/api/v1/items', {
        method: 'POST',
        body: JSON.stringify(validItemData),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await POST(request);
      expect(response.status).toBe(404);
    });
  });

  describe('GET /api/v1/items/[id]', () => {
    const itemId = 'item-1';
    const mockItem = {
      id: itemId,
      name: 'Test Item',
      description: 'A test item',
      status: 'AVAILABLE',
      location: { name: 'Test Location', path: '/Test Location' },
      photos: [],
      tags: [],
    };

    it('should return item details when found', async () => {
      const { prisma } = require('@/lib/db');
      prisma.item.findUnique.mockResolvedValue(mockItem);

      const request = new NextRequest(`http://localhost:3000/api/v1/items/${itemId}`);
      const response = await getItem(request, { params: { id: itemId } });

      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.name).toBe('Test Item');
    });

    it('should return 404 when item not found', async () => {
      const { prisma } = require('@/lib/db');
      prisma.item.findUnique.mockResolvedValue(null);

      const request = new NextRequest(`http://localhost:3000/api/v1/items/${itemId}`);
      const response = await getItem(request, { params: { id: itemId } });

      expect(response.status).toBe(404);
      
      const data = await response.json();
      expect(data.error).toBe('ITEM_NOT_FOUND');
    });

    it('should return 401 when not authenticated', async () => {
      mockAuth.mockResolvedValue(null);

      const request = new NextRequest(`http://localhost:3000/api/v1/items/${itemId}`);
      const response = await getItem(request, { params: { id: itemId } });

      expect(response.status).toBe(401);
    });
  });

  describe('PATCH /api/v1/items/[id]', () => {
    const itemId = 'item-1';
    const updateData = {
      name: 'Updated Item',
      description: 'Updated description',
    };

    it('should update item successfully', async () => {
      const mockExistingItem = {
        id: itemId,
        householdId: 'household-1',
        createdBy: mockUser.id,
        name: 'Original Item',
      };

      const mockUpdatedItem = {
        ...mockExistingItem,
        ...updateData,
        location: { name: 'Test Location', path: '/Test Location' },
      };

      const { prisma } = require('@/lib/db');
      prisma.$transaction.mockImplementation((callback: any) =>
        callback({
          item: {
            findUnique: jest.fn().mockResolvedValue(mockExistingItem),
            update: jest.fn().mockResolvedValue(mockUpdatedItem),
          },
          location: {
            findUnique: jest.fn(),
            update: jest.fn(),
          },
        })
      );

      const request = new NextRequest(`http://localhost:3000/api/v1/items/${itemId}`, {
        method: 'PATCH',
        body: JSON.stringify(updateData),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await PATCH(request, { params: { id: itemId } });
      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.name).toBe('Updated Item');
    });

    it('should return 404 when item not found', async () => {
      const { prisma } = require('@/lib/db');
      prisma.$transaction.mockImplementation((callback: any) =>
        callback({
          item: {
            findUnique: jest.fn().mockResolvedValue(null),
          },
        })
      );

      const request = new NextRequest(`http://localhost:3000/api/v1/items/${itemId}`, {
        method: 'PATCH',
        body: JSON.stringify(updateData),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await PATCH(request, { params: { id: itemId } });
      expect(response.status).toBe(404);
    });

    it('should return 400 for invalid update data', async () => {
      const invalidUpdateData = {
        name: '', // Empty name
        quantity: -1, // Invalid quantity
      };

      const request = new NextRequest(`http://localhost:3000/api/v1/items/${itemId}`, {
        method: 'PATCH',
        body: JSON.stringify(invalidUpdateData),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await PATCH(request, { params: { id: itemId } });
      expect(response.status).toBe(400);
    });
  });

  describe('DELETE /api/v1/items/[id]', () => {
    const itemId = 'item-1';

    it('should delete item successfully', async () => {
      const mockItem = {
        id: itemId,
        householdId: 'household-1',
        createdBy: mockUser.id,
        status: 'AVAILABLE',
      };

      const { prisma } = require('@/lib/db');
      prisma.$transaction.mockImplementation((callback: any) =>
        callback({
          item: {
            findUnique: jest.fn().mockResolvedValue(mockItem),
            delete: jest.fn().mockResolvedValue(mockItem),
          },
          location: {
            update: jest.fn(),
          },
        })
      );

      const request = new NextRequest(`http://localhost:3000/api/v1/items/${itemId}`, {
        method: 'DELETE',
      });

      const response = await DELETE(request, { params: { id: itemId } });
      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.message).toBe('Item deleted successfully');
    });

    it('should return 404 when item not found', async () => {
      const { prisma } = require('@/lib/db');
      prisma.$transaction.mockImplementation((callback: any) =>
        callback({
          item: {
            findUnique: jest.fn().mockResolvedValue(null),
          },
        })
      );

      const request = new NextRequest(`http://localhost:3000/api/v1/items/${itemId}`, {
        method: 'DELETE',
      });

      const response = await DELETE(request, { params: { id: itemId } });
      expect(response.status).toBe(404);
    });

    it('should return 409 when trying to delete borrowed item', async () => {
      const borrowedItem = {
        id: itemId,
        householdId: 'household-1',
        createdBy: mockUser.id,
        status: 'BORROWED',
        borrowedBy: 'other-user',
      };

      const { prisma } = require('@/lib/db');
      prisma.$transaction.mockImplementation(() => {
        throw new Error('Cannot delete borrowed item');
      });

      const request = new NextRequest(`http://localhost:3000/api/v1/items/${itemId}`, {
        method: 'DELETE',
      });

      const response = await DELETE(request, { params: { id: itemId } });
      expect(response.status).toBe(409);
    });
  });
});