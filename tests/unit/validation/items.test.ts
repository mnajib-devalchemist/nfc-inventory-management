/**
 * @jest-environment node
 */

import {
  CreateItemSchema,
  UpdateItemSchema,
  SearchItemsSchema,
  BorrowItemSchema,
  ReturnItemSchema,
} from '@/lib/validation/items';
import { ItemStatus } from '@prisma/client';

describe('Item Validation Schemas', () => {
  describe('CreateItemSchema', () => {
    const validItemData = {
      name: 'Test Item',
      description: 'A test item',
      locationId: '123e4567-e89b-12d3-a456-426614174000',
      quantity: 1,
      unit: 'piece',
      purchasePrice: 99.99,
      currentValue: 89.99,
      purchaseDate: '2024-01-15T00:00:00.000Z',
      metadata: { color: 'red', brand: 'TestBrand' },
    };

    it('should validate a complete valid item', () => {
      const result = CreateItemSchema.safeParse(validItemData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('Test Item');
        expect(result.data.locationId).toBe(validItemData.locationId);
        expect(result.data.quantity).toBe(1);
      }
    });

    it('should validate minimal required fields', () => {
      const minimalData = {
        name: 'Test Item',
        locationId: '123e4567-e89b-12d3-a456-426614174000',
      };

      const result = CreateItemSchema.safeParse(minimalData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.quantity).toBe(1); // Default value
        expect(result.data.unit).toBe('piece'); // Default value
      }
    });

    it('should reject empty name', () => {
      const invalidData = { ...validItemData, name: '' };
      const result = CreateItemSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('required');
      }
    });

    it('should reject name longer than 200 characters', () => {
      const invalidData = { ...validItemData, name: 'a'.repeat(201) };
      const result = CreateItemSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('200 characters');
      }
    });

    it('should reject invalid UUID for locationId', () => {
      const invalidData = { ...validItemData, locationId: 'invalid-uuid' };
      const result = CreateItemSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('UUID');
      }
    });

    it('should reject negative quantity', () => {
      const invalidData = { ...validItemData, quantity: -1 };
      const result = CreateItemSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('greater than 0');
      }
    });

    it('should reject zero quantity', () => {
      const invalidData = { ...validItemData, quantity: 0 };
      const result = CreateItemSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('greater than 0');
      }
    });

    it('should reject negative prices', () => {
      const invalidData = { ...validItemData, purchasePrice: -10 };
      const result = CreateItemSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('greater than 0');
      }
    });

    it('should reject zero prices', () => {
      const invalidData = { ...validItemData, purchasePrice: 0 };
      const result = CreateItemSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('greater than 0');
      }
    });

    it('should reject unit longer than 20 characters', () => {
      const invalidData = { ...validItemData, unit: 'a'.repeat(21) };
      const result = CreateItemSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('20 characters');
      }
    });

    it('should validate valid purchase date formats', () => {
      const testDates = ['2024-01-15T00:00:00.000Z', '2024-12-31T12:30:45.123Z', '2020-02-29T08:15:30.000Z'];
      
      testDates.forEach(date => {
        const testData = { ...validItemData, purchaseDate: date };
        const result = CreateItemSchema.safeParse(testData);
        expect(result.success).toBe(true);
      });
    });

    it('should reject invalid purchase date formats', () => {
      const invalidDates = ['15-01-2024', '2024/01/15', 'invalid-date', '2024-01-15'];
      
      invalidDates.forEach(date => {
        const testData = { ...validItemData, purchaseDate: date };
        const result = CreateItemSchema.safeParse(testData);
        expect(result.success).toBe(false);
      });
    });
  });

  describe('UpdateItemSchema', () => {
    it('should allow partial updates', () => {
      const updateData = {
        name: 'Updated Item',
        quantity: 5,
      };

      const result = UpdateItemSchema.safeParse(updateData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('Updated Item');
        expect(result.data.quantity).toBe(5);
        expect(result.data.description).toBeUndefined();
      }
    });

    it('should validate all fields when provided', () => {
      const updateData = {
        name: 'Updated Item',
        description: 'Updated description',
        status: ItemStatus.MAINTENANCE,
        quantity: 3,
        currentValue: 75.50,
        metadata: { updated: true },
      };

      const result = UpdateItemSchema.safeParse(updateData);
      expect(result.success).toBe(true);
    });

    it('should reject invalid enum values', () => {
      const updateData = {
        status: 'INVALID_STATUS',
      };

      const result = UpdateItemSchema.safeParse(updateData);
      expect(result.success).toBe(false);
    });
  });

  describe('SearchItemsSchema', () => {
    it('should validate basic search parameters', () => {
      const searchData = {
        query: 'test item',
        status: ItemStatus.AVAILABLE,
        locationId: '123e4567-e89b-12d3-a456-426614174000',
        page: 1,
        limit: 20,
      };

      const result = SearchItemsSchema.safeParse(searchData);
      expect(result.success).toBe(true);
    });

    it('should apply default values', () => {
      const searchData = {};

      const result = SearchItemsSchema.safeParse(searchData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.page).toBe(1);
        expect(result.data.limit).toBe(20);
        expect(result.data.sortBy).toBe('name');
        expect(result.data.sortOrder).toBe('asc');
      }
    });

    it('should reject page less than 1', () => {
      const searchData = { page: 0 };
      const result = SearchItemsSchema.safeParse(searchData);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('greater than 0');
      }
    });

    it('should reject limit greater than 100', () => {
      const searchData = { limit: 101 };
      const result = SearchItemsSchema.safeParse(searchData);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('more than 100');
      }
    });

    it('should validate sort parameters', () => {
      const validSortFields = ['name', 'createdAt', 'updatedAt', 'currentValue', 'purchaseDate'];
      const validSortOrders = ['asc', 'desc'];

      validSortFields.forEach(sortBy => {
        validSortOrders.forEach(sortOrder => {
          const searchData = { sortBy, sortOrder };
          const result = SearchItemsSchema.safeParse(searchData);
          expect(result.success).toBe(true);
        });
      });
    });

    it('should validate price range filters', () => {
      const searchData = {
        minValue: 10,
        maxValue: 100,
      };

      const result = SearchItemsSchema.safeParse(searchData);
      expect(result.success).toBe(true);
    });

    it('should reject negative price ranges', () => {
      const searchData = { minValue: -10 };
      const result = SearchItemsSchema.safeParse(searchData);
      expect(result.success).toBe(false);
    });
  });

  describe('BorrowItemSchema', () => {
    it('should validate borrow request with future date', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      const borrowData = {
        borrowerId: '123e4567-e89b-12d3-a456-426614174000',
        borrowedUntil: tomorrow.toISOString(),
      };

      const result = BorrowItemSchema.safeParse(borrowData);
      expect(result.success).toBe(true);
    });

    it('should validate borrow request without return date', () => {
      const borrowData = {
        borrowerId: '123e4567-e89b-12d3-a456-426614174000',
      };

      const result = BorrowItemSchema.safeParse(borrowData);
      expect(result.success).toBe(true);
    });

    it('should reject past dates for borrowedUntil', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const borrowData = {
        borrowerId: '123e4567-e89b-12d3-a456-426614174000',
        borrowedUntil: yesterday.toISOString(),
      };

      const result = BorrowItemSchema.safeParse(borrowData);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('future');
      }
    });

    it('should require borrowerId', () => {
      const borrowData = {
        borrowedUntil: new Date().toISOString(),
      };

      const result = BorrowItemSchema.safeParse(borrowData);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('Required');
      }
    });
  });

  describe('ReturnItemSchema', () => {
    it('should validate return with good condition', () => {
      const returnData = {
        condition: 'GOOD' as const,
        notes: 'Returned in good condition',
      };

      const result = ReturnItemSchema.safeParse(returnData);
      expect(result.success).toBe(true);
    });

    it('should validate return with maintenance needed', () => {
      const returnData = {
        condition: 'NEEDS_MAINTENANCE' as const,
        notes: 'Screen is cracked',
      };

      const result = ReturnItemSchema.safeParse(returnData);
      expect(result.success).toBe(true);
    });

    it('should validate return with damage', () => {
      const returnData = {
        condition: 'DAMAGED' as const,
        notes: 'Significant water damage',
      };

      const result = ReturnItemSchema.safeParse(returnData);
      expect(result.success).toBe(true);
    });

    it('should allow empty return data', () => {
      const returnData = {};

      const result = ReturnItemSchema.safeParse(returnData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.condition).toBeUndefined(); // No default value
      }
    });

    it('should reject invalid condition values', () => {
      const returnData = {
        condition: 'INVALID_CONDITION',
      };

      const result = ReturnItemSchema.safeParse(returnData);
      expect(result.success).toBe(false);
    });

    it('should reject notes longer than 500 characters', () => {
      const returnData = {
        notes: 'a'.repeat(501),
      };

      const result = ReturnItemSchema.safeParse(returnData);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('500 characters');
      }
    });
  });
});