/**
 * Export validation schemas using Zod
 *
 * This module provides comprehensive validation for export-related operations,
 * including request validation, job status tracking, and security boundary checks.
 *
 * @category Validation
 * @since 1.8.0
 */

import { z } from 'zod';
import type { CreateExportRequest, ExportJob, ExportProgressUpdate } from '@/lib/types/exports';

/**
 * Supported export formats validation
 */
export const ExportFormatSchema = z.enum(['csv'], {
  errorMap: () => ({ message: 'Export format must be "csv"' })
});

/**
 * Export job status validation
 */
export const ExportJobStatusSchema = z.enum(['pending', 'processing', 'completed', 'failed', 'cancelled'], {
  errorMap: () => ({ message: 'Invalid export job status' })
});

/**
 * Export filters validation schema
 * Validates optional filtering criteria for exports
 */
export const ExportFiltersSchema = z.object({
  /** Array of location UUIDs to filter by */
  locationIds: z.array(z.string().uuid('Invalid location ID format')).optional(),

  /** Array of tag names to filter by */
  tagNames: z.array(
    z.string()
      .min(1, 'Tag name cannot be empty')
      .max(50, 'Tag name cannot exceed 50 characters')
      .regex(/^[a-zA-Z0-9\-_\s]+$/, 'Tag name contains invalid characters')
  ).optional(),

  /** Array of item statuses to filter by */
  status: z.array(
    z.enum(['AVAILABLE', 'BORROWED', 'MAINTENANCE', 'LOST', 'SOLD'])
  ).optional(),

  /** Date range for filtering items by creation date */
  createdAfter: z.coerce.date().optional(),
  createdBefore: z.coerce.date().optional(),
}).strict().refine((data) => {
  // Ensure createdAfter is before createdBefore if both are provided
  if (data.createdAfter && data.createdBefore) {
    return data.createdAfter <= data.createdBefore;
  }
  return true;
}, {
  message: 'createdAfter must be before or equal to createdBefore',
  path: ['createdAfter']
});

/**
 * Create export request validation schema
 * Validates the initial export request from the client
 */
export const CreateExportRequestSchema = z.object({
  /** Export format - currently only CSV supported */
  format: ExportFormatSchema,

  /** Optional filters to apply to the export */
  filters: ExportFiltersSchema.optional(),
}).strict();

/**
 * Export job validation schema
 * Used for validating complete export job objects
 */
export const ExportJobSchema = z.object({
  id: z.string().uuid('Invalid export job ID'),
  userId: z.string().cuid('Invalid user ID'),
  format: ExportFormatSchema,
  status: ExportJobStatusSchema,
  filename: z.string().min(1, 'Filename cannot be empty'),
  progress: z.number().min(0).max(100, 'Progress must be between 0 and 100'),
  totalItems: z.number().min(0, 'Total items cannot be negative'),
  processedItems: z.number().min(0, 'Processed items cannot be negative'),
  fileSize: z.number().positive('File size must be positive').optional(),
  downloadUrl: z.string().url('Invalid download URL').optional(),
  errorMessage: z.string().optional(),
  filters: ExportFiltersSchema.optional(),
  createdAt: z.date(),
  completedAt: z.date().optional(),
  expiresAt: z.date().optional(),
}).strict().refine((data) => {
  // Ensure processed items doesn't exceed total items
  return data.processedItems <= data.totalItems;
}, {
  message: 'Processed items cannot exceed total items',
  path: ['processedItems']
}).refine((data) => {
  // Ensure completed jobs have completion timestamp
  if (data.status === 'completed') {
    return !!data.completedAt;
  }
  return true;
}, {
  message: 'Completed jobs must have a completion timestamp',
  path: ['completedAt']
});

/**
 * Export progress update validation schema
 * Used for real-time progress updates during export generation
 */
export const ExportProgressUpdateSchema = z.object({
  jobId: z.string().uuid('Invalid job ID'),
  status: ExportJobStatusSchema,
  progress: z.number().min(0).max(100),
  processedItems: z.number().min(0),
  totalItems: z.number().min(0),
  stage: z.string().min(1, 'Stage description cannot be empty'),
  estimatedTimeRemaining: z.number().positive().optional(),
  errorMessage: z.string().optional(),
  timestamp: z.date(),
}).strict().refine((data) => {
  return data.processedItems <= data.totalItems;
}, {
  message: 'Processed items cannot exceed total items',
  path: ['processedItems']
});

