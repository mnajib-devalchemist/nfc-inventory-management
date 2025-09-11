/**
 * Database optimization utilities for the inventory management system
 */

import { prisma } from '@/lib/db';

/**
 * Performance monitoring and optimization utilities
 */
export class DatabaseOptimizer {
  /**
   * Analyze slow queries and suggest optimizations
   */
  static async analyzePerformance() {
    try {
      // Get table sizes
      const tableSizes = await prisma.$queryRaw<{
        table_name: string;
        row_count: bigint;
        table_size: string;
        index_size: string;
      }[]>`
        SELECT 
          schemaname as schema_name,
          tablename as table_name,
          attname as column_name,
          n_distinct,
          correlation
        FROM pg_stats 
        WHERE schemaname = 'public' 
        AND tablename IN ('items', 'locations', 'users', 'households')
        ORDER BY tablename, attname;
      `;

      // Check for missing indexes
      const indexUsage = await prisma.$queryRaw<{
        table_name: string;
        index_name: string;
        idx_scan: bigint;
        idx_tup_read: bigint;
        idx_tup_fetch: bigint;
      }[]>`
        SELECT 
          schemaname as schema_name,
          tablename as table_name,
          indexname as index_name,
          idx_scan,
          idx_tup_read,
          idx_tup_fetch
        FROM pg_stat_user_indexes 
        WHERE schemaname = 'public'
        ORDER BY idx_scan DESC;
      `;

      return {
        tableSizes,
        indexUsage,
        timestamp: new Date(),
        recommendations: DatabaseOptimizer.generateRecommendations(tableSizes, indexUsage)
      };

    } catch (error) {
      console.error('Database performance analysis failed:', error);
      throw new Error('Failed to analyze database performance');
    }
  }

  /**
   * Generate optimization recommendations
   */
  private static generateRecommendations(
    tableSizes: any[],
    indexUsage: any[]
  ): string[] {
    const recommendations: string[] = [];

    // Check for unused indexes
    const unusedIndexes = indexUsage.filter(idx => Number(idx.idx_scan) === 0);
    if (unusedIndexes.length > 0) {
      recommendations.push(
        `Consider removing ${unusedIndexes.length} unused indexes to improve write performance`
      );
    }

    // Check for tables that might need partitioning
    const largeTables = tableSizes.filter(table => 
      Number(table.row_count || 0) > 100000
    );
    if (largeTables.length > 0) {
      recommendations.push(
        `Consider partitioning large tables: ${largeTables.map(t => t.table_name).join(', ')}`
      );
    }

    // General recommendations
    recommendations.push(
      'Run VACUUM ANALYZE periodically to update table statistics',
      'Monitor query performance with pg_stat_statements extension',
      'Consider connection pooling for high-traffic scenarios'
    );

    return recommendations;
  }

  /**
   * Optimize database by running maintenance commands
   */
  static async performMaintenance() {
    try {
      // Update table statistics
      await prisma.$executeRaw`ANALYZE;`;

      // Reindex critical tables if needed
      await prisma.$executeRaw`REINDEX TABLE items;`;
      await prisma.$executeRaw`REINDEX TABLE locations;`;

      return {
        success: true,
        timestamp: new Date(),
        operations: ['ANALYZE', 'REINDEX items', 'REINDEX locations']
      };

    } catch (error) {
      console.error('Database maintenance failed:', error);
      throw new Error('Failed to perform database maintenance');
    }
  }

  /**
   * Get database health metrics
   */
  static async getHealthMetrics() {
    try {
      // Connection stats
      const connectionStats = await prisma.$queryRaw<{
        state: string;
        count: bigint;
      }[]>`
        SELECT state, count(*) as count
        FROM pg_stat_activity 
        WHERE datname = current_database()
        GROUP BY state;
      `;

      // Database size
      const dbSize = await prisma.$queryRaw<{
        size: string;
      }[]>`
        SELECT pg_size_pretty(pg_database_size(current_database())) as size;
      `;

      // Cache hit ratio
      const cacheHitRatio = await prisma.$queryRaw<{
        cache_hit_ratio: number;
      }[]>`
        SELECT 
          round(
            100 * sum(blks_hit) / nullif(sum(blks_hit) + sum(blks_read), 0), 2
          ) as cache_hit_ratio
        FROM pg_stat_database 
        WHERE datname = current_database();
      `;

      return {
        connectionStats,
        databaseSize: dbSize[0]?.size || 'Unknown',
        cacheHitRatio: cacheHitRatio[0]?.cache_hit_ratio || 0,
        timestamp: new Date()
      };

    } catch (error) {
      console.error('Failed to get health metrics:', error);
      throw new Error('Failed to retrieve database health metrics');
    }
  }

  /**
   * Optimize specific queries based on usage patterns
   */
  static async optimizeCommonQueries() {
    try {
      // Create covering indexes for common query patterns
      const optimizations = [];

      // Items search optimization
      try {
        await prisma.$executeRaw`
          CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_items_search_covering 
          ON items (household_id, status, name) 
          INCLUDE (description, quantity, location_id);
        `;
        optimizations.push('Created covering index for item searches');
      } catch (e) {
        // Index might already exist
      }

      // Location hierarchy optimization
      try {
        await prisma.$executeRaw`
          CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_locations_hierarchy_covering 
          ON locations (household_id, parent_id, level) 
          INCLUDE (name, location_type, path);
        `;
        optimizations.push('Created covering index for location hierarchy');
      } catch (e) {
        // Index might already exist
      }

      return {
        success: true,
        optimizations,
        timestamp: new Date()
      };

    } catch (error) {
      console.error('Query optimization failed:', error);
      throw new Error('Failed to optimize common queries');
    }
  }
}

/**
 * Connection pool optimization
 */
export const optimizeConnectionPool = () => {
  // These settings should be configured in the DATABASE_URL or Prisma client configuration
  return {
    recommendations: [
      'Set connection_limit based on your server capacity (typically 10-20 for small apps)',
      'Configure pool_timeout to prevent hanging connections',
      'Use connection pooling services like PgBouncer for production',
      'Monitor connection usage with pg_stat_activity'
    ],
    optimalSettings: {
      connection_limit: 15,
      pool_timeout: 10,
      connect_timeout: 5
    }
  };
};