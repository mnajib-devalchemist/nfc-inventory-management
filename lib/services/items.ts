import { PrismaClient, Item, ItemStatus, Prisma } from '@prisma/client';
import { 
  CreateItemInput, 
  UpdateItemInput, 
  SearchItemsInput, 
  BorrowItemInput, 
  ReturnItemInput,
  PaginationMeta,
  createPaginationMeta,
} from '@/lib/validation';

/**
 * ItemsService - Business logic for inventory item management
 * 
 * This service handles all business operations related to inventory items,
 * including CRUD operations, search, borrowing/returning, and business rule enforcement.
 */
export class ItemsService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Create a new inventory item with full business logic validation
   * 
   * @param userId - ID of the user creating the item
   * @param householdId - ID of the household the item belongs to  
   * @param data - Validated item creation data
   * @returns Promise resolving to the created item with location details
   */
  async createItem(userId: string, householdId: string, data: CreateItemInput): Promise<Item & { location: { name: string; path: string } }> {
    return await this.prisma.$transaction(async (tx) => {
      // 1. Validate location exists and user has access
      const location = await this.validateLocationAccess(tx, householdId, data.locationId);
      
      // 2. Generate search vector for full-text search
      const searchVector = this.generateSearchVector(data.name, data.description);
      
      // 3. Create the item
      const item = await tx.item.create({
        data: {
          ...data,
          householdId,
          createdBy: userId,
          metadata: data.metadata ? JSON.parse(JSON.stringify(data.metadata)) : {},
          // Note: searchVector would be handled by PostgreSQL triggers in production
        },
        include: {
          location: {
            select: {
              name: true,
              path: true
            }
          }
        }
      });
      
      // 4. Update location statistics
      await this.updateLocationStats(tx, data.locationId);
      
      // 5. Log activity for audit trail
      await this.logItemActivity(tx, item.id, userId, 'CREATED', {
        itemName: item.name,
        locationPath: location.path,
      });
      
      return item;
    });
  }

  /**
   * Update an existing inventory item
   * 
   * @param userId - ID of the user updating the item
   * @param itemId - ID of the item to update
   * @param householdId - ID of the household (for access control)
   * @param data - Validated item update data
   * @returns Promise resolving to the updated item
   */
  async updateItem(
    userId: string, 
    itemId: string, 
    householdId: string, 
    data: UpdateItemInput
  ): Promise<Item & { location: { name: string; path: string } }> {
    return await this.prisma.$transaction(async (tx) => {
      // 1. Validate item exists and user has access
      const existingItem = await this.validateItemAccess(tx, itemId, householdId);
      
      // 2. If location is being changed, validate new location
      if (data.locationId && data.locationId !== existingItem.locationId) {
        await this.validateLocationAccess(tx, householdId, data.locationId);
      }
      
      // 3. Update the item
      const updatedItem = await tx.item.update({
        where: { id: itemId },
        data: {
          ...data,
          metadata: data.metadata ? JSON.parse(JSON.stringify(data.metadata)) : undefined,
          updatedAt: new Date(),
        },
        include: {
          location: {
            select: {
              name: true,
              path: true,
            },
          },
        },
      });
      
      // 4. Update location statistics if location changed
      if (data.locationId && data.locationId !== existingItem.locationId) {
        await this.updateLocationStats(tx, existingItem.locationId); // Old location
        await this.updateLocationStats(tx, data.locationId); // New location
      }
      
      // 5. Log activity
      await this.logItemActivity(tx, itemId, userId, 'UPDATED', {
        changes: data,
      });
      
      return updatedItem;
    });
  }

  /**
   * Delete an inventory item (soft delete by marking as SOLD)
   * 
   * @param userId - ID of the user deleting the item
   * @param itemId - ID of the item to delete
   * @param householdId - ID of the household (for access control)
   * @returns Promise resolving to void
   */
  async deleteItem(userId: string, itemId: string, householdId: string): Promise<void> {
    return await this.prisma.$transaction(async (tx) => {
      // 1. Validate item exists and user has access
      const existingItem = await this.validateItemAccess(tx, itemId, householdId);
      
      // 2. Check if item is currently borrowed
      if (existingItem.status === ItemStatus.BORROWED) {
        throw new Error('Cannot delete a borrowed item. Please return the item first.');
      }
      
      // 3. Soft delete by updating status
      await tx.item.update({
        where: { id: itemId },
        data: {
          status: ItemStatus.SOLD,
          updatedAt: new Date(),
        },
      });
      
      // 4. Update location statistics
      await this.updateLocationStats(tx, existingItem.locationId);
      
      // 5. Log activity
      await this.logItemActivity(tx, itemId, userId, 'DELETED');
    });
  }

  /**
   * Get a single item by ID with full details
   * 
   * @param itemId - ID of the item to retrieve
   * @param householdId - ID of the household (for access control)
   * @returns Promise resolving to the item with related data
   */
  async getItemById(itemId: string, householdId: string): Promise<Item & {
    location: { name: string; path: string };
    creator: { name: string | null; email: string };
    borrower: { name: string | null; email: string } | null;
    photos: Array<{ id: string; thumbnailUrl: string; isPrimary: boolean }>;
    tags: Array<{ tag: { name: string; color: string } }>;
  } | null> {
    const item = await this.prisma.item.findFirst({
      where: {
        id: itemId,
        householdId,
        status: { not: ItemStatus.SOLD }, // Exclude soft-deleted items
      },
      include: {
        location: {
          select: {
            name: true,
            path: true,
          },
        },
        creator: {
          select: {
            name: true,
            email: true,
          },
        },
        borrower: {
          select: {
            name: true,
            email: true,
          },
        },
        photos: {
          select: {
            id: true,
            thumbnailUrl: true,
            isPrimary: true,
          },
          orderBy: [
            { isPrimary: 'desc' },
            { displayOrder: 'asc' },
          ],
        },
        tags: {
          include: {
            tag: {
              select: {
                name: true,
                color: true,
              },
            },
          },
        },
      },
    });
    
    return item;
  }

  /**
   * Search and filter items with pagination
   * 
   * @param householdId - ID of the household to search within
   * @param searchParams - Validated search parameters
   * @returns Promise resolving to paginated search results
   */
  async searchItems(
    householdId: string, 
    searchParams: SearchItemsInput
  ): Promise<{
    items: Array<Item & {
      location: { name: string; path: string };
      photos: Array<{ thumbnailUrl: string; isPrimary: boolean }>;
    }>;
    pagination: PaginationMeta;
  }> {
    const {
      query,
      locationId,
      status,
      tags,
      minValue,
      maxValue,
      page,
      limit,
      sortBy,
      sortOrder,
    } = searchParams;

    // Build the where clause
    const whereClause: Prisma.ItemWhereInput = {
      householdId,
      status: status || { not: ItemStatus.SOLD }, // Exclude deleted items by default
      ...(locationId && { locationId }),
      ...(minValue && { currentValue: { gte: minValue } }),
      ...(maxValue && { currentValue: { lte: maxValue } }),
      ...(query && {
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { description: { contains: query, mode: 'insensitive' } },
        ],
      }),
      ...(tags && tags.length > 0 && {
        tags: {
          some: {
            tagId: { in: tags },
          },
        },
      }),
    };

    // Build the order by clause
    const orderBy: Prisma.ItemOrderByWithRelationInput = {
      [sortBy]: sortOrder,
    };

    // Calculate skip for pagination
    const skip = (page - 1) * limit;

    // Execute the search with count
    const [items, totalCount] = await Promise.all([
      this.prisma.item.findMany({
        where: whereClause,
        include: {
          location: {
            select: {
              name: true,
              path: true,
            },
          },
          photos: {
            select: {
              thumbnailUrl: true,
              isPrimary: true,
            },
            where: { isPrimary: true },
            take: 1,
          },
        },
        orderBy,
        skip,
        take: limit,
      }),
      this.prisma.item.count({ where: whereClause }),
    ]);

    return {
      items,
      pagination: createPaginationMeta(page, limit, totalCount),
    };
  }

  /**
   * Borrow an item (mark as borrowed by a user)
   * 
   * @param userId - ID of the user performing the action
   * @param itemId - ID of the item to borrow
   * @param householdId - ID of the household (for access control)
   * @param borrowData - Validated borrow data
   * @returns Promise resolving to the updated item
   */
  async borrowItem(
    userId: string,
    itemId: string,
    householdId: string,
    borrowData: BorrowItemInput
  ): Promise<Item> {
    return await this.prisma.$transaction(async (tx) => {
      // 1. Validate item exists and is available
      const item = await this.validateItemAccess(tx, itemId, householdId);
      
      if (item.status !== ItemStatus.AVAILABLE) {
        throw new Error(`Item is not available for borrowing. Current status: ${item.status}`);
      }
      
      // 2. Update item as borrowed
      const borrowedItem = await tx.item.update({
        where: { id: itemId },
        data: {
          status: ItemStatus.BORROWED,
          borrowedBy: borrowData.borrowerId,
          borrowedAt: new Date(),
          borrowedUntil: borrowData.borrowedUntil,
          updatedAt: new Date(),
        },
      });
      
      // 3. Log activity
      await this.logItemActivity(tx, itemId, userId, 'BORROWED', {
        borrowerId: borrowData.borrowerId,
        borrowedUntil: borrowData.borrowedUntil,
      });
      
      return borrowedItem;
    });
  }

  /**
   * Return a borrowed item
   * 
   * @param userId - ID of the user performing the action
   * @param itemId - ID of the item to return
   * @param householdId - ID of the household (for access control)
   * @param returnData - Optional return data (condition, notes)
   * @returns Promise resolving to the updated item
   */
  async returnItem(
    userId: string,
    itemId: string,
    householdId: string,
    returnData?: ReturnItemInput
  ): Promise<Item> {
    return await this.prisma.$transaction(async (tx) => {
      // 1. Validate item exists and is borrowed
      const item = await this.validateItemAccess(tx, itemId, householdId);
      
      if (item.status !== ItemStatus.BORROWED) {
        throw new Error(`Item is not currently borrowed. Current status: ${item.status}`);
      }
      
      // 2. Determine new status based on condition
      let newStatus: ItemStatus = ItemStatus.AVAILABLE;
      if (returnData?.condition === 'NEEDS_MAINTENANCE') {
        newStatus = ItemStatus.MAINTENANCE;
      }
      
      // 3. Update item as returned
      const returnedItem = await tx.item.update({
        where: { id: itemId },
        data: {
          status: newStatus,
          borrowedBy: null,
          borrowedAt: null,
          borrowedUntil: null,
          updatedAt: new Date(),
        },
      });
      
      // 4. Log activity
      await this.logItemActivity(tx, itemId, userId, 'RETURNED', {
        condition: returnData?.condition,
        notes: returnData?.notes,
        newStatus,
      });
      
      return returnedItem;
    });
  }

  // Private helper methods

  /**
   * Validate that a location exists and belongs to the household
   */
  private async validateLocationAccess(
    tx: Prisma.TransactionClient,
    householdId: string,
    locationId: string
  ) {
    const location = await tx.location.findFirst({
      where: {
        id: locationId,
        householdId,
      },
    });
    
    if (!location) {
      throw new Error('Location not found or access denied');
    }
    
    return location;
  }

  /**
   * Validate that an item exists and belongs to the household
   */
  private async validateItemAccess(
    tx: Prisma.TransactionClient,
    itemId: string,
    householdId: string
  ) {
    const item = await tx.item.findFirst({
      where: {
        id: itemId,
        householdId,
      },
    });
    
    if (!item) {
      throw new Error('Item not found or access denied');
    }
    
    return item;
  }

  /**
   * Update location statistics (item count and total value)
   */
  private async updateLocationStats(
    tx: Prisma.TransactionClient,
    locationId: string
  ) {
    const stats = await tx.item.aggregate({
      where: {
        locationId,
        status: { notIn: [ItemStatus.SOLD, ItemStatus.LOST] },
      },
      _count: { id: true },
      _sum: { currentValue: true },
    });
    
    await tx.location.update({
      where: { id: locationId },
      data: {
        itemCount: stats._count.id || 0,
        totalValue: stats._sum.currentValue || 0,
        lastAccessed: new Date(),
      },
    });
  }

  /**
   * Generate search vector for full-text search
   * Note: In production, this would be handled by PostgreSQL triggers
   */
  private generateSearchVector(name: string, description?: string): string {
    return [name, description].filter(Boolean).join(' ').toLowerCase();
  }

  /**
   * Log item activity for audit trail
   * Note: This would integrate with a proper audit logging system in production
   */
  private async logItemActivity(
    tx: Prisma.TransactionClient,
    itemId: string,
    userId: string,
    action: string,
    metadata?: Record<string, any>
  ) {
    // In a real implementation, this would write to an audit log table
    console.log('Item Activity:', {
      itemId,
      userId,
      action,
      metadata,
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * Singleton instance of ItemsService
 */
export const itemsService = new ItemsService(new PrismaClient());