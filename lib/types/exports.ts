/**
 * Export-related TypeScript type definitions
 *
 * This module provides comprehensive type definitions for the export functionality,
 * including export jobs, CSV data structures, and progress tracking.
 *
 * @category Data Transfer Objects
 * @since 1.8.0
 */

import type { Item, Location, ItemPhoto, Tag, Household } from '@prisma/client';

/**
 * Supported export file formats
 */
export type ExportFormat = 'csv';

/**
 * Export job status states for progress tracking
 */
export type ExportJobStatus =
  | 'pending'    // Job created, waiting to start
  | 'processing' // Job actively generating export
  | 'completed'  // Export successfully generated
  | 'failed'     // Export generation failed
  | 'cancelled'; // User cancelled the export

/**
 * Export job creation request
 *
 * @interface CreateExportRequest
 * @since 1.8.0
 */
export interface CreateExportRequest {
  /**
   * Export file format (currently only CSV supported)
   * @example "csv"
   */
  format: ExportFormat;

  /**
   * Optional filters to apply to the export
   */
  filters?: {
    /** Only include items from specific locations */
    locationIds?: string[];
    /** Only include items with specific tags */
    tagNames?: string[];
    /** Only include items with specific status */
    status?: string[];
    /** Date range for item creation */
    createdAfter?: Date;
    createdBefore?: Date;
  };
}

/**
 * Export job with progress tracking and metadata
 *
 * @interface ExportJob
 * @since 1.8.0
 */
export interface ExportJob {
  /** Unique job identifier */
  id: string;

  /** User who requested the export */
  userId: string;

  /** Export file format */
  format: ExportFormat;

  /** Current job status */
  status: ExportJobStatus;

  /** Generated filename with timestamp */
  filename: string;

  /** Progress percentage (0-100) */
  progress: number;

  /** Total number of items to export */
  totalItems: number;

  /** Number of items processed so far */
  processedItems: number;

  /** File size of generated export (bytes) */
  fileSize?: number;

  /** Download URL for completed exports */
  downloadUrl?: string;

  /** Error message if export failed */
  errorMessage?: string;

  /** Export filters applied */
  filters?: CreateExportRequest['filters'];

  /** Job creation timestamp */
  createdAt: Date;

  /** Job completion timestamp */
  completedAt?: Date;

  /** Export expiration timestamp (for cleanup) */
  expiresAt?: Date;
}

/**
 * Complete item data structure for CSV export
 * Includes all relationships and computed fields
 *
 * @interface ExportItemData
 * @since 1.8.0
 */
export interface ExportItemData {
  // Core item fields
  id: string;
  name: string;
  description: string | null;
  quantity: number;
  unit: string;
  purchasePrice: number | null;
  currentValue: number | null;
  purchaseDate: Date | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;

  // Location information
  location: {
    id: string;
    name: string;
    path: string;
    type: string;
  };

  // Household information
  household: {
    id: string;
    name: string;
  };

  // Photo information
  photos: Array<{
    originalUrl: string;
    thumbnailUrl: string;
    isPrimary: boolean;
    filename: string;
  }>;

  // Tag information
  tags: Array<{
    name: string;
    color: string;
  }>;

  // Computed fields
  totalValue: number;
  photoCount: number;
  tagNames: string[];
  photoUrls: string[];
}

/**
 * CSV export configuration and formatting options
 *
 * @interface CSVExportConfig
 * @since 1.8.0
 */
export interface CSVExportConfig {
  /** Include header row with column names */
  includeHeaders: boolean;

  /** Field delimiter (default: comma) */
  delimiter: string;

  /** Text qualifier for fields containing delimiters */
  textQualifier: string;

  /** Line ending format */
  lineEnding: '\n' | '\r\n';

  /** Columns to include in export */
  columns: CSVColumn[];
}

/**
 * CSV column definition with formatting options
 *
 * @interface CSVColumn
 * @since 1.8.0
 */
export interface CSVColumn {
  /** Column key matching ExportItemData properties */
  key: keyof ExportItemData | string;

  /** Human-readable column header */
  header: string;

  /** Custom formatting function for the column value */
  formatter?: (value: unknown, item: ExportItemData) => string;

  /** Whether this column is required in the export */
  required: boolean;
}

/**
 * Export progress update for real-time status tracking
 *
 * @interface ExportProgressUpdate
 * @since 1.8.0
 */
export interface ExportProgressUpdate {
  /** Export job ID */
  jobId: string;

  /** Current status */
  status: ExportJobStatus;

  /** Progress percentage (0-100) */
  progress: number;

  /** Items processed so far */
  processedItems: number;

  /** Total items to process */
  totalItems: number;

  /** Current processing stage description */
  stage: string;

  /** Estimated time remaining (seconds) */
  estimatedTimeRemaining?: number;

  /** Error message if failed */
  errorMessage?: string;

  /** Timestamp of this update */
  timestamp: Date;
}

/**
 * Export statistics for analytics and monitoring
 *
 * @interface ExportStatistics
 * @since 1.8.0
 */
export interface ExportStatistics {
  /** Total export requests this period */
  totalExports: number;

  /** Successful exports */
  successfulExports: number;

  /** Failed exports */
  failedExports: number;

  /** Average processing time (milliseconds) */
  averageProcessingTime: number;

  /** Average file size (bytes) */
  averageFileSize: number;

  /** Largest export size (items) */
  largestExportSize: number;

  /** Most common export format */
  popularFormat: ExportFormat;

  /** Peak concurrent exports */
  peakConcurrentExports: number;
}

/**
 * Error types specific to export operations
 *
 * @interface ExportError
 * @since 1.8.0
 */
export interface ExportError extends Error {
  /** Export-specific error code */
  code: 'UNAUTHORIZED' | 'DATASET_TOO_LARGE' | 'GENERATION_FAILED' | 'PHOTO_ACCESS_DENIED' | 'MEMORY_LIMIT_EXCEEDED' | 'BACKGROUND_JOB_FAILED';

  /** Export job ID where error occurred */
  jobId?: string;

  /** Additional error context */
  context?: Record<string, any>;
}

/**
 * Security validation result for export operations
 *
 * @interface ExportSecurityValidation
 * @since 1.8.0
 */
export interface ExportSecurityValidation {
  /** Whether user has access to the requested data */
  hasAccess: boolean;

  /** Household IDs the user can access */
  accessibleHouseholds: string[];

  /** Validation timestamp */
  validatedAt: Date;

  /** Validation warnings */
  warnings: string[];
}