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
 * Enhanced photo upload validation with HEIC support
 */
export function validatePhotoUpload(file: File): {
  valid: boolean;
  error?: string;
  requiresConversion?: boolean;
  format?: string;
} {
  // Check file size (max 50MB to accommodate HEIC files)
  const maxSize = 50 * 1024 * 1024;
  if (file.size > maxSize) {
    return {
      valid: false,
      error: `File size too large. Maximum ${maxSize / 1024 / 1024}MB allowed.`
    };
  }

  // Check minimum file size (prevent empty/corrupt files)
  if (file.size < 1024) {
    return {
      valid: false,
      error: 'File is too small or may be corrupted.'
    };
  }

  // Enhanced file type checking with HEIC support
  const standardTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
  const heicTypes = ['image/heic', 'image/heif'];
  const allAllowedTypes = [...standardTypes, ...heicTypes];

  // Check file extension as backup for HEIC detection
  const fileExtension = file.name.toLowerCase().split('.').pop();
  const heicExtensions = ['heic', 'heif'];
  const standardExtensions = ['jpg', 'jpeg', 'png', 'webp', 'avif'];

  const isHEICByType = heicTypes.includes(file.type);
  const isHEICByExtension = heicExtensions.includes(fileExtension || '');
  const isStandardType = standardTypes.includes(file.type);
  const isStandardExtension = standardExtensions.includes(fileExtension || '');

  const isHEIC = isHEICByType || isHEICByExtension;
  const isStandardImage = isStandardType || isStandardExtension;

  if (!isHEIC && !isStandardImage) {
    return {
      valid: false,
      error: `Invalid file type. Allowed types: ${allAllowedTypes.join(', ')}, plus HEIC/HEIF files.`
    };
  }

  // Check filename
  if (!file.name || file.name.length > 255) {
    return {
      valid: false,
      error: 'Invalid filename'
    };
  }

  // Check for suspicious filename patterns
  const suspiciousPatterns = ['.exe', '.scr', '.bat', '.cmd', '.com', '.pif', '.vbs', '.js'];
  const fileName = file.name.toLowerCase();
  if (suspiciousPatterns.some(pattern => fileName.includes(pattern))) {
    return {
      valid: false,
      error: 'Filename contains suspicious patterns'
    };
  }

  // Determine format and conversion requirements
  let format = 'unknown';
  let requiresConversion = false;

  if (isHEIC) {
    format = 'heic';
    requiresConversion = true; // HEIC files need conversion for web compatibility
  } else if (file.type === 'image/jpeg' || fileExtension === 'jpg' || fileExtension === 'jpeg') {
    format = 'jpeg';
  } else if (file.type === 'image/png' || fileExtension === 'png') {
    format = 'png';
  } else if (file.type === 'image/webp' || fileExtension === 'webp') {
    format = 'webp';
  } else if (file.type === 'image/avif' || fileExtension === 'avif') {
    format = 'avif';
  }

  return {
    valid: true,
    requiresConversion,
    format
  };
}

/**
 * Validate item exists - placeholder for actual validation
 */
export function validateItem(itemId: string) {
  return itemId && itemId.length > 0;
}