# Coding Standards

## Overview

This document establishes comprehensive coding standards for the NFC-Enabled Digital Inventory Management System, ensuring consistency, maintainability, and optimal AI agent implementation.

## General Principles

### **1. Code Quality Hierarchy**
1. **Correctness** - Code must work as intended
2. **Readability** - Code should be self-documenting  
3. **Maintainability** - Easy to modify and extend
4. **Performance** - Efficient resource usage
5. **Consistency** - Follow established patterns

### **2. AI Agent Optimization**
- **Explicit over Implicit** - Clear, obvious code patterns
- **Single Responsibility** - One concern per function/class
- **Predictable Structure** - Consistent file and function organization
- **Clear Dependencies** - Obvious import/export relationships
- **Type Safety** - Comprehensive TypeScript usage

## File and Directory Naming

### **File Naming Conventions**

| File Type | Convention | Example |
|-----------|------------|---------|
| React Components | PascalCase | `ItemCard.tsx`, `SearchBar.tsx` |
| Pages (Next.js) | kebab-case dirs + `page.tsx` | `inventory/page.tsx`, `search/results/page.tsx` |
| API Routes | kebab-case dirs + `route.ts` | `api/v1/items/route.ts` |
| Services | camelCase | `itemsService.ts`, `searchService.ts` |
| Utilities | camelCase | `dateUtils.ts`, `formatUtils.ts` |
| Types | camelCase + Type suffix | `itemTypes.ts`, `apiTypes.ts` |
| Hooks | camelCase + use prefix | `useItems.ts`, `useSearch.ts` |
| Constants | camelCase files, SCREAMING_SNAKE_CASE values | `apiConstants.ts` |

### **Directory Structure Rules**
- **Feature-based grouping**: Group by business domain, not technical layer
- **Barrel exports**: Each feature directory has an `index.ts`
- **Flat when possible**: Avoid unnecessary nesting
- **Clear boundaries**: Easy to understand module relationships

## TypeScript Standards

### **Type Definitions**

```typescript
// ✅ Good: Explicit, descriptive types
interface CreateItemRequest {
  name: string;
  description?: string;
  locationId: string;
  quantity: number;
  value?: number;
  tags: string[];
}

interface ItemWithDetails extends Item {
  location: Location;
  photos: Photo[];
  tags: Tag[];
}

// ❌ Avoid: Vague or overly generic types
interface Data {
  stuff: any;
  things: Record<string, unknown>;
}
```

### **Enum Usage**
```typescript
// ✅ Prefer string enums for better debugging
enum ItemStatus {
  AVAILABLE = 'available',
  BORROWED = 'borrowed',  
  MAINTENANCE = 'maintenance',
  LOST = 'lost',
  SOLD = 'sold',
}

// ✅ For constants that don't change
const SEARCH_LIMITS = {
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
  MAX_SEARCH_LENGTH: 500,
} as const;
```

### **Function Signatures**
```typescript
// ✅ Good: Clear, typed parameters and return values
async function createItem(
  userId: string,
  data: CreateItemRequest
): Promise<Item> {
  // Implementation
}

// ✅ Good: Use branded types for IDs
type UserId = string & { __brand: 'UserId' };
type ItemId = string & { __brand: 'ItemId' };

async function borrowItem(
  itemId: ItemId,
  borrowerId: UserId,
  duration?: number
): Promise<void> {
  // Implementation  
}
```

## React Component Standards

### **Component Structure**
```typescript
// ✅ Standard component structure
import React from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useItems } from '@/lib/hooks/useItems';
import { Item } from '@/lib/types/items';

interface ItemCardProps {
  item: Item;
  onEdit?: (item: Item) => void;
  onDelete?: (itemId: string) => void;
  showActions?: boolean;
  className?: string;
}

export function ItemCard({
  item,
  onEdit,
  onDelete,
  showActions = true,
  className,
}: ItemCardProps) {
  // Hooks at the top
  const { updateItem, deleteItem } = useItems();

  // Event handlers
  const handleEdit = () => {
    onEdit?.(item);
  };

  const handleDelete = async () => {
    try {
      await deleteItem(item.id);
      onDelete?.(item.id);
    } catch (error) {
      console.error('Failed to delete item:', error);
    }
  };

  // Render
  return (
    <Card className={className}>
      {/* Component JSX */}
    </Card>
  );
}
```

