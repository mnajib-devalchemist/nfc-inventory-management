import { z } from 'zod';
import { LocationType } from '@prisma/client';

/**
 * Validation schemas for location-related operations
 * These schemas enforce business rules and hierarchical data integrity
 */

/**
 * Schema for creating a new location
 */
export const CreateLocationSchema = z.object({
  name: z
    .string()
    .min(1, 'Location name is required')
    .max(100, 'Location name must be 100 characters or less')
    .trim(),
  
  description: z
    .string()
    .max(500, 'Description must be 500 characters or less')
    .trim()
    .optional(),
  
  parentId: z
    .string()
    .uuid('Parent location ID must be a valid UUID')
    .optional(),
  
  locationType: z
    .enum([
      LocationType.BUILDING,
      LocationType.ROOM,
      LocationType.FURNITURE,
      LocationType.CONTAINER,
      LocationType.AREA,
    ])
    .default(LocationType.ROOM),
});

/**
 * Schema for updating an existing location
 */
export const UpdateLocationSchema = z.object({
  name: z
    .string()
    .min(1, 'Location name is required')
    .max(100, 'Location name must be 100 characters or less')
    .trim()
    .optional(),
  
  description: z
    .string()
    .max(500, 'Description must be 500 characters or less')
    .trim()
    .optional(),
  
  parentId: z
    .string()
    .uuid('Parent location ID must be a valid UUID')
    .optional(),
  
  locationType: z
    .enum([
      LocationType.BUILDING,
      LocationType.ROOM,
      LocationType.FURNITURE,
      LocationType.CONTAINER,
      LocationType.AREA,
    ])
    .optional(),
});

/**
 * Schema for moving a location (changing its parent)
 */
export const MoveLocationSchema = z.object({
  newParentId: z
    .string()
    .uuid('New parent location ID must be a valid UUID')
    .nullable()
    .optional(),
});

/**
 * Schema for searching/filtering locations
 */
export const SearchLocationsSchema = z.object({
  query: z
    .string()
    .max(500, 'Search query must be 500 characters or less')
    .trim()
    .optional(),
  
  parentId: z
    .string()
    .uuid('Parent location ID must be a valid UUID')
    .optional(),
  
  locationType: z
    .enum([
      LocationType.BUILDING,
      LocationType.ROOM,
      LocationType.FURNITURE,
      LocationType.CONTAINER,
      LocationType.AREA,
    ])
    .optional(),
  
  includeEmpty: z
    .boolean()
    .default(true)
    .optional(),
  
  minLevel: z
    .number()
    .int('Minimum level must be a whole number')
    .min(0, 'Minimum level cannot be negative')
    .optional(),
  
  maxLevel: z
    .number()
    .int('Maximum level must be a whole number')
    .min(0, 'Maximum level cannot be negative')
    .max(10, 'Maximum level cannot exceed 10')
    .optional(),
  
  sortBy: z
    .enum(['name', 'path', 'createdAt', 'itemCount', 'totalValue'])
    .default('name'),
  
  sortOrder: z
    .enum(['asc', 'desc'])
    .default('asc'),
}).refine((data) => {
  // Ensure minLevel is less than maxLevel if both are provided
  if (data.minLevel !== undefined && data.maxLevel !== undefined) {
    return data.minLevel <= data.maxLevel;
  }
  return true;
}, {
  message: 'Minimum level must be less than or equal to maximum level',
  path: ['minLevel'],
});

/**
 * Schema for location statistics query
 */
export const LocationStatsSchema = z.object({
  locationId: z
    .string()
    .uuid('Location ID must be a valid UUID'),
  
  includeChildren: z
    .boolean()
    .default(false),
  
  dateRange: z
    .object({
      start: z
        .string()
        .datetime('Start date must be a valid date'),
      end: z
        .string()
        .datetime('End date must be a valid date'),
    })
    .optional()
    .refine((data) => {
      if (data) {
        const start = new Date(data.start);
        const end = new Date(data.end);
        return start < end;
      }
      return true;
    }, {
      message: 'Start date must be before end date',
      path: ['start'],
    }),
});

/**
 * Schema for bulk location operations
 */
export const BulkLocationOperationSchema = z.object({
  locationIds: z
    .array(z.string().uuid('Location ID must be a valid UUID'))
    .min(1, 'At least one location ID is required')
    .max(20, 'Cannot perform bulk operations on more than 20 locations'),
  
  operation: z
    .enum(['DELETE', 'MOVE', 'UPDATE_TYPE']),
  
  data: z
    .record(z.unknown())
    .optional(),
});

/**
 * Schema for location hierarchy validation
 */
export const LocationHierarchySchema = z.object({
  locationId: z
    .string()
    .uuid('Location ID must be a valid UUID'),
  
  parentId: z
    .string()
    .uuid('Parent location ID must be a valid UUID')
    .optional(),
}).refine(async (data) => {
  // Prevent circular references - this would be validated in the service layer
  // with actual database lookups
  return data.locationId !== data.parentId;
}, {
  message: 'A location cannot be its own parent',
  path: ['parentId'],
});

