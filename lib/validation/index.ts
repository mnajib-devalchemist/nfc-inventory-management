/**
 * Validation schemas and utilities
 * Central export point for all validation-related modules
 */

// Common validation utilities
export * from './common';

// Item validation schemas
export * from './items';

// Location validation schemas  
export * from './locations';

// Search validation schemas
export * from './search';

// Authentication validation schemas
export * from './auth';

// Export validation schemas
export * from './exports';

// Re-export commonly used types and functions
export type {
  CreateItemInput,
  UpdateItemInput,
  SearchItemsInput,
  BorrowItemInput,
  ReturnItemInput,
} from './items';

export type {
  CreateLocationInput,
  UpdateLocationInput,
  SearchLocationsInput,
  MoveLocationInput,
} from './locations';

export type {
  SearchQueryInput,
  SearchFiltersInput,
  AdvancedSearchQueryInput,
  SearchSuggestionsQueryInput,
  SearchAnalyticsQueryInput,
} from './search';

export type {
  ValidationResult,
  ApiErrorResponse,
  ApiSuccessResponse,
  PaginationMeta,
  ValidationErrorDetail,
} from './common';

export type {
  RegisterFormData,
  LoginFormData,
  PasswordResetRequestData,
  PasswordResetData,
  PasswordChangeData,
  EmailVerificationData,
  ProfileUpdateData,
  AuthFormErrors,
} from './auth';

export type {
  CreateExportRequestInput,
  ExportJobInput,
  ExportProgressUpdateInput,
  ExportJobQueryInput,
  ExportStatisticsQueryInput,
  CSVExportConfigInput,
  ExportSecurityValidationInput,
  ExportErrorInput,
} from './exports';

// Re-export validation helper functions
export {
  validateCreateItem,
  validateUpdateItem,
  validateSearchItems,
  validateBorrowItem,
  validateReturnItem,
} from './items';

export {
  validateCreateLocation,
  validateUpdateLocation,
  validateSearchLocations,
  validateMoveLocation,
} from './locations';

export {
  validateSearchQuery,
  validateAdvancedSearchQuery,
  validateSearchSuggestionsQuery,
  validateSearchAnalyticsQuery,
  validateSearchMethod,
  transformSearchParams,
  sanitizeSearchText,
  validateSearchRateLimit,
} from './search';

export {
  safeValidate,
  safeValidateAsync,
  formatValidationErrors,
  createErrorResponse,
  createSuccessResponse,
  createPaginationMeta,
  handleValidationError,
} from './common';

export {
  validateCreateExportRequest,
  validateExportJob,
  validateExportProgressUpdate,
  validateExportSecurity,
} from './exports';

/**
 * Validate photo upload file
 */
export function validatePhotoUpload(file: File): {
  valid: boolean;
  error?: string;
} {
  // Check file size (max 10MB)
  const maxSize = 10 * 1024 * 1024;
  if (file.size > maxSize) {
    return {
      valid: false,
      error: `File size too large. Maximum ${maxSize / 1024 / 1024}MB allowed.`
    };
  }

  // Check file type
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
  if (!allowedTypes.includes(file.type)) {
    return {
      valid: false,
      error: `Invalid file type. Allowed types: ${allowedTypes.join(', ')}`
    };
  }

  // Check filename
  if (!file.name || file.name.length > 255) {
    return {
      valid: false,
      error: 'Invalid filename'
    };
  }

  return { valid: true };
}

/**
 * Validate item exists - placeholder for actual validation
 */
export function validateItem(itemId: string) {
  return itemId && itemId.length > 0;
}