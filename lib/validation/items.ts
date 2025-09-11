import { z } from 'zod';
import { ItemStatus } from '@prisma/client';

/**
 * Validation schemas for item-related operations
 * These schemas enforce business rules and data integrity
 */

/**
 * Schema for creating a new inventory item
 */
export const CreateItemSchema = z.object({
  name: z
    .string()
    .min(1, 'Item name is required')
    .max(200, 'Item name must be 200 characters or less')
    .trim(),
  
  description: z
    .string()
    .max(1000, 'Description must be 1000 characters or less')
    .trim()
    .optional(),
  
  locationId: z
    .string()
    .uuid('Location ID must be a valid UUID'),
  
  quantity: z
    .number()
    .int('Quantity must be a whole number')
    .positive('Quantity must be greater than 0')
    .max(999999, 'Quantity cannot exceed 999,999')
    .default(1),
  
  unit: z
    .string()
    .max(20, 'Unit must be 20 characters or less')
    .trim()
    .default('piece'),
  
  purchasePrice: z
    .number()
    .positive('Purchase price must be greater than 0')
    .max(999999.99, 'Purchase price cannot exceed $999,999.99')
    .optional()
    .transform((val) => val ? Number(val.toFixed(2)) : val),
  
  currentValue: z
    .number()
    .positive('Current value must be greater than 0')
    .max(999999.99, 'Current value cannot exceed $999,999.99')
    .optional()
    .transform((val) => val ? Number(val.toFixed(2)) : val),
  
  purchaseDate: z
    .string()
    .datetime('Purchase date must be a valid date')
    .optional()
    .transform((val) => val ? new Date(val) : val),
  
  metadata: z
    .record(z.unknown())
    .default({})
    .optional(),
});

/**
 * Schema for updating an existing inventory item
 */
export const UpdateItemSchema = z.object({
  name: z
    .string()
    .min(1, 'Item name is required')
    .max(200, 'Item name must be 200 characters or less')
    .trim()
    .optional(),
  
  description: z
    .string()
    .max(1000, 'Description must be 1000 characters or less')
    .trim()
    .optional(),
  
  locationId: z
    .string()
    .uuid('Location ID must be a valid UUID')
    .optional(),
  
  quantity: z
    .number()
    .int('Quantity must be a whole number')
    .positive('Quantity must be greater than 0')
    .max(999999, 'Quantity cannot exceed 999,999')
    .optional(),
  
  unit: z
    .string()
    .max(20, 'Unit must be 20 characters or less')
    .trim()
    .optional(),
  
  purchasePrice: z
    .number()
    .positive('Purchase price must be greater than 0')
    .max(999999.99, 'Purchase price cannot exceed $999,999.99')
    .optional()
    .transform((val) => val ? Number(val.toFixed(2)) : val),
  
  currentValue: z
    .number()
    .positive('Current value must be greater than 0')
    .max(999999.99, 'Current value cannot exceed $999,999.99')
    .optional()
    .transform((val) => val ? Number(val.toFixed(2)) : val),
  
  purchaseDate: z
    .string()
    .datetime('Purchase date must be a valid date')
    .optional()
    .transform((val) => val ? new Date(val) : val),
  
  status: z
    .enum([ItemStatus.AVAILABLE, ItemStatus.BORROWED, ItemStatus.MAINTENANCE, ItemStatus.LOST, ItemStatus.SOLD])
    .optional(),
  
  metadata: z
    .record(z.unknown())
    .optional(),
});

/**
 * Schema for borrowing an item
 */
export const BorrowItemSchema = z.object({
  borrowerId: z
    .string()
    .uuid('Borrower ID must be a valid UUID'),
  
  borrowedUntil: z
    .string()
    .datetime('Return date must be a valid date')
    .optional()
    .transform((val) => val ? new Date(val) : val),
}).refine((data) => {
  // Ensure return date is in the future if provided
  if (data.borrowedUntil) {
    return data.borrowedUntil > new Date();
  }
  return true;
}, {
  message: 'Return date must be in the future',
  path: ['borrowedUntil'],
});

/**
 * Schema for returning a borrowed item
 */
