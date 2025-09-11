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
  ValidationResult,
  ApiErrorResponse,
  ApiSuccessResponse,
  PaginationMeta,
  ValidationErrorDetail,
} from './common';

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
  safeValidate,
  safeValidateAsync,
  formatValidationErrors,
  createErrorResponse,
  createSuccessResponse,
  createPaginationMeta,
  handleValidationError,
} from './common';