### **Hook Guidelines**
```typescript
// ✅ Good: Custom hook with clear responsibility
export function useItems(householdId?: string) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createItem = useCallback(async (data: CreateItemRequest) => {
    setLoading(true);
    setError(null);
    
    try {
      const newItem = await itemsService.createItem(data);
      setItems(prev => [...prev, newItem]);
      return newItem;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create item');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    items,
    loading,
    error,
    createItem,
    // ... other methods
  };
}
```

## API Route Standards

### **Route Structure**
```typescript
// ✅ Standard API route structure
import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { itemsService } from '@/lib/services';
import { CreateItemSchema } from '@/lib/validation/items';
import { rateLimitMiddleware } from '@/lib/middleware/rateLimit';

export async function GET(request: NextRequest) {
  try {
    // 1. Authentication
    const session = await auth();
    if (!session?.user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Rate limiting
    const rateLimitResult = await rateLimitMiddleware(session.user.id);
    if (!rateLimitResult.success) {
      return Response.json({ error: 'Rate limit exceeded' }, { status: 429 });
    }

    // 3. Extract and validate parameters
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q') || '';
    const page = parseInt(searchParams.get('page') || '1', 10);

    // 4. Business logic
    const items = await itemsService.searchItems({
      userId: session.user.id,
      query,
      page,
      limit: 20,
    });

    // 5. Response
    return Response.json({
      data: items,
      meta: {
        timestamp: new Date().toISOString(),
        version: 'v1',
      },
    });
  } catch (error) {
    console.error('API Error:', error);
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // 1. Authentication
    const session = await auth();
    if (!session?.user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Parse and validate request body
    const body = await request.json();
    const validatedData = CreateItemSchema.parse(body);

    // 3. Business logic
    const item = await itemsService.createItem(session.user.id, validatedData);

    // 4. Response
    return Response.json(
      { data: item },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }

    console.error('API Error:', error);
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

## Service Layer Standards

### **Service Class Structure**
```typescript
// ✅ Standard service structure
import { prisma } from '@/lib/db';
import { CreateItemInput, UpdateItemInput, SearchQuery } from '@/lib/types/items';

export class ItemsService {
  // Public methods first, private methods last
  async createItem(userId: string, data: CreateItemInput): Promise<Item> {
    return await this.executeWithTransaction(async (tx) => {
      // 1. Validation
      await this.validateUserPermissions(tx, userId, data.locationId);
      
      // 2. Business logic
      const item = await this.createItemInDatabase(tx, userId, data);
      
      // 3. Side effects
      await this.updateLocationStats(tx, data.locationId);
      await this.createActivityLog(tx, userId, 'item_created', item);
      
      return item;
    });
  }

  async searchItems(query: SearchQuery): Promise<SearchResults> {
    // 1. Log search for analytics
    await this.logSearchQuery(query);
    
    // 2. Execute search
    const results = await this.executeSearch(query);
    
    // 3. Update search patterns
    await this.updateSearchPatterns(query, results);
    
    return results;
  }

  // Private helper methods
  private async executeWithTransaction<T>(
    operation: (tx: PrismaTransactionClient) => Promise<T>
  ): Promise<T> {
    return await prisma.$transaction(operation);
  }

  private async validateUserPermissions(
    tx: PrismaTransactionClient,
    userId: string,
    locationId: string
  ): Promise<void> {
    const hasPermission = await this.checkLocationAccess(tx, userId, locationId);
    if (!hasPermission) {
      throw new Error('Insufficient permissions');
    }
  }

  // ... other private methods
}

