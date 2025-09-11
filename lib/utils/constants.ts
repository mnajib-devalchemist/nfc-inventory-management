/**
 * Application-wide constants for the Digital Inventory Management System.
 * 
 * This file contains all constant values used throughout the application,
 * organized by functional area for easy maintenance and consistency.
 * 
 * @category Configuration
 * @since 1.0.0
 */

export const APP_CONFIG = {
  NAME: 'Digital Inventory Manager',
  SHORT_NAME: 'DigiInventory',
  DESCRIPTION: 'NFC-Enabled Digital Inventory Management System',
  VERSION: '1.0.0',
} as const;

export const API_CONFIG = {
  VERSION: 'v1',
  BASE_PATH: '/api/v1',
  TIMEOUT: 30000, // 30 seconds
} as const;

export const PAGINATION_LIMITS = {
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
  MAX_SEARCH_LENGTH: 500,
} as const;

export const FILE_LIMITS = {
  MAX_PHOTO_SIZE: 10 * 1024 * 1024, // 10MB
  MAX_PHOTOS_PER_ITEM: 10,
  ALLOWED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/webp'] as const,
} as const;

export const VALIDATION_RULES = {
  MIN_PASSWORD_LENGTH: 8,
  MAX_NAME_LENGTH: 200,
  MAX_DESCRIPTION_LENGTH: 1000,
  MAX_TAGS_PER_ITEM: 10,
  MAX_TAG_LENGTH: 50,
} as const;