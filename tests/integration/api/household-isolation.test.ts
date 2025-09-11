/**
 * Household Isolation Security Tests
 * 
 * Critical security tests to prevent cross-household data access vulnerabilities.
 * These tests validate that users can only access data from their own households
 * and that proper authorization is enforced at the API level.
 * 
 * @category Security Tests
 * @category Integration Tests
 * @since 1.0.0
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth/config';
import { GET as getItems, POST as createItem } from '@/app/api/v1/items/route';
import { GET as getItem } from '@/app/api/v1/items/[id]/route';
import { GET as getLocations, POST as createLocation } from '@/app/api/v1/locations/route';
import { prisma } from '@/lib/db';
import { createTestUser, createTestItem, createTestLocation, createTestSession } from '../helpers/test-helpers';

// Mock NextAuth for testing
jest.mock('@/lib/auth/config');
const mockAuth = auth as jest.MockedFunction<typeof auth>;

describe('Household Isolation Security', () => {
  let household1Id: string;
  let household2Id: string;
  let user1Id: string;
  let user2Id: string;
  let item1Id: string;
  let item2Id: string;
  let location1Id: string;
  let location2Id: string;

  beforeAll(async () => {
    // Create test households
    const household1 = await prisma.household.create({
      data: { name: 'Test Household 1' }
    });
    household1Id = household1.id;

    const household2 = await prisma.household.create({
      data: { name: 'Test Household 2' }
    });
    household2Id = household2.id;

    // Create test users
    const user1 = await prisma.user.create({
      data: {
        email: 'user1@test.com',
        name: 'User 1',
        defaultHouseholdId: household1Id,
      }
    });
    user1Id = user1.id;

    const user2 = await prisma.user.create({
      data: {
        email: 'user2@test.com',
        name: 'User 2',
        defaultHouseholdId: household2Id,
      }
    });
    user2Id = user2.id;

    // Create household memberships
    await prisma.householdMember.create({
      data: {
        userId: user1Id,
        householdId: household1Id,
        role: 'admin'
      }
    });

    await prisma.householdMember.create({
      data: {
        userId: user2Id,
        householdId: household2Id,
        role: 'admin'
      }
    });

    // Create test locations
    const location1 = await prisma.location.create({
      data: {
        householdId: household1Id,
        name: 'Test Location 1',
        path: 'Test Location 1',
        level: 0
      }
    });
    location1Id = location1.id;

    const location2 = await prisma.location.create({
      data: {
        householdId: household2Id,
        name: 'Test Location 2',
        path: 'Test Location 2',
        level: 0
      }
    });
    location2Id = location2.id;

    // Create test items
    const item1 = await prisma.item.create({
      data: {
        householdId: household1Id,
        locationId: location1Id,
        name: 'Test Item 1',
        createdBy: user1Id,
      }
    });
    item1Id = item1.id;

    const item2 = await prisma.item.create({
      data: {
        householdId: household2Id,
        locationId: location2Id,
        name: 'Test Item 2',
        createdBy: user2Id,
      }
    });
    item2Id = item2.id;
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.item.deleteMany({
      where: { OR: [{ id: item1Id }, { id: item2Id }] }
    });
    await prisma.location.deleteMany({
      where: { OR: [{ id: location1Id }, { id: location2Id }] }
    });
    await prisma.householdMember.deleteMany({
      where: { OR: [{ userId: user1Id }, { userId: user2Id }] }
    });
    await prisma.user.deleteMany({
      where: { OR: [{ id: user1Id }, { id: user2Id }] }
    });
    await prisma.household.deleteMany({
      where: { OR: [{ id: household1Id }, { id: household2Id }] }
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Items API Household Isolation', () => {
    it('should prevent cross-household item access in GET /api/v1/items', async () => {
      // Given: User A (household1) is authenticated
      mockAuth.mockResolvedValue({
        user: { 
          id: user1Id, 
          householdId: household1Id,
          email: 'user1@test.com',
          name: 'User 1'
        }
      } as any);

      // When: User A tries to list items (should only see household1 items)
      const request = new NextRequest('http://localhost:3000/api/v1/items');
      const response = await getItems(request);
      const data = await response.json();

      // Then: Only items from household1 should be returned
      expect(response.status).toBe(200);
      expect(data.data).toBeDefined();
      expect(Array.isArray(data.data)).toBe(true);
      
      // Verify no cross-household data leakage
      const itemIds = data.data.map((item: any) => item.id);
      expect(itemIds).toContain(item1Id);
      expect(itemIds).not.toContain(item2Id);
    });

    it('should prevent access to items from different household via GET /api/v1/items/[id]', async () => {
      // Given: User A (household1) is authenticated
      mockAuth.mockResolvedValue({
        user: { 
          id: user1Id, 
          householdId: household1Id,
          email: 'user1@test.com',
          name: 'User 1'
        }
      } as any);

      // When: User A tries to access item from household2
      const request = new NextRequest(`http://localhost:3000/api/v1/items/${item2Id}`);
      const context = { params: { id: item2Id } };
      const response = await getItem(request, context);
      const data = await response.json();

      // Then: Access should be denied (item not found in user's household)
      expect(response.status).toBe(404);
      expect(data.error).toBeDefined();
    });

    it('should allow access to items from same household', async () => {
      // Given: User A (household1) is authenticated
      mockAuth.mockResolvedValue({
        user: { 
          id: user1Id, 
          householdId: household1Id,
          email: 'user1@test.com',
          name: 'User 1'
        }
      } as any);

      // When: User A tries to access item from household1
      const request = new NextRequest(`http://localhost:3000/api/v1/items/${item1Id}`);
      const context = { params: { id: item1Id } };
      const response = await getItem(request, context);
      const data = await response.json();

      // Then: Access should be granted
      expect(response.status).toBe(200);
      expect(data.data.id).toBe(item1Id);
      expect(data.data.name).toBe('Test Item 1');
    });

    it('should create items only in user\'s household via POST /api/v1/items', async () => {
      // Given: User A (household1) is authenticated
      mockAuth.mockResolvedValue({
        user: { 
          id: user1Id, 
          householdId: household1Id,
          email: 'user1@test.com',
          name: 'User 1'
        }
      } as any);

      // When: User A creates a new item
      const requestBody = {
        name: 'New Test Item',
        description: 'Created by User A',
        locationId: location1Id,
        quantity: 1
      };

      const request = new NextRequest('http://localhost:3000/api/v1/items', {
        method: 'POST',
        body: JSON.stringify(requestBody)
      });

      const response = await createItem(request);
      const data = await response.json();

      // Then: Item should be created in user's household
      expect(response.status).toBe(201);
      expect(data.data.householdId).toBe(household1Id);
      expect(data.data.createdBy).toBe(user1Id);

      // Clean up created item
      await prisma.item.delete({ where: { id: data.data.id } });
    });
  });

  describe('Locations API Household Isolation', () => {
    it('should prevent cross-household location access in GET /api/v1/locations', async () => {
      // Given: User B (household2) is authenticated
      mockAuth.mockResolvedValue({
        user: { 
          id: user2Id, 
          householdId: household2Id,
          email: 'user2@test.com',
          name: 'User 2'
        }
      } as any);

      // When: User B tries to list locations (should only see household2 locations)
      const request = new NextRequest('http://localhost:3000/api/v1/locations');
      const response = await getLocations(request);
      const data = await response.json();

      // Then: Only locations from household2 should be returned
      expect(response.status).toBe(200);
      expect(data.data).toBeDefined();
      expect(Array.isArray(data.data)).toBe(true);
      
      // Verify no cross-household data leakage
      const locationIds = data.data.map((location: any) => location.id);
      expect(locationIds).toContain(location2Id);
      expect(locationIds).not.toContain(location1Id);
    });

    it('should create locations only in user\'s household via POST /api/v1/locations', async () => {
      // Given: User B (household2) is authenticated
      mockAuth.mockResolvedValue({
        user: { 
          id: user2Id, 
          householdId: household2Id,
          email: 'user2@test.com',
          name: 'User 2'
        }
      } as any);

      // When: User B creates a new location
      const requestBody = {
        name: 'New Test Location',
        description: 'Created by User B',
        locationType: 'ROOM'
      };

      const request = new NextRequest('http://localhost:3000/api/v1/locations', {
        method: 'POST',
        body: JSON.stringify(requestBody)
      });

      const response = await createLocation(request);
      const data = await response.json();

      // Then: Location should be created in user's household
      expect(response.status).toBe(201);
      expect(data.data.householdId).toBe(household2Id);

      // Clean up created location
      await prisma.location.delete({ where: { id: data.data.id } });
    });
  });

  describe('Authentication Context Security', () => {
    it('should deny access when user has no household context', async () => {
      // Given: User is authenticated but has no household context
      mockAuth.mockResolvedValue({
        user: { 
          id: user1Id,
          householdId: undefined, // No household context
          email: 'user1@test.com',
          name: 'User 1'
        }
      } as any);

      // When: User tries to access items
      const request = new NextRequest('http://localhost:3000/api/v1/items');
      const response = await getItems(request);
      const data = await response.json();

      // Then: Access should be denied
      expect(response.status).toBe(403);
      expect(data.error).toBe('Household access denied');
      expect(data.code).toBe('HOUSEHOLD_ACCESS_DENIED');
    });

    it('should deny access when user is not authenticated', async () => {
      // Given: No user session
      mockAuth.mockResolvedValue(null);

      // When: Unauthenticated request to items API
      const request = new NextRequest('http://localhost:3000/api/v1/items');
      const response = await getItems(request);
      const data = await response.json();

      // Then: Access should be denied
      expect(response.status).toBe(401);
      expect(data.error).toBeDefined();
    });

    it('should handle revoked household access gracefully', async () => {
      // Given: User appears to have household context but was removed from household
      mockAuth.mockResolvedValue({
        user: { 
          id: 'nonexistent-user',
          householdId: household1Id,
          email: 'removed@test.com',
          name: 'Removed User'
        }
      } as any);

      // When: User tries to access items
      const request = new NextRequest('http://localhost:3000/api/v1/items');
      const response = await getItems(request);
      const data = await response.json();

      // Then: Access should be denied with proper error message
      expect(response.status).toBe(403);
      expect(data.error).toBe('Household access denied');
      expect(data.message).toContain('revoked');
    });
  });

  describe('Data Integrity Validation', () => {
    it('should ensure household isolation during concurrent operations', async () => {
      // Given: Two users from different households making concurrent requests
      const promises = [];

      // User A (household1) creates an item
      mockAuth.mockResolvedValue({
        user: { 
          id: user1Id, 
          householdId: household1Id,
          email: 'user1@test.com',
          name: 'User 1'
        }
      } as any);

      const request1 = new NextRequest('http://localhost:3000/api/v1/items', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Concurrent Item 1',
          locationId: location1Id,
          quantity: 1
        })
      });
      promises.push(createItem(request1));

      // User B (household2) creates an item simultaneously
      mockAuth.mockResolvedValue({
        user: { 
          id: user2Id, 
          householdId: household2Id,
          email: 'user2@test.com',
          name: 'User 2'
        }
      } as any);

      const request2 = new NextRequest('http://localhost:3000/api/v1/items', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Concurrent Item 2',
          locationId: location2Id,
          quantity: 1
        })
      });
      promises.push(createItem(request2));

      // When: Both requests are executed concurrently
      const responses = await Promise.all(promises);
      const [response1, response2] = responses;
      const [data1, data2] = await Promise.all([
        response1.json(),
        response2.json()
      ]);

      // Then: Both should succeed with proper household isolation
      expect(response1.status).toBe(201);
      expect(response2.status).toBe(201);
      expect(data1.data.householdId).toBe(household1Id);
      expect(data2.data.householdId).toBe(household2Id);
      expect(data1.data.householdId).not.toBe(data2.data.householdId);

      // Clean up created items
      await prisma.item.deleteMany({
        where: {
          OR: [
            { id: data1.data.id },
            { id: data2.data.id }
          ]
        }
      });
    });
  });
});