/**
 * Export job query parameters validation
 * Used for validating query parameters in export API endpoints
 */
export const ExportJobQuerySchema = z.object({
  /** Job ID for status checking or download */
  jobId: z.string().uuid('Invalid job ID format'),

  /** Whether to include download URL in response */
  includeDownloadUrl: z.coerce.boolean().default(false),
}).strict();

/**
 * Export statistics query validation
 * Used for analytics endpoints
 */
export const ExportStatisticsQuerySchema = z.object({
  /** Start date for statistics period */
  startDate: z.coerce.date().optional(),

  /** End date for statistics period */
  endDate: z.coerce.date().optional(),

  /** Household ID to filter statistics */
  householdId: z.string().cuid().optional(),
}).strict().refine((data) => {
  if (data.startDate && data.endDate) {
    return data.startDate <= data.endDate;
  }
  return true;
}, {
  message: 'Start date must be before or equal to end date',
  path: ['startDate']
});

/**
 * CSV export configuration validation
 */
export const CSVExportConfigSchema = z.object({
  includeHeaders: z.boolean().default(true),
  delimiter: z.string().length(1, 'Delimiter must be a single character').default(','),
  textQualifier: z.string().length(1, 'Text qualifier must be a single character').default('"'),
  lineEnding: z.enum(['\n', '\r\n']).default('\n'),
}).strict();

/**
 * Security validation for export operations
 * Ensures user can only export their own household data
 */
export const ExportSecurityValidationSchema = z.object({
  userId: z.string().cuid('Invalid user ID'),
  requestedHouseholdIds: z.array(z.string().cuid()).optional(),
  maxItemsAllowed: z.number().positive().default(10000),
}).strict();

/**
 * Export error validation schema
 */
export const ExportErrorSchema = z.object({
  code: z.enum([
    'UNAUTHORIZED',
    'DATASET_TOO_LARGE',
    'EXPORT_GENERATION_FAILED',
    'PHOTO_ACCESS_DENIED',
    'MEMORY_LIMIT_EXCEEDED',
    'BACKGROUND_JOB_FAILED'
  ]),
  message: z.string().min(1),
  jobId: z.string().uuid().optional(),
  context: z.record(z.any()).optional(),
}).strict();

// Type exports for use in other modules
export type CreateExportRequestInput = z.infer<typeof CreateExportRequestSchema>;
export type ExportJobInput = z.infer<typeof ExportJobSchema>;
export type ExportProgressUpdateInput = z.infer<typeof ExportProgressUpdateSchema>;
export type ExportJobQueryInput = z.infer<typeof ExportJobQuerySchema>;
export type ExportStatisticsQueryInput = z.infer<typeof ExportStatisticsQuerySchema>;
export type CSVExportConfigInput = z.infer<typeof CSVExportConfigSchema>;
export type ExportSecurityValidationInput = z.infer<typeof ExportSecurityValidationSchema>;
export type ExportErrorInput = z.infer<typeof ExportErrorSchema>;

/**
 * Validation helper functions
 */

/**
 * Validates and sanitizes export request data
 *
 * @param data - Raw export request data
 * @returns Validated and sanitized export request
 * @throws {z.ZodError} When validation fails
 */
export function validateCreateExportRequest(data: unknown): CreateExportRequestInput {
  return CreateExportRequestSchema.parse(data);
}

/**
 * Validates export job data with business rules
 *
 * @param data - Raw export job data
 * @returns Validated export job
 * @throws {z.ZodError} When validation fails
 */
export function validateExportJob(data: unknown): ExportJobInput {
  return ExportJobSchema.parse(data);
}

/**
 * Validates progress update data
 *
 * @param data - Raw progress update data
 * @returns Validated progress update
 * @throws {z.ZodError} When validation fails
 */
export function validateExportProgressUpdate(data: unknown): ExportProgressUpdateInput {
  return ExportProgressUpdateSchema.parse(data);
}

/**
 * Security boundary validation for export operations
 * Ensures user can only access their own household data
 *
 * @param userId - User requesting the export
 * @param requestedData - Data being requested for export
 * @returns Security validation result
 */
export function validateExportSecurity(data: unknown): ExportSecurityValidationInput {
  return ExportSecurityValidationSchema.parse(data);
}