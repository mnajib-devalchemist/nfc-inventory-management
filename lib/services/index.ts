/**
 * Business logic services
 * Central export point for all service modules
 */

// Export services
export * from './items';
export * from './locations';
export * from './search';

// Export service instances
export { itemsService } from './items';
export { locationsService } from './locations';
export { searchService } from './search';