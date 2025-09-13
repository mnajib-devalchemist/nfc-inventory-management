/**
 * Prisma database client configuration for the Digital Inventory Management System.
 * 
 * This module provides a singleton Prisma client instance with proper configuration
 * for development and production environments, including connection pooling and
 * development mode enhancements.
 * 
 * @category Database
 * @since 1.0.0
 */

import { PrismaClient } from '@prisma/client';

// Only access environment during runtime, not build time
const isDevelopment = process.env.NODE_ENV === 'development';

/**
 * Global type augmentation for development hot reloading.
 * Prevents multiple Prisma instances during development.
 */
declare global {
  var __prisma: PrismaClient | undefined;
}

/**
 * Prisma client singleton instance with environment-specific configuration.
 * 
 * In development, uses global variable to prevent multiple connections during hot reloads.
 * In production, creates a new instance optimized for serverless environments.
 * 
 * @example Basic usage
 * ```typescript
 * import { prisma } from '@/lib/db';
 * 
 * const users = await prisma.user.findMany();
 * ```
 */
export const prisma = 
  globalThis.__prisma ??
  new PrismaClient({
    log: isDevelopment ? ['query', 'error', 'warn'] : ['error'],
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
  });

// Store client globally in development to prevent hot reload issues
if (isDevelopment) globalThis.__prisma = prisma;

/**
 * Gracefully disconnect Prisma client on process termination.
 * Ensures proper cleanup of database connections.
 */
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

// Re-export extension utilities for easy access
export * from './extensions';

export default prisma;