// Export singleton instance
export const itemsService = new ItemsService();
```

## Error Handling Standards

### **Error Types and Handling**
```typescript
// ✅ Custom error types
export class ValidationError extends Error {
  constructor(message: string, public field: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class PermissionError extends Error {
  constructor(message: string = 'Insufficient permissions') {
    super(message);
    this.name = 'PermissionError';
  }
}

export class NotFoundError extends Error {
  constructor(resource: string, id: string) {
    super(`${resource} with id ${id} not found`);
    this.name = 'NotFoundError';
  }
}

// ✅ Error handling in services
async function findItemById(id: string): Promise<Item> {
  const item = await prisma.item.findUnique({ where: { id } });
  
  if (!item) {
    throw new NotFoundError('Item', id);
  }
  
  return item;
}

// ✅ Error handling in API routes
export async function GET(request: NextRequest) {
  try {
    const items = await itemsService.getItems();
    return Response.json({ data: items });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    
    if (error instanceof PermissionError) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    
    console.error('Unexpected error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

## Database Standards

### **Prisma Query Patterns**
```typescript
// ✅ Good: Explicit includes and selects
async function getItemWithDetails(id: string): Promise<ItemWithDetails> {
  return await prisma.item.findUniqueOrThrow({
    where: { id },
    include: {
      location: {
        select: {
          id: true,
          name: true,
          path: true,
        },
      },
      photos: {
        select: {
          id: true,
          thumbnailUrl: true,
          isPrimary: true,
        },
        orderBy: { isPrimary: 'desc' },
        take: 5,
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
}

// ✅ Good: Pagination with proper limits
async function getItemsPaginated(
  page: number,
  limit: number = 20
): Promise<PaginatedItems> {
  const skip = (page - 1) * Math.min(limit, 100); // Max 100 items per page
  
  const [items, totalCount] = await Promise.all([
    prisma.item.findMany({
      skip,
      take: Math.min(limit, 100),
      orderBy: { createdAt: 'desc' },
      include: {
        location: { select: { name: true, path: true } },
        photos: { 
          select: { thumbnailUrl: true },
          where: { isPrimary: true },
          take: 1,
        },
      },
    }),
    prisma.item.count(),
  ]);

  return {
    items,
    pagination: {
      page,
      limit,
      totalCount,
      totalPages: Math.ceil(totalCount / limit),
    },
  };
}
```

## Testing Standards

### **Unit Test Structure**
```typescript
// ✅ Standard test structure
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { itemsService } from '@/lib/services/items';
import { prisma } from '@/lib/db';

// Mock Prisma
jest.mock('@/lib/db', () => ({
  prisma: {
    item: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

describe('ItemsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.$transaction.mockImplementation((callback) => callback(mockPrisma));
  });

  describe('createItem', () => {
    it('should create item with valid data', async () => {
      // Arrange
      const userId = 'user-123';
      const itemData = {
        name: 'Power Drill',
        description: 'Cordless power drill',
        locationId: 'location-123',
        quantity: 1,
      };

      mockPrisma.item.create.mockResolvedValue({
        id: 'item-123',
        ...itemData,
        userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      // Act
      const result = await itemsService.createItem(userId, itemData);

      // Assert
      expect(result.id).toBe('item-123');
      expect(result.name).toBe('Power Drill');
      expect(mockPrisma.item.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'Power Drill',
          userId,
        }),
      });
    });

    it('should throw error for invalid data', async () => {
      // Arrange
      const userId = 'user-123';
      const invalidData = {
        name: '', // Invalid: empty name
        locationId: 'location-123',
      };

      // Act & Assert
      await expect(
        itemsService.createItem(userId, invalidData as any)
      ).rejects.toThrow('Invalid item data');
    });
  });
});
```

## Documentation Standards - JSDoc Requirements

**CRITICAL**: All public functions, interfaces, classes, and components MUST have comprehensive JSDoc comments. This is mandatory for AI agent development.

### **MANDATORY JSDoc Requirements**

1. **All Public Functions** - Must have complete JSDoc with @param, @returns, @throws
2. **All Public Interfaces** - Must document each property with examples
3. **All React Components** - Must have @component, @param for props, @example usage
4. **All API Routes** - Must document @route, @access, parameters, response format, error codes
5. **All Service Classes** - Must have @class documentation and method documentation
6. **All Custom Hooks** - Must document parameters, return values, and usage examples
7. **All Utility Functions** - Must have clear descriptions and usage examples

### **JSDoc Examples**

#### Public Function Documentation
```typescript
/**
 * Creates a new inventory item for the specified user with comprehensive validation.
 * 
 * This function handles the complete item creation workflow including permission
 * validation, database transaction management, and activity logging.
 * 
 * @param userId - The unique identifier of the user creating the item
 * @param data - The item data containing name, description, location, etc.
 * @returns Promise that resolves to the newly created item with all metadata
 * @throws {ValidationError} When the provided item data fails validation
 * @throws {PermissionError} When the user lacks permission to create items in the specified location
 * @throws {NotFoundError} When the specified location does not exist
 * 
 * @example Basic item creation
 * ```typescript
 * const item = await createItem('user-123', {
 *   name: 'Power Drill',
 *   description: 'Cordless 18V power drill with battery',
 *   locationId: 'garage-workbench-001',
 *   quantity: 1,
 *   value: 159.99,
 *   tags: ['tools', 'power-tools']
 * });
 * console.log(`Created item: ${item.name} (ID: ${item.id})`);
 * ```
 * 
 * @since 1.0.0
 * @version 1.2.0 - Added support for batch tagging
 */
async function createItem(userId: string, data: CreateItemRequest): Promise<Item> {
  // Implementation
}
```

#### Interface Documentation
```typescript
/**
 * Represents the data required to create a new inventory item.
 * 
 * This interface defines the complete structure for item creation requests,
 * including all required fields, optional metadata, and validation constraints.
 * Used by the ItemsService.createItem() method and related API endpoints.
 * 
 * @interface CreateItemRequest
 * @category Data Transfer Objects
 * @since 1.0.0
 */
interface CreateItemRequest {
  /** 
   * The display name of the item (1-200 characters).
   * Must be unique within the user's inventory.
   * @example "Power Drill" 
   */
  name: string;
  
  /** 
   * UUID of the location where this item will be stored.
   * Must be a valid location that the user has access to.
   * @example "550e8400-e29b-41d4-a716-446655440000"
   */
  locationId: string;
  
  /** 
   * Number of items (must be positive integer).
   * @default 1
   * @minimum 1
   * @maximum 999999
   */
  quantity: number;
  
  /** 
   * Array of tag names for categorization and search (max 10 tags).
   * Each tag must be 1-50 characters, lowercase with hyphens.
   * @example ["tools", "power-tools", "cordless"]
   */
  tags: string[];
}
```

#### React Component Documentation
```typescript
/**
 * ItemCard - Displays an individual inventory item in a compact card format.
 * 
 * This component provides a visual representation of an inventory item with
 * photo thumbnail, name, location, and optional action buttons. Supports
 * optimistic updates for edit/delete operations and accessibility features.
 * 
 * @component
 * @category Inventory Components
 * @since 1.0.0
 * 
 * @param props - The component props
 * @param props.item - The inventory item data to display
 * @param props.onEdit - Optional callback when the edit button is clicked
 * @param props.onDelete - Optional callback when the delete action is confirmed
 * @param props.showActions - Whether to display edit/delete action buttons
 * @param props.className - Additional CSS classes for styling
 * 
 * @returns The rendered item card component
 * 
 * @example Basic usage
 * ```tsx
 * <ItemCard 
 *   item={drillItem} 
 *   onEdit={handleEditItem}
 *   onDelete={handleDeleteItem}
 * />
 * ```
 */
interface ItemCardProps {
  /** The inventory item to display */
  item: Item;
  
  /** 
   * Callback function invoked when the edit button is clicked.
   * Receives the item object as a parameter.
   */
  onEdit?: (item: Item) => void;
  
  /** 
   * Controls visibility of edit/delete action buttons.
   * @default true
   */
  showActions?: boolean;
}
```

#### API Route Documentation
```typescript
/**
 * GET /api/v1/items - Retrieves paginated list of inventory items for authenticated user.
 * 
 * This endpoint provides comprehensive item listing with support for pagination,
 * filtering, sorting, and search. Includes related data like location information
 * and photo thumbnails for optimal client-side rendering.
 * 
 * @route GET /api/v1/items
 * @access Private (requires authentication)
 * @since 1.0.0
 * @version 1.2.0 - Added search and filtering support
 * 
 * @param request - Next.js request object with query parameters
 * @returns Promise<Response> JSON response with items array and pagination metadata
 * 
 * @throws {401} Unauthorized - Missing or invalid authentication token
 * @throws {403} Forbidden - User lacks permission to access items
 * @throws {500} Internal Server Error - Unexpected server error
 */
export async function GET(request: NextRequest): Promise<Response> {
  // Implementation
}
```

### **JSDoc Style Guide**

- **Summary Line**: One sentence describing what the function/interface does
- **Description**: Detailed explanation of behavior, side effects, and business logic
- **Parameters**: Complete @param documentation with types and descriptions  
- **Return Values**: @returns with type and description of what is returned
- **Exceptions**: @throws for all possible error conditions
- **Examples**: @example blocks showing typical usage patterns
- **Versioning**: @since for initial version, @version for changes
- **Categories**: @category for grouping related items

## Import/Export Standards

### **Import Organization**
```typescript
// ✅ Organized imports
// 1. React and Next.js
import React, { useState, useCallback } from 'react';
import { NextRequest } from 'next/server';

// 2. Third-party libraries
import { z } from 'zod';
import { format } from 'date-fns';

// 3. Internal utilities (@ imports)
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

// 4. Relative imports
import { ItemCard } from './ItemCard';
import { useItems } from '../hooks/useItems';

// 5. Type-only imports last
import type { Item, CreateItemRequest } from '@/lib/types/items';
```

### **Export Patterns**
```typescript
// ✅ Named exports preferred over default exports
export { ItemCard } from './ItemCard';
export { ItemModal } from './ItemModal';
export { ItemForm } from './ItemForm';

// ✅ Barrel exports for clean imports
// components/inventory/index.ts
export * from './ItemCard';
export * from './ItemModal';
export * from './ItemForm';

// ✅ Service exports
export class ItemsService {
  // Implementation
}

export const itemsService = new ItemsService();

// ✅ Configuration exports
export const databaseConfig = {
  url: process.env.DATABASE_URL,
  pool: {
    min: 2,
    max: 10,
  },
} as const;
```

## Performance Standards

### **Optimization Guidelines**
```typescript
// ✅ Memoization for expensive calculations
const expensiveCalculation = useMemo(() => {
  return items.reduce((total, item) => total + (item.value || 0), 0);
}, [items]);

// ✅ Callback memoization for stable references
const handleItemSelect = useCallback((item: Item) => {
  onItemSelect?.(item);
  analytics.track('item_selected', { itemId: item.id });
}, [onItemSelect]);

// ✅ Lazy loading for large components
const ItemModal = lazy(() => import('./ItemModal'));

// ✅ Database query optimization
async function getItemsWithMinimalData(): Promise<ItemSummary[]> {
  return await prisma.item.findMany({
    select: {
      id: true,
      name: true,
      // Only select needed fields
      location: {
        select: { name: true }
      }
    },
    // Use proper indexing
    orderBy: { createdAt: 'desc' },
    take: 50, // Reasonable limits
  });
}
```

## Code Review Checklist

### **Before Submitting PR**
- [ ] All TypeScript errors resolved
- [ ] ESLint and Prettier checks pass
- [ ] All tests pass (unit, integration, e2e)
- [ ] No console.log statements (use proper logging)
- [ ] Error handling implemented
- [ ] Performance considerations addressed
- [ ] Security best practices followed
- [ ] Documentation updated if needed

### **Review Criteria**
- [ ] Code follows established patterns
- [ ] Single responsibility principle maintained
- [ ] Proper error handling and validation
- [ ] Appropriate test coverage
- [ ] No duplication of existing functionality
- [ ] Performance implications considered
- [ ] Security vulnerabilities addressed
- [ ] Accessibility requirements met

These coding standards ensure consistency, maintainability, and optimal AI agent implementation while maintaining high code quality throughout the development process.