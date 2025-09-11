import { z } from 'zod';
import { ZodError } from 'zod';

/**
 * Common validation schemas and utilities
 * Shared across all validation modules
 */

/**
 * UUID validation schema with custom error message
 */
export const UUIDSchema = z
  .string()
  .uuid('Must be a valid UUID');

/**
 * Standard API response schema
 */
export const ApiResponseSchema = z.object({
  data: z.unknown().optional(),
  error: z.string().optional(),
  meta: z.object({
    timestamp: z.string().datetime(),
    version: z.string(),
    requestId: z.string().optional(),
  }),
});

/**
 * Error response schema
 */
export const ErrorResponseSchema = z.object({
  error: z.string(),
  message: z.string(),
  details: z.array(z.object({
    field: z.string(),
    message: z.string(),
    code: z.string().optional(),
  })).optional(),
  meta: z.object({
    timestamp: z.string().datetime(),
    version: z.string(),
    requestId: z.string().optional(),
  }),
});

/**
 * Validation error details
 */
export interface ValidationErrorDetail {
  field: string;
  message: string;
  code?: string;
}

/**
 * Standard error response structure
 */
export interface ApiErrorResponse {
  error: string;
  message: string;
  details?: ValidationErrorDetail[];
  meta: {
    timestamp: string;
    version: string;
    requestId?: string;
  };
}

/**
 * Success response structure
 */
export interface ApiSuccessResponse<T = unknown> {
  data?: T;
  meta: {
    timestamp: string;
    version: string;
    requestId?: string;
  };
}

/**
 * Pagination metadata
 */
export const PaginationMetaSchema = z.object({
  page: z.number().int().positive(),
  limit: z.number().int().positive().max(100),
  totalCount: z.number().int().min(0),
  totalPages: z.number().int().min(0),
  hasNextPage: z.boolean(),
  hasPreviousPage: z.boolean(),
});

export type PaginationMeta = z.infer<typeof PaginationMetaSchema>;

/**
 * Paginated response schema
 */
export const PaginatedResponseSchema = <T>(itemSchema: z.ZodSchema<T>) =>
  z.object({
    data: z.array(itemSchema),
    pagination: PaginationMetaSchema,
    meta: z.object({
      timestamp: z.string().datetime(),
      version: z.string(),
      requestId: z.string().optional(),
    }),
  });

/**
 * Search query base schema
 */
export const SearchQuerySchema = z.object({
  query: z
    .string()
    .max(500, 'Search query must be 500 characters or less')
    .trim()
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
  
  sortBy: z.string().default('createdAt'),
  
  sortOrder: z
    .enum(['asc', 'desc'])
    .default('desc'),
});

/**
 * Date range schema for filtering
 */
export const DateRangeSchema = z.object({
  start: z
    .string()
    .datetime('Start date must be a valid date'),
  
  end: z
    .string()
    .datetime('End date must be a valid date'),
}).refine((data) => {
  const start = new Date(data.start);
  const end = new Date(data.end);
  return start < end;
}, {
  message: 'Start date must be before end date',
  path: ['start'],
});

/**
 * File upload validation schema
 */
export const FileUploadSchema = z.object({
  filename: z
    .string()
    .min(1, 'Filename is required')
    .max(255, 'Filename must be 255 characters or less'),
  
  mimeType: z
    .string()
    .regex(/^(image\/(jpeg|jpg|png|gif|webp)|application\/pdf)$/, 'File must be an image (JPEG, PNG, GIF, WebP) or PDF'),
  
  fileSize: z
    .number()
    .int('File size must be a whole number')
    .positive('File size must be greater than 0')
    .max(10 * 1024 * 1024, 'File size cannot exceed 10MB'), // 10MB limit
});

/**
 * Utility functions for validation error handling
 */

/**
 * Transform Zod errors into a standardized format
 */
export function formatValidationErrors(error: ZodError): ValidationErrorDetail[] {
  return error.errors.map((err) => ({
    field: err.path.join('.'),
    message: err.message,
    code: err.code,
  }));
}

/**
 * Create a standardized error response
 */
export function createErrorResponse(
  error: string,
  message: string,
  details?: ValidationErrorDetail[],
  requestId?: string
): ApiErrorResponse {
  return {
    error,
    message,
    details,
    meta: {
      timestamp: new Date().toISOString(),
      version: 'v1',
      requestId,
    },
  };
}

/**
 * Create a standardized success response
 */
export function createSuccessResponse<T>(
  data?: T,
  requestId?: string
): ApiSuccessResponse<T> {
  return {
    data,
    meta: {
      timestamp: new Date().toISOString(),
      version: 'v1',
      requestId,
    },
  };
}

/**
 * Create pagination metadata
 */
export function createPaginationMeta(
  page: number,
  limit: number,
  totalCount: number
): PaginationMeta {
  const totalPages = Math.ceil(totalCount / limit);
  
  return {
    page,
    limit,
    totalCount,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
  };
}

/**
 * Handle validation errors and return standardized response
 */
export function handleValidationError(
  error: unknown,
  defaultMessage = 'Validation failed'
): ApiErrorResponse {
  if (error instanceof ZodError) {
    return createErrorResponse(
      'VALIDATION_ERROR',
      defaultMessage,
      formatValidationErrors(error)
    );
  }
  
  if (error instanceof Error) {
    return createErrorResponse(
      'VALIDATION_ERROR',
      error.message
    );
  }
  
  return createErrorResponse(
    'UNKNOWN_ERROR',
    'An unknown error occurred during validation'
  );
}

/**
 * Validation result type for service layer
 */
export type ValidationResult<T> = 
  | { success: true; data: T }
  | { success: false; error: ApiErrorResponse };

/**
 * Safe validation wrapper that returns a result object
 */
export function safeValidate<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): ValidationResult<T> {
  try {
    const validatedData = schema.parse(data);
    return { success: true, data: validatedData };
  } catch (error) {
    return { success: false, error: handleValidationError(error) };
  }
}

/**
 * Async validation wrapper for schemas with async refinements
 */
export async function safeValidateAsync<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): Promise<ValidationResult<T>> {
  try {
    const validatedData = await schema.parseAsync(data);
    return { success: true, data: validatedData };
  } catch (error) {
    return { success: false, error: handleValidationError(error) };
  }
}

/**
 * Common constants for validation
 */
export const VALIDATION_CONSTANTS = {
  MAX_QUERY_LENGTH: 500,
  MAX_PAGE_SIZE: 100,
  DEFAULT_PAGE_SIZE: 20,
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  SUPPORTED_IMAGE_TYPES: ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'],
  SUPPORTED_DOCUMENT_TYPES: ['application/pdf'],
} as const;

/**
 * Type exports
 */
export type SearchQueryInput = z.infer<typeof SearchQuerySchema>;
export type DateRangeInput = z.infer<typeof DateRangeSchema>;
export type FileUploadInput = z.infer<typeof FileUploadSchema>;