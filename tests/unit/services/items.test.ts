/**
 * @jest-environment node
 */

import { ItemsService } from '@/lib/services/items';
import { prisma } from '@/lib/db';
import { ItemStatus } from '@prisma/client';

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

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

describe('ItemsService', () => {
  let itemsService: ItemsService;
  const userId = 'user-1';
  const householdId = 'household-1';

  beforeEach(() => {
    itemsService = new ItemsService();
    jest.clearAllMocks();
  });

  describe('createItem', () => {
    const mockItemData = {
      name: 'Test Item',
      description: 'A test item',
      locationId: 'location-1',
      quantity: 1,
      unit: 'piece',
    };

    const mockLocation = {
      id: 'location-1',
      name: 'Test Location',
      path: '/Test Location',
      householdId,
    };

    const mockCreatedItem = {
      id: 'item-1',
      ...mockItemData,
      householdId,
      createdBy: userId,
      status: ItemStatus.AVAILABLE,
      createdAt: new Date(),
      updatedAt: new Date(),
      location: {
        name: mockLocation.name,
        path: mockLocation.path,
      },
    };

    beforeEach(() => {
      mockPrisma.$transaction.mockImplementation((callback: any) =>
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
    });

    it('should create an item successfully', async () => {
      const result = await itemsService.createItem(userId, householdId, mockItemData);

      expect(result).toEqual(mockCreatedItem);
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
        itemsService.createItem(userId, householdId, mockItemData)
      ).rejects.toThrow('Location not found or access denied');
    });

    it('should throw error if location belongs to different household', async () => {
      const differentHouseholdLocation = {
        ...mockLocation,
        householdId: 'different-household',
      };

      mockPrisma.$transaction.mockImplementation((callback: any) =>
        callback({
          location: {
            findUnique: jest.fn().mockResolvedValue(differentHouseholdLocation),
          },
        })
      );

      await expect(
        itemsService.createItem(userId, householdId, mockItemData)
      ).rejects.toThrow('Location not found or access denied');
    });
  });

  describe('updateItem', () => {
    const itemId = 'item-1';
    const updateData = {
      name: 'Updated Item',
      description: 'Updated description',
    };

    const mockExistingItem = {
      id: itemId,
      householdId,
      createdBy: userId,
      locationId: 'location-1',
      status: ItemStatus.AVAILABLE,
    };

    const mockUpdatedItem = {
      ...mockExistingItem,
      ...updateData,
      location: {
        name: 'Test Location',
        path: '/Test Location',
      },
    };

    beforeEach(() => {
      mockPrisma.$transaction.mockImplementation((callback: any) =>
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
    });

    it('should update an item successfully', async () => {
      const result = await itemsService.updateItem(userId, itemId, householdId, updateData);

      expect(result).toEqual(mockUpdatedItem);
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('should throw error if item does not exist', async () => {
      mockPrisma.$transaction.mockImplementation((callback: any) =>
        callback({
          item: {
            findUnique: jest.fn().mockResolvedValue(null),
          },
        })
      );

      await expect(
        itemsService.updateItem(userId, itemId, householdId, updateData)
      ).rejects.toThrow('Item not found or access denied');
    });

    it('should throw error if user does not own the item', async () => {
      const differentUserItem = {
        ...mockExistingItem,
        createdBy: 'different-user',
      };

      mockPrisma.$transaction.mockImplementation((callback: any) =>
        callback({
          item: {
            findUnique: jest.fn().mockResolvedValue(differentUserItem),
          },
        })
      );

      await expect(
        itemsService.updateItem(userId, itemId, householdId, updateData)
      ).rejects.toThrow('Item not found or access denied');
    });
  });

  describe('borrowItem', () => {
    const itemId = 'item-1';
    const borrowData = {
      borrowedUntil: new Date('2024-12-31'),
    };

    const mockAvailableItem = {
      id: itemId,
      householdId,
      status: ItemStatus.AVAILABLE,
      borrowedBy: null,
    };

    const mockBorrowedItem = {
      ...mockAvailableItem,
      status: ItemStatus.BORROWED,
      borrowedBy: userId,
      borrowedAt: new Date(),
      borrowedUntil: borrowData.borrowedUntil,
    };

    beforeEach(() => {
      mockPrisma.$transaction.mockImplementation((callback: any) =>
        callback({
          item: {
            findUnique: jest.fn().mockResolvedValue(mockAvailableItem),
            update: jest.fn().mockResolvedValue(mockBorrowedItem),
          },
        })
      );
    });

    it('should borrow an available item successfully', async () => {
      const result = await itemsService.borrowItem(userId, itemId, householdId, borrowData);

      expect(result).toEqual(mockBorrowedItem);
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('should throw error if item is already borrowed', async () => {
      const alreadyBorrowedItem = {
        ...mockAvailableItem,
        status: ItemStatus.BORROWED,
        borrowedBy: 'other-user',
      };

      mockPrisma.$transaction.mockImplementation((callback: any) =>
        callback({
          item: {
            findUnique: jest.fn().mockResolvedValue(alreadyBorrowedItem),
          },
        })
      );

      await expect(
        itemsService.borrowItem(userId, itemId, householdId, borrowData)
      ).rejects.toThrow('Item is not available for borrowing');
    });

    it('should throw error if item does not exist', async () => {
      mockPrisma.$transaction.mockImplementation((callback: any) =>
        callback({
          item: {
            findUnique: jest.fn().mockResolvedValue(null),
          },
        })
      );

      await expect(
        itemsService.borrowItem(userId, itemId, householdId, borrowData)
      ).rejects.toThrow('Item not found or access denied');
    });
  });

  describe('returnItem', () => {
    const itemId = 'item-1';

    const mockBorrowedItem = {
      id: itemId,
      householdId,
      status: ItemStatus.BORROWED,
      borrowedBy: userId,
      borrowedAt: new Date(),
      borrowedUntil: new Date('2024-12-31'),
    };

    const mockReturnedItem = {
      ...mockBorrowedItem,
      status: ItemStatus.AVAILABLE,
      borrowedBy: null,
      borrowedAt: null,
      borrowedUntil: null,
    };

    beforeEach(() => {
      mockPrisma.$transaction.mockImplementation((callback: any) =>
        callback({
          item: {
            findUnique: jest.fn().mockResolvedValue(mockBorrowedItem),
            update: jest.fn().mockResolvedValue(mockReturnedItem),
          },
        })
      );
    });

    it('should return a borrowed item successfully', async () => {
      const result = await itemsService.returnItem(userId, itemId, householdId);

      expect(result).toEqual(mockReturnedItem);
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('should throw error if item is not currently borrowed', async () => {
      const availableItem = {
        ...mockBorrowedItem,
        status: ItemStatus.AVAILABLE,
        borrowedBy: null,
      };

      mockPrisma.$transaction.mockImplementation((callback: any) =>
        callback({
          item: {
            findUnique: jest.fn().mockResolvedValue(availableItem),
          },
        })
      );

      await expect(
        itemsService.returnItem(userId, itemId, householdId)
      ).rejects.toThrow('Item is not currently borrowed');
    });

    it('should return item with maintenance status when condition indicates', async () => {
      const maintenanceReturnedItem = {
        ...mockBorrowedItem,
        status: ItemStatus.MAINTENANCE,
        borrowedBy: null,
        borrowedAt: null,
        borrowedUntil: null,
      };

      mockPrisma.$transaction.mockImplementation((callback: any) =>
        callback({
          item: {
            findUnique: jest.fn().mockResolvedValue(mockBorrowedItem),
            update: jest.fn().mockResolvedValue(maintenanceReturnedItem),
          },
        })
      );

      const result = await itemsService.returnItem(userId, itemId, householdId, {
        condition: 'NEEDS_MAINTENANCE',
        notes: 'Needs repair',
      });

      expect(result.status).toBe(ItemStatus.MAINTENANCE);
    });
  });

  describe('searchItems', () => {
    const searchParams = {
      query: 'test',
      status: ItemStatus.AVAILABLE,
      locationId: 'location-1',
    };

    const mockSearchResults = {
      items: [
        {
          id: 'item-1',
          name: 'Test Item 1',
          householdId,
          status: ItemStatus.AVAILABLE,
        },
        {
          id: 'item-2',
          name: 'Test Item 2',
          householdId,
          status: ItemStatus.AVAILABLE,
        },
      ],
      pagination: {
        page: 1,
        limit: 20,
        total: 2,
        totalPages: 1,
      },
    };

    beforeEach(() => {
      mockPrisma.item.findMany.mockResolvedValue(mockSearchResults.items);
      mockPrisma.item.count.mockResolvedValue(2);
    });

    it('should search items with basic query', async () => {
      const result = await itemsService.searchItems(householdId, searchParams);

      expect(result.items).toHaveLength(2);
      expect(result.pagination.total).toBe(2);
      expect(mockPrisma.item.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            householdId,
            status: ItemStatus.AVAILABLE,
            locationId: 'location-1',
            OR: expect.arrayContaining([
              expect.objectContaining({ name: expect.anything() }),
              expect.objectContaining({ description: expect.anything() }),
            ]),
          }),
        })
      );
    });

    it('should handle pagination correctly', async () => {
      const paginatedParams = {
        ...searchParams,
        page: 2,
        limit: 10,
      };

      await itemsService.searchItems(householdId, paginatedParams);

      expect(mockPrisma.item.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 10, // (page - 1) * limit
          take: 10,
        })
      );
    });
  });
});