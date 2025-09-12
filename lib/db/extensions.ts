/**
 * Database extension validation and management utilities.
 * 
 * This module provides functions to check for PostgreSQL extension availability
 * and implement fallback mechanisms when extensions are not available in the
 * deployment environment.
 * 
 * @since 1.4.0
 * @category Database
 */

import { prisma } from '@/lib/db';

export interface ExtensionStatus {
  pg_trgm: boolean;
  unaccent: boolean;
  uuid_ossp: boolean;
  fullTextSearchCapable: boolean;
}

/**
 * Check which PostgreSQL extensions are available and enabled in the current database.
 * 
 * This function queries the PostgreSQL system catalogs to determine extension
 * availability and provides fallback capability information for search functionality.
 * 
 * @returns Promise<ExtensionStatus> Object containing availability status for each extension
 * 
 * @example Check extension status before implementing search
 * ```typescript
 * const extensions = await checkExtensionAvailability();
 * if (extensions.fullTextSearchCapable) {
 *   await implementFullTextSearch();
 * } else {
 *   await implementFallbackSearch();
 * }
 * ```
 * 
 * @throws {Error} When database query fails or connection is unavailable
 */
export async function checkExtensionAvailability(): Promise<ExtensionStatus> {
  try {
    // Check if extensions are installed and available
    const availableExtensions = await prisma.$queryRaw<Array<{name: string}>>`
      SELECT name FROM pg_available_extensions 
      WHERE name IN ('pg_trgm', 'unaccent', 'uuid-ossp')
    `;

    // Check if extensions are currently installed
    const installedExtensions = await prisma.$queryRaw<Array<{extname: string}>>`
      SELECT extname FROM pg_extension 
      WHERE extname IN ('pg_trgm', 'unaccent', 'uuid-ossp')
    `;

    const available = new Set(availableExtensions.map(ext => ext.name));
    const installed = new Set(installedExtensions.map(ext => ext.extname));

    const status: ExtensionStatus = {
      pg_trgm: available.has('pg_trgm') && installed.has('pg_trgm'),
      unaccent: available.has('unaccent') && installed.has('unaccent'),
      uuid_ossp: available.has('uuid-ossp') && installed.has('uuid-ossp'),
      fullTextSearchCapable: false,
    };

    // Full-text search is capable if we have at least pg_trgm
    status.fullTextSearchCapable = status.pg_trgm;

    return status;
  } catch (error) {
    console.error('Failed to check extension availability:', error);
    
    // Return safe defaults assuming no extensions available
    return {
      pg_trgm: false,
      unaccent: false,
      uuid_ossp: false,
      fullTextSearchCapable: false,
    };
  }
}

/**
 * Attempt to install required extensions if they're available but not installed.
 * 
 * This function tries to install extensions that are available in the PostgreSQL
 * installation but not currently enabled in the database. It safely handles
 * permissions issues and logs the results.
 * 
 * @param requiredExtensions - Array of extension names to install
 * @returns Promise<ExtensionStatus> Updated status after installation attempts
 * 
 * @example Install search extensions during setup
 * ```typescript
 * const status = await installExtensions(['pg_trgm', 'unaccent']);
 * if (!status.fullTextSearchCapable) {
 *   console.warn('Full-text search not available, using fallback');
 * }
 * ```
 */
export async function installExtensions(
  requiredExtensions: string[] = ['pg_trgm', 'unaccent', 'uuid-ossp']
): Promise<ExtensionStatus> {
  try {
    for (const extension of requiredExtensions) {
      try {
        await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS "${extension}"`);
        console.log(`Successfully installed/verified extension: ${extension}`);
      } catch (error) {
        console.warn(`Could not install extension ${extension}:`, error);
        // Continue with other extensions
      }
    }

    // Return updated status after installation attempts
    return await checkExtensionAvailability();
  } catch (error) {
    console.error('Failed to install extensions:', error);
    return await checkExtensionAvailability();
  }
}

/**
 * Validate that the database is properly configured for the application.
 * 
 * This function performs comprehensive validation of database configuration,
 * extension availability, and provides recommendations for optimal performance.
 * 
 * @returns Promise<{valid: boolean, warnings: string[], recommendations: string[]}>
 * 
 * @example Validate database during application startup
 * ```typescript
 * const validation = await validateDatabaseConfiguration();
 * if (!validation.valid) {
 *   console.error('Database validation failed');
 *   process.exit(1);
 * }
 * validation.warnings.forEach(warning => console.warn(warning));
 * ```
 */
export async function validateDatabaseConfiguration(): Promise<{
  valid: boolean;
  warnings: string[];
  recommendations: string[];
}> {
  const warnings: string[] = [];
  const recommendations: string[] = [];
  let valid = true;

  try {
    const extensions = await checkExtensionAvailability();

    // Check critical extensions
    if (!extensions.uuid_ossp) {
      warnings.push('uuid-ossp extension not available - UUID generation may be slower');
      recommendations.push('Install uuid-ossp extension for optimal UUID performance');
    }

    // Check search capabilities
    if (!extensions.fullTextSearchCapable) {
      warnings.push('Full-text search extensions not available - using fallback ILIKE search');
      recommendations.push('Install pg_trgm extension for optimal search performance');
    }

    if (!extensions.unaccent) {
      warnings.push('unaccent extension not available - accent-sensitive search only');
      recommendations.push('Install unaccent extension for better international text search');
    }

    // Test basic database connectivity and permissions
    try {
      await prisma.$queryRaw`SELECT 1 as test`;
    } catch (error) {
      valid = false;
      warnings.push('Database connectivity test failed');
    }

    return {
      valid,
      warnings,
      recommendations,
    };
  } catch (error) {
    console.error('Database validation failed:', error);
    return {
      valid: false,
      warnings: ['Database validation could not complete'],
      recommendations: ['Check database connection and permissions'],
    };
  }
}

/**
 * Get the appropriate search configuration based on available extensions.
 * 
 * This function returns configuration parameters that should be used by the
 * search service based on which extensions are available in the current environment.
 * 
 * @returns Promise<SearchConfiguration> Configuration object for search implementation
 */
export interface SearchConfiguration {
  useFullTextSearch: boolean;
  useTrigramSearch: boolean;
  useUnaccent: boolean;
  indexingStrategy: 'background' | 'trigger' | 'manual';
  fallbackToIlike: boolean;
}

export async function getSearchConfiguration(): Promise<SearchConfiguration> {
  const extensions = await checkExtensionAvailability();

  return {
    useFullTextSearch: extensions.fullTextSearchCapable,
    useTrigramSearch: extensions.pg_trgm,
    useUnaccent: extensions.unaccent,
    indexingStrategy: 'background', // Always use background jobs for performance
    fallbackToIlike: !extensions.fullTextSearchCapable,
  };
}