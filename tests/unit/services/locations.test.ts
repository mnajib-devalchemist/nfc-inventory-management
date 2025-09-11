/**
 * @jest-environment node
 */

import { LocationsService } from '@/lib/services/locations';
import { prisma } from '@/lib/db';
import { LocationType } from '@prisma/client';

// Mock Prisma
jest.mock('@/lib/db', () => ({
  prisma: {
    $transaction: jest.fn(),
    location: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    item: {
      count: jest.fn(),
    },
  },
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

describe('LocationsService', () => {
  let locationsService: LocationsService;
  const userId = 'user-1';
  const householdId = 'household-1';

  beforeEach(() => {
    locationsService = new LocationsService();
    jest.clearAllMocks();
  });

  describe('createLocation', () => {
    const mockLocationData = {
      name: 'Test Room',
      description: 'A test room',
      parentId: 'parent-location-1',
      locationType: LocationType.ROOM,
    };

    const mockParentLocation = {
      id: 'parent-location-1',
      name: 'Test Building',
      householdId,
      locationType: LocationType.BUILDING,
      level: 0,
      path: '/Test Building',
    };

    const mockCreatedLocation = {
      id: 'location-1',
      ...mockLocationData,
      householdId,
      level: 1,
      path: '/Test Building/Test Room',
      itemCount: 0,
      totalValue: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    beforeEach(() => {
      mockPrisma.$transaction.mockImplementation((callback: any) =>
        callback({
          location: {
            findUnique: jest.fn().mockResolvedValue(mockParentLocation),
            create: jest.fn().mockResolvedValue(mockCreatedLocation),
            count: jest.fn().mockResolvedValue(0),
          },
        })
      );
    });

    it('should create a location successfully', async () => {
      const result = await locationsService.createLocation(
        userId,
        householdId,
        mockLocationData
      );

      expect(result).toEqual(mockCreatedLocation);
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('should create root location without parent', async () => {
      const rootLocationData = {
        name: 'Main Building',
        locationType: LocationType.BUILDING,
      };

      const mockRootLocation = {
        id: 'root-location-1',
        ...rootLocationData,
        householdId,
        level: 0,
        path: '/Main Building',
        parentId: null,
        itemCount: 0,
        totalValue: 0,
      };

      mockPrisma.$transaction.mockImplementation((callback: any) =>
        callback({
          location: {
            create: jest.fn().mockResolvedValue(mockRootLocation),
            count: jest.fn().mockResolvedValue(0),
          },
        })
      );

      const result = await locationsService.createLocation(
        userId,
        householdId,
        rootLocationData
      );

      expect(result.level).toBe(0);
      expect(result.path).toBe('/Main Building');
    });

    it('should throw error if parent location does not exist', async () => {
      mockPrisma.$transaction.mockImplementation((callback: any) =>
        callback({
          location: {
            findUnique: jest.fn().mockResolvedValue(null),
          },
        })
      );

      await expect(
        locationsService.createLocation(userId, householdId, mockLocationData)
      ).rejects.toThrow('Parent location not found or access denied');
    });

    it('should throw error for invalid location type hierarchy', async () => {
      const invalidData = {
        ...mockLocationData,
        locationType: LocationType.BUILDING, // Cannot be child of BUILDING
      };

      mockPrisma.$transaction.mockImplementation((callback: any) =>
        callback({
          location: {
            findUnique: jest.fn().mockResolvedValue(mockParentLocation),
          },
        })
      );

      await expect(
        locationsService.createLocation(userId, householdId, invalidData)
      ).rejects.toThrow('Invalid location type hierarchy');
    });

    it('should throw error if maximum depth exceeded', async () => {
      const deepParentLocation = {
        ...mockParentLocation,
        level: 10, // Maximum depth
      };

      mockPrisma.$transaction.mockImplementation((callback: any) =>
        callback({
          location: {
            findUnique: jest.fn().mockResolvedValue(deepParentLocation),
          },
        })
      );

      await expect(
        locationsService.createLocation(userId, householdId, mockLocationData)
      ).rejects.toThrow('Maximum location hierarchy depth (10 levels) exceeded');
    });

    it('should only allow BUILDING or ROOM at root level', async () => {
      const invalidRootData = {
        name: 'Test Container',
        locationType: LocationType.CONTAINER, // Not allowed at root
      };

      await expect(
        locationsService.createLocation(userId, householdId, invalidRootData)
      ).rejects.toThrow('Root level locations must be BUILDING or ROOM type');
    });
  });

  describe('updateLocation', () => {
    const locationId = 'location-1';
    const updateData = {
      name: 'Updated Room',
      description: 'Updated description',
    };

    const mockExistingLocation = {
      id: locationId,
      householdId,
      name: 'Test Room',
      locationType: LocationType.ROOM,
      level: 1,
      path: '/Building/Test Room',
      parentId: 'parent-1',
    };

    const mockUpdatedLocation = {
      ...mockExistingLocation,
      ...updateData,
      path: '/Building/Updated Room',
      updatedAt: new Date(),
    };

    beforeEach(() => {
      mockPrisma.$transaction.mockImplementation((callback: any) =>
        callback({
          location: {
            findUnique: jest.fn().mockResolvedValue(mockExistingLocation),
            update: jest.fn().mockResolvedValue(mockUpdatedLocation),
            findMany: jest.fn().mockResolvedValue([]), // No children
          },
        })
      );
    });

    it('should update a location successfully', async () => {
      const result = await locationsService.updateLocation(
        userId,
        locationId,
        householdId,
        updateData
      );

      expect(result).toEqual(mockUpdatedLocation);
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('should throw error if location does not exist', async () => {
      mockPrisma.$transaction.mockImplementation((callback: any) =>
        callback({
          location: {
            findUnique: jest.fn().mockResolvedValue(null),
          },
        })
      );

      await expect(
        locationsService.updateLocation(userId, locationId, householdId, updateData)
      ).rejects.toThrow('Location not found or access denied');
    });

    it('should update paths of child locations when name changes', async () => {
      const childLocations = [
        {
          id: 'child-1',
          name: 'Child Location 1',
          path: '/Building/Test Room/Child Location 1',
        },
        {
          id: 'child-2', 
          name: 'Child Location 2',
          path: '/Building/Test Room/Child Location 2',
        },
      ];

      mockPrisma.$transaction.mockImplementation((callback: any) =>
        callback({
          location: {
            findUnique: jest.fn().mockResolvedValue(mockExistingLocation),
            update: jest.fn()
              .mockResolvedValueOnce(mockUpdatedLocation) // Parent update
              .mockResolvedValue({}), // Child updates
            findMany: jest.fn().mockResolvedValue(childLocations),
          },
        })
      );

      await locationsService.updateLocation(
        userId,
        locationId,
        householdId,
        updateData
      );

      // Should update both child locations
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });
  });

  describe('deleteLocation', () => {
    const locationId = 'location-1';

    const mockLocation = {
      id: locationId,
      householdId,
      name: 'Test Location',
    };

    beforeEach(() => {
      mockPrisma.$transaction.mockImplementation((callback: any) =>
        callback({
          location: {
            findUnique: jest.fn().mockResolvedValue(mockLocation),
            findMany: jest.fn().mockResolvedValue([]), // No children
            delete: jest.fn().mockResolvedValue(mockLocation),
          },
          item: {
            count: jest.fn().mockResolvedValue(0), // No items
          },
        })
      );
    });

    it('should delete an empty location successfully', async () => {
      await expect(
        locationsService.deleteLocation(userId, locationId, householdId)
      ).resolves.not.toThrow();

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('should throw error if location has child locations', async () => {
      mockPrisma.$transaction.mockImplementation((callback: any) =>
        callback({
          location: {
            findUnique: jest.fn().mockResolvedValue(mockLocation),
            findMany: jest.fn().mockResolvedValue([{ id: 'child-1' }]), // Has children
          },
        })
      );

      await expect(
        locationsService.deleteLocation(userId, locationId, householdId)
      ).rejects.toThrow('Location contains child locations');
    });

    it('should throw error if location has items', async () => {
      mockPrisma.$transaction.mockImplementation((callback: any) =>
        callback({
          location: {
            findUnique: jest.fn().mockResolvedValue(mockLocation),
            findMany: jest.fn().mockResolvedValue([]), // No children
          },
          item: {
            count: jest.fn().mockResolvedValue(5), // Has items
          },
        })
      );

      await expect(
        locationsService.deleteLocation(userId, locationId, householdId)
      ).rejects.toThrow('Location contains 5 items');
    });

    it('should throw error if location does not exist', async () => {
      mockPrisma.$transaction.mockImplementation((callback: any) =>
        callback({
          location: {
            findUnique: jest.fn().mockResolvedValue(null),
          },
        })
      );

      await expect(
        locationsService.deleteLocation(userId, locationId, householdId)
      ).rejects.toThrow('Location not found or access denied');
    });
  });

  describe('searchLocations', () => {
    const searchParams = {
      query: 'test',
      locationType: LocationType.ROOM,
      includeEmpty: true,
    };

    const mockSearchResults = [
      {
        id: 'location-1',
        name: 'Test Room 1',
        householdId,
        locationType: LocationType.ROOM,
        level: 1,
      },
      {
        id: 'location-2',
        name: 'Test Room 2',
        householdId,
        locationType: LocationType.ROOM,
        level: 1,
      },
    ];

    beforeEach(() => {
      mockPrisma.location.findMany.mockResolvedValue(mockSearchResults);
    });

    it('should search locations with query parameters', async () => {
      const result = await locationsService.searchLocations(householdId, searchParams);

      expect(result.locations).toHaveLength(2);
      expect(mockPrisma.location.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            householdId,
            locationType: LocationType.ROOM,
            OR: expect.arrayContaining([
              expect.objectContaining({ name: expect.anything() }),
              expect.objectContaining({ description: expect.anything() }),
            ]),
          }),
        })
      );
    });

    it('should filter out empty locations when includeEmpty is false', async () => {
      const paramsExcludeEmpty = {
        ...searchParams,
        includeEmpty: false,
      };

      await locationsService.searchLocations(householdId, paramsExcludeEmpty);

      expect(mockPrisma.location.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            itemCount: { gt: 0 },
          }),
        })
      );
    });

    it('should filter by parent location', async () => {
      const paramsWithParent = {
        ...searchParams,
        parentId: 'parent-1',
      };

      await locationsService.searchLocations(householdId, paramsWithParent);

      expect(mockPrisma.location.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            parentId: 'parent-1',
          }),
        })
      );
    });

    it('should filter by level range', async () => {
      const paramsWithLevels = {
        ...searchParams,
        minLevel: 1,
        maxLevel: 3,
      };

      await locationsService.searchLocations(householdId, paramsWithLevels);

      expect(mockPrisma.location.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            level: { gte: 1, lte: 3 },
          }),
        })
      );
    });
  });

  describe('getLocationById', () => {
    const locationId = 'location-1';
    const mockLocation = {
      id: locationId,
      name: 'Test Location',
      householdId,
      locationType: LocationType.ROOM,
      level: 1,
      path: '/Building/Test Location',
      itemCount: 5,
      totalValue: 1000,
      items: [
        { id: 'item-1', name: 'Item 1' },
        { id: 'item-2', name: 'Item 2' },
      ],
    };

    beforeEach(() => {
      mockPrisma.location.findUnique.mockResolvedValue(mockLocation);
    });

    it('should get location by id successfully', async () => {
      const result = await locationsService.getLocationById(locationId, householdId);

      expect(result).toEqual(mockLocation);
      expect(mockPrisma.location.findUnique).toHaveBeenCalledWith({
        where: { id: locationId, householdId },
        include: expect.objectContaining({
          items: expect.anything(),
          children: expect.anything(),
        }),
      });
    });

    it('should return null if location does not exist', async () => {
      mockPrisma.location.findUnique.mockResolvedValue(null);

      const result = await locationsService.getLocationById(locationId, householdId);

      expect(result).toBeNull();
    });

    it('should return null if location belongs to different household', async () => {
      const differentHouseholdLocation = {
        ...mockLocation,
        householdId: 'different-household',
      };

      mockPrisma.location.findUnique.mockResolvedValue(differentHouseholdLocation);

      const result = await locationsService.getLocationById(locationId, householdId);

      expect(result).toBeNull();
    });
  });
});