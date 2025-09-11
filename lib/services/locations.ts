import { PrismaClient, Location, LocationType, Prisma } from '@prisma/client';
import { 
  CreateLocationInput, 
  UpdateLocationInput, 
  SearchLocationsInput, 
  MoveLocationInput,
  PaginationMeta,
  createPaginationMeta,
} from '@/lib/validation';

/**
 * LocationsService - Business logic for location hierarchy management
 * 
 * This service handles all business operations related to locations,
 * including CRUD operations, hierarchy management, and business rule enforcement.
 */
export class LocationsService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Create a new location with hierarchy validation
   * 
   * @param userId - ID of the user creating the location
   * @param householdId - ID of the household the location belongs to
   * @param data - Validated location creation data
   * @returns Promise resolving to the created location with hierarchy info
   */
  async createLocation(
    userId: string, 
    householdId: string, 
    data: CreateLocationInput
  ): Promise<Location & { parent?: { name: string; path: string } | null }> {
    return await this.prisma.$transaction(async (tx) => {
      let path = data.name;
      let level = 0;
      let parent = null;
      
      // If this location has a parent, validate and compute hierarchy
      if (data.parentId) {
        parent = await this.validateLocationAccess(tx, householdId, data.parentId);
        
        // Validate location type hierarchy rules
        await this.validateLocationTypeHierarchy(parent.locationType, data.locationType);
        
        // Compute path and level from parent
        path = `${parent.path} → ${data.name}`;
        level = parent.level + 1;
        
        // Validate hierarchy depth
        if (level > 10) {
          throw new Error('Maximum location hierarchy depth (10 levels) exceeded');
        }
      } else {
        // Root level locations should be BUILDING or ROOM
        if (data.locationType !== LocationType.BUILDING && data.locationType !== LocationType.ROOM) {
          throw new Error('Root level locations must be BUILDING or ROOM type');
        }
      }
      
      // Create the location
      const location = await tx.location.create({
        data: {
          ...data,
          householdId,
          path,
          level,
        },
        include: {
          parent: {
            select: {
              name: true,
              path: true,
            },
          },
        },
      });
      
      // Log activity for audit trail
      await this.logLocationActivity(tx, location.id, userId, 'CREATED', {
        locationName: location.name,
        path: location.path,
        locationType: location.locationType,
      });
      
      return location;
    });
  }

  /**
   * Update an existing location
   * 
   * @param userId - ID of the user updating the location
   * @param locationId - ID of the location to update
   * @param householdId - ID of the household (for access control)
   * @param data - Validated location update data
   * @returns Promise resolving to the updated location
   */
  async updateLocation(
    userId: string,
    locationId: string,
    householdId: string,
    data: UpdateLocationInput
  ): Promise<Location> {
    return await this.prisma.$transaction(async (tx) => {
      // Validate location exists and user has access
      const existingLocation = await this.validateLocationAccess(tx, householdId, locationId);
      
      // If parent is being changed, validate the new hierarchy
      if (data.parentId !== undefined) {
        await this.validateLocationMove(tx, locationId, householdId, data.parentId);
      }
      
      // Check if name change requires path updates
      const needsPathUpdate = data.name && data.name !== existingLocation.name;
      
      // Update the location
      const updatedLocation = await tx.location.update({
        where: { id: locationId },
        data: {
          ...data,
          updatedAt: new Date(),
        },
      });
      
      // If name changed, update paths for this location and all descendants
      if (needsPathUpdate) {
        await this.updateLocationPaths(tx, locationId);
      }
      
      // Log activity
      await this.logLocationActivity(tx, locationId, userId, 'UPDATED', {
        changes: data,
      });
      
      return updatedLocation;
    });
  }

  /**
   * Delete a location (only if it has no items and no children)
   * 
   * @param userId - ID of the user deleting the location
   * @param locationId - ID of the location to delete
   * @param householdId - ID of the household (for access control)
   * @returns Promise resolving to void
   */
  async deleteLocation(userId: string, locationId: string, householdId: string): Promise<void> {
    return await this.prisma.$transaction(async (tx) => {
      // Validate location exists and user has access
      const location = await this.validateLocationAccess(tx, householdId, locationId);
      
      // Check if location has children
      const childCount = await tx.location.count({
        where: { parentId: locationId },
      });
      
      if (childCount > 0) {
        throw new Error('Cannot delete location that contains child locations. Please move or delete child locations first.');
      }
      
      // Check if location has items
      const itemCount = await tx.item.count({
        where: { 
          locationId,
          status: { notIn: ['SOLD', 'LOST'] }
        },
      });
      
      if (itemCount > 0) {
        throw new Error('Cannot delete location that contains items. Please move items to another location first.');
      }
      
      // Delete the location
      await tx.location.delete({
        where: { id: locationId },
      });
      
      // Log activity
      await this.logLocationActivity(tx, locationId, userId, 'DELETED', {
        locationName: location.name,
        path: location.path,
      });
    });
  }

  /**
   * Move a location to a new parent (change hierarchy)
   * 
   * @param userId - ID of the user moving the location
   * @param locationId - ID of the location to move
   * @param householdId - ID of the household (for access control)
   * @param moveData - New parent information
   * @returns Promise resolving to the updated location
   */
  async moveLocation(
    userId: string,
    locationId: string,
    householdId: string,
    moveData: MoveLocationInput
  ): Promise<Location> {
    return await this.prisma.$transaction(async (tx) => {
      // Validate the move is allowed
      await this.validateLocationMove(tx, locationId, householdId, moveData.newParentId);
      
      const existingLocation = await tx.location.findUniqueOrThrow({
        where: { id: locationId },
      });
      
      // Update the location's parent
      const updatedLocation = await tx.location.update({
        where: { id: locationId },
        data: {
          parentId: moveData.newParentId,
          updatedAt: new Date(),
        },
      });
      
      // Recalculate paths for this location and all its descendants
      await this.updateLocationPaths(tx, locationId);
      
      // Log activity
      await this.logLocationActivity(tx, locationId, userId, 'MOVED', {
        oldPath: existingLocation.path,
        newParentId: moveData.newParentId,
      });
      
      return updatedLocation;
    });
  }

  /**
   * Get a single location by ID with full details
   * 
   * @param locationId - ID of the location to retrieve
   * @param householdId - ID of the household (for access control)
   * @returns Promise resolving to the location with related data
   */
  async getLocationById(locationId: string, householdId: string): Promise<Location & {
    parent: { name: string; path: string } | null;
    children: Array<{ id: string; name: string; locationType: LocationType; itemCount: number }>;
    items: Array<{ id: string; name: string; status: string }>;
  } | null> {
    const location = await this.prisma.location.findFirst({
      where: {
        id: locationId,
        householdId,
      },
      include: {
        parent: {
          select: {
            name: true,
            path: true,
          },
        },
        children: {
          select: {
            id: true,
            name: true,
            locationType: true,
            itemCount: true,
          },
          orderBy: { name: 'asc' },
        },
        items: {
          select: {
            id: true,
            name: true,
            status: true,
          },
          where: {
            status: { notIn: ['SOLD', 'LOST'] },
          },
          orderBy: { name: 'asc' },
        },
      },
    });
    
    return location;
  }

  /**
   * Search and filter locations
   * 
   * @param householdId - ID of the household to search within
   * @param searchParams - Validated search parameters
   * @returns Promise resolving to search results
   */
  async searchLocations(
    householdId: string,
    searchParams: SearchLocationsInput
  ): Promise<{
    locations: Array<Location & {
      parent: { name: string } | null;
      _count: { children: number; items: number };
    }>;
  }> {
    const {
      query,
      parentId,
      locationType,
      includeEmpty,
      minLevel,
      maxLevel,
      sortBy,
      sortOrder,
    } = searchParams;

    // Build the where clause
    const whereClause: Prisma.LocationWhereInput = {
      householdId,
      ...(parentId !== undefined && { parentId }),
      ...(locationType && { locationType }),
      ...(minLevel !== undefined && { level: { gte: minLevel } }),
      ...(maxLevel !== undefined && { level: { lte: maxLevel } }),
      ...(query && {
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { description: { contains: query, mode: 'insensitive' } },
          { path: { contains: query, mode: 'insensitive' } },
        ],
      }),
      ...(includeEmpty === false && {
        OR: [
          { itemCount: { gt: 0 } },
          { children: { some: {} } },
        ],
      }),
    };

    // Build the order by clause
    const orderBy: Prisma.LocationOrderByWithRelationInput = 
      sortBy === 'path' ? { path: sortOrder } :
      sortBy === 'name' ? { name: sortOrder } :
      sortBy === 'createdAt' ? { createdAt: sortOrder } :
      sortBy === 'itemCount' ? { itemCount: sortOrder } :
      sortBy === 'totalValue' ? { totalValue: sortOrder } :
      { name: 'asc' };

    const locations = await this.prisma.location.findMany({
      where: whereClause,
      include: {
        parent: {
          select: {
            name: true,
          },
        },
        _count: {
          select: {
            children: true,
            items: {
              where: {
                status: { notIn: ['SOLD', 'LOST'] },
              },
            },
          },
        },
      },
      orderBy,
    });

    return { locations };
  }

  /**
   * Get location hierarchy tree
   * 
   * @param householdId - ID of the household
   * @param rootLocationId - Optional root location ID (if not provided, gets all root locations)
   * @param maxDepth - Maximum depth to traverse
   * @returns Promise resolving to hierarchical location tree
   */
  async getLocationTree(
    householdId: string,
    rootLocationId?: string,
    maxDepth: number = 5
  ): Promise<Array<Location & {
    children?: Array<Location & { children?: any }>;
    itemCount: number;
  }>> {
    const buildTree = async (parentId: string | null, currentDepth: number): Promise<any[]> => {
      if (currentDepth >= maxDepth) return [];
      
      const locations = await this.prisma.location.findMany({
        where: {
          householdId,
          parentId,
        },
        orderBy: { name: 'asc' },
      });
      
      const locationsWithChildren = await Promise.all(
        locations.map(async (location) => {
          const children = await buildTree(location.id, currentDepth + 1);
          return {
            ...location,
            children: children.length > 0 ? children : undefined,
          };
        })
      );
      
      return locationsWithChildren;
    };
    
    return await buildTree(rootLocationId || null, 0);
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
   * Validate location type hierarchy rules
   */
  private async validateLocationTypeHierarchy(
    parentType: LocationType,
    childType: LocationType
  ): Promise<void> {
    const validHierarchies: Record<LocationType, LocationType[]> = {
      [LocationType.BUILDING]: [LocationType.ROOM, LocationType.AREA],
      [LocationType.ROOM]: [LocationType.FURNITURE, LocationType.CONTAINER, LocationType.AREA],
      [LocationType.FURNITURE]: [LocationType.CONTAINER],
      [LocationType.CONTAINER]: [LocationType.CONTAINER], // Nested containers allowed
      [LocationType.AREA]: [LocationType.FURNITURE, LocationType.CONTAINER],
    };
    
    const allowedChildren = validHierarchies[parentType];
    if (!allowedChildren || !allowedChildren.includes(childType)) {
      throw new Error(`Invalid location type hierarchy: ${childType} cannot be a child of ${parentType}`);
    }
  }

  /**
   * Validate that a location move is allowed
   */
  private async validateLocationMove(
    tx: Prisma.TransactionClient,
    locationId: string,
    householdId: string,
    newParentId: string | null | undefined
  ): Promise<void> {
    const location = await this.validateLocationAccess(tx, householdId, locationId);
    
    // If setting a new parent
    if (newParentId) {
      const newParent = await this.validateLocationAccess(tx, householdId, newParentId);
      
      // Prevent circular references
      if (await this.wouldCreateCircularReference(tx, locationId, newParentId)) {
        throw new Error('Cannot move location: would create circular reference');
      }
      
      // Validate type hierarchy
      await this.validateLocationTypeHierarchy(newParent.locationType, location.locationType);
      
      // Check depth limits
      if (newParent.level + 1 > 10) {
        throw new Error('Maximum location hierarchy depth (10 levels) would be exceeded');
      }
    }
  }

  /**
   * Check if a move would create a circular reference
   */
  private async wouldCreateCircularReference(
    tx: Prisma.TransactionClient,
    locationId: string,
    newParentId: string
  ): Promise<boolean> {
    // If trying to set a location as its own parent
    if (locationId === newParentId) {
      return true;
    }
    
    // Check if newParentId is a descendant of locationId
    let currentParentId = newParentId;
    while (currentParentId) {
      const parent = await tx.location.findUnique({
        where: { id: currentParentId },
        select: { parentId: true },
      });
      
      if (!parent) break;
      
      if (parent.parentId === locationId) {
        return true;
      }
      
      if (!parent.parentId) break;
      currentParentId = parent.parentId;
    }
    
    return false;
  }

  /**
   * Update location paths after hierarchy changes
   */
  private async updateLocationPaths(
    tx: Prisma.TransactionClient,
    locationId: string
  ): Promise<void> {
    // Get the location with its parent
    const location = await tx.location.findUniqueOrThrow({
      where: { id: locationId },
      include: { parent: true },
    });
    
    // Compute new path
    const newPath = location.parent 
      ? `${location.parent.path} → ${location.name}`
      : location.name;
    
    const newLevel = location.parent ? location.parent.level + 1 : 0;
    
    // Update this location
    await tx.location.update({
      where: { id: locationId },
      data: {
        path: newPath,
        level: newLevel,
      },
    });
    
    // Recursively update all children
    const children = await tx.location.findMany({
      where: { parentId: locationId },
    });
    
    for (const child of children) {
      await this.updateLocationPaths(tx, child.id);
    }
  }

  /**
   * Log location activity for audit trail
   */
  private async logLocationActivity(
    tx: Prisma.TransactionClient,
    locationId: string,
    userId: string,
    action: string,
    metadata?: Record<string, any>
  ) {
    // In a real implementation, this would write to an audit log table
    console.log('Location Activity:', {
      locationId,
      userId,
      action,
      metadata,
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * Singleton instance of LocationsService
 */
export const locationsService = new LocationsService(new PrismaClient());