export const ReturnItemSchema = z.object({
  condition: z
    .enum(['GOOD', 'DAMAGED', 'NEEDS_MAINTENANCE'])
    .optional(),
  
  notes: z
    .string()
    .max(500, 'Notes must be 500 characters or less')
    .trim()
    .optional(),
});

/**
 * Schema for searching items
 */
export const SearchItemsSchema = z.object({
  query: z
    .string()
    .max(500, 'Search query must be 500 characters or less')
    .trim()
    .optional(),
  
  locationId: z
    .string()
    .uuid('Location ID must be a valid UUID')
    .optional(),
  
  status: z
    .enum([ItemStatus.AVAILABLE, ItemStatus.BORROWED, ItemStatus.MAINTENANCE, ItemStatus.LOST, ItemStatus.SOLD])
    .optional(),
  
  tags: z
    .array(z.string().uuid('Tag ID must be a valid UUID'))
    .max(10, 'Cannot filter by more than 10 tags')
    .optional(),
  
  minValue: z
    .number()
    .positive('Minimum value must be positive')
    .optional(),
  
  maxValue: z
    .number()
    .positive('Maximum value must be positive')
    .optional(),
  
  page: z
    .number()
    .int('Page must be a whole number')
    .positive('Page must be greater than 0')
    .default(1),
  
  limit: z
    .number()
    .int('Limit must be a whole number')
    .positive('Limit must be greater than 0')
    .max(100, 'Cannot request more than 100 items per page')
    .default(20),
  
  sortBy: z
    .enum(['name', 'createdAt', 'updatedAt', 'currentValue', 'purchaseDate'])
    .default('name'),
  
  sortOrder: z
    .enum(['asc', 'desc'])
    .default('asc'),
}).refine((data) => {
  // Ensure minValue is less than maxValue if both are provided
  if (data.minValue && data.maxValue) {
    return data.minValue < data.maxValue;
  }
  return true;
}, {
  message: 'Minimum value must be less than maximum value',
  path: ['minValue'],
});

/**
 * Schema for pagination parameters
 */
export const PaginationSchema = z.object({
  page: z
    .number()
    .int('Page must be a whole number')
    .positive('Page must be greater than 0')
    .default(1),
  
  limit: z
    .number()
    .int('Limit must be a whole number')
    .positive('Limit must be greater than 0')
    .max(100, 'Cannot request more than 100 items per page')
    .default(20),
});

/**
 * Schema for bulk operations on items
 */
export const BulkItemOperationSchema = z.object({
  itemIds: z
    .array(z.string().uuid('Item ID must be a valid UUID'))
    .min(1, 'At least one item ID is required')
    .max(50, 'Cannot perform bulk operations on more than 50 items'),
  
  operation: z
    .enum(['DELETE', 'UPDATE_STATUS', 'MOVE_LOCATION', 'ADD_TAGS', 'REMOVE_TAGS']),
  
  data: z
    .record(z.unknown())
    .optional(),
});

/**
 * Type exports for use in API routes and services
 */
export type CreateItemInput = z.infer<typeof CreateItemSchema>;
export type UpdateItemInput = z.infer<typeof UpdateItemSchema>;
export type BorrowItemInput = z.infer<typeof BorrowItemSchema>;
export type ReturnItemInput = z.infer<typeof ReturnItemSchema>;
export type SearchItemsInput = z.infer<typeof SearchItemsSchema>;
export type PaginationInput = z.infer<typeof PaginationSchema>;
export type BulkItemOperationInput = z.infer<typeof BulkItemOperationSchema>;

/**
 * Validation helper functions
 */
export const validateCreateItem = (data: unknown) => CreateItemSchema.parse(data);
export const validateUpdateItem = (data: unknown) => UpdateItemSchema.parse(data);
export const validateBorrowItem = (data: unknown) => BorrowItemSchema.parse(data);
export const validateReturnItem = (data: unknown) => ReturnItemSchema.parse(data);
export const validateSearchItems = (data: unknown) => SearchItemsSchema.parse(data);
export const validatePagination = (data: unknown) => PaginationSchema.parse(data);
export const validateBulkOperation = (data: unknown) => BulkItemOperationSchema.parse(data);