/**
 * Schema for location path validation
 */
export const LocationPathSchema = z.object({
  path: z
    .string()
    .min(1, 'Location path is required')
    .max(500, 'Location path must be 500 characters or less')
    .regex(/^[^→]*(?:[ ]*→[ ]*[^→]*)*$/, 'Invalid path format'),
  
  level: z
    .number()
    .int('Level must be a whole number')
    .min(0, 'Level cannot be negative')
    .max(10, 'Level cannot exceed 10'),
});

/**
 * Schema for location tree structure
 */
export const LocationTreeSchema = z.object({
  includeItems: z
    .boolean()
    .default(false),
  
  includeStats: z
    .boolean()
    .default(false),
  
  maxDepth: z
    .number()
    .int('Max depth must be a whole number')
    .min(1, 'Max depth must be at least 1')
    .max(10, 'Max depth cannot exceed 10')
    .default(5),
  
  rootLocationId: z
    .string()
    .uuid('Root location ID must be a valid UUID')
    .optional(),
});

/**
 * Business rule validation schemas
 */

/**
 * Schema for validating location type hierarchy rules
 */
export const LocationTypeHierarchySchema = z.object({
  parentType: z
    .enum([
      LocationType.BUILDING,
      LocationType.ROOM,
      LocationType.FURNITURE,
      LocationType.CONTAINER,
      LocationType.AREA,
    ])
    .optional(),
  
  childType: z
    .enum([
      LocationType.BUILDING,
      LocationType.ROOM,
      LocationType.FURNITURE,
      LocationType.CONTAINER,
      LocationType.AREA,
    ]),
}).refine((data) => {
  // Define valid parent-child type relationships
  const validHierarchies: Record<LocationType, LocationType[]> = {
    [LocationType.BUILDING]: [LocationType.ROOM, LocationType.AREA],
    [LocationType.ROOM]: [LocationType.FURNITURE, LocationType.CONTAINER, LocationType.AREA],
    [LocationType.FURNITURE]: [LocationType.CONTAINER],
    [LocationType.CONTAINER]: [LocationType.CONTAINER], // Nested containers allowed
    [LocationType.AREA]: [LocationType.FURNITURE, LocationType.CONTAINER],
  };
  
  if (!data.parentType) {
    // Root level - only buildings and rooms allowed
    return data.childType === LocationType.BUILDING || data.childType === LocationType.ROOM;
  }
  
  const allowedChildren = validHierarchies[data.parentType];
  if (!allowedChildren) return false;
  
  return allowedChildren.includes(data.childType);
}, {
  message: 'Invalid location type hierarchy',
  path: ['childType'],
});

/**
 * Type exports for use in API routes and services
 */
export type CreateLocationInput = z.infer<typeof CreateLocationSchema>;
export type UpdateLocationInput = z.infer<typeof UpdateLocationSchema>;
export type MoveLocationInput = z.infer<typeof MoveLocationSchema>;
export type SearchLocationsInput = z.infer<typeof SearchLocationsSchema>;
export type LocationStatsInput = z.infer<typeof LocationStatsSchema>;
export type BulkLocationOperationInput = z.infer<typeof BulkLocationOperationSchema>;
export type LocationHierarchyInput = z.infer<typeof LocationHierarchySchema>;
export type LocationPathInput = z.infer<typeof LocationPathSchema>;
export type LocationTreeInput = z.infer<typeof LocationTreeSchema>;
export type LocationTypeHierarchyInput = z.infer<typeof LocationTypeHierarchySchema>;

/**
 * Validation helper functions
 */
export const validateCreateLocation = (data: unknown) => CreateLocationSchema.parse(data);
export const validateUpdateLocation = (data: unknown) => UpdateLocationSchema.parse(data);
export const validateMoveLocation = (data: unknown) => MoveLocationSchema.parse(data);
export const validateSearchLocations = (data: unknown) => SearchLocationsSchema.parse(data);
export const validateLocationStats = (data: unknown) => LocationStatsSchema.parse(data);
export const validateBulkLocationOperation = (data: unknown) => BulkLocationOperationSchema.parse(data);
export const validateLocationHierarchy = (data: unknown) => LocationHierarchySchema.parse(data);
export const validateLocationPath = (data: unknown) => LocationPathSchema.parse(data);
export const validateLocationTree = (data: unknown) => LocationTreeSchema.parse(data);
export const validateLocationTypeHierarchy = (data: unknown) => LocationTypeHierarchySchema.parse(data);

/**
 * Constants for location validation
 */
export const LOCATION_CONSTANTS = {
  MAX_NAME_LENGTH: 100,
  MAX_DESCRIPTION_LENGTH: 500,
  MAX_PATH_LENGTH: 500,
  MAX_HIERARCHY_DEPTH: 10,
  MAX_BULK_OPERATIONS: 20,
  PATH_SEPARATOR: ' → ',
} as const;