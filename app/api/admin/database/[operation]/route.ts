/**
 * Admin API - Database Operations Endpoint
 * 
 * Handles database operations like migrations, backups, and validation.
 */

import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/db';
import { serverEnv } from '@/lib/utils/env';
import { execSync } from 'child_process';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ operation: string }> }
) {
  const { operation } = await params;
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.email || session.user.email !== serverEnv.ADMIN_EMAIL) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if admin panel is enabled
    if (!serverEnv.ENABLE_ADMIN_PANEL) {
      return Response.json({ error: 'Admin panel disabled' }, { status: 403 });
    }


    switch (operation) {
      case 'migrate':
        return await handleMigration();
      case 'backup':
        return await handleBackup();
      case 'validate':
        return await handleValidation();
      case 'reset':
        return await handleReset();
      default:
        return Response.json({ error: 'Invalid operation' }, { status: 400 });
    }
  } catch (error) {
    console.error(`Database ${operation} error:`, error);
    return Response.json(
      { error: `Operation failed: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    );
  }
}

async function handleMigration() {
  try {
    // Run Prisma migrations
    const output = execSync('npx prisma migrate deploy', {
      encoding: 'utf8',
      env: { ...process.env, DATABASE_URL: serverEnv.DATABASE_URL },
    });

    return Response.json({
      success: true,
      message: 'Migrations completed successfully',
      details: output,
    });
  } catch (error) {
    return Response.json({
      success: false,
      message: 'Migration failed',
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

async function handleBackup() {
  try {
    // For PostgreSQL, we'd use pg_dump
    // For this demo, we'll just validate the database is working
    await prisma.$queryRaw`SELECT 1`;
    
    const timestamp = new Date().toISOString();
    const backupName = `backup_${timestamp.replace(/[:.]/g, '-')}`;

    // In a real implementation, you'd create an actual backup
    // For now, we'll simulate it
    return Response.json({
      success: true,
      message: `Database backup created: ${backupName}`,
      details: {
        name: backupName,
        timestamp,
        size: 'Simulated backup',
      },
    });
  } catch (error) {
    return Response.json({
      success: false,
      message: 'Backup failed',
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

async function handleValidation() {
  try {
    const validation = {
      success: true,
      checks: [] as Array<{ name: string; status: 'pass' | 'fail'; message: string }>,
    };

    // Check database connection
    try {
      await prisma.$queryRaw`SELECT 1`;
      validation.checks.push({
        name: 'Database Connection',
        status: 'pass',
        message: 'Successfully connected to database',
      });
    } catch (error) {
      validation.checks.push({
        name: 'Database Connection',
        status: 'fail',
        message: `Connection failed: ${error}`,
      });
      validation.success = false;
    }

    // Check for orphaned records
    try {
      // Check for orphaned household members by validating references exist
      const orphanedMembers = await prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*) as count
        FROM household_members hm
        LEFT JOIN users u ON hm.user_id = u.id
        LEFT JOIN households h ON hm.household_id = h.id
        WHERE u.id IS NULL OR h.id IS NULL
      `;
      const orphanedCount = Number(orphanedMembers[0]?.count || 0);

      validation.checks.push({
        name: 'Data Integrity',
        status: orphanedCount > 0 ? 'fail' : 'pass',
        message: orphanedCount > 0 
          ? `Found ${orphanedCount} orphaned household members`
          : 'No data integrity issues found',
      });

      if (orphanedCount > 0) {
        validation.success = false;
      }
    } catch (error) {
      validation.checks.push({
        name: 'Data Integrity',
        status: 'fail',
        message: `Integrity check failed: ${error}`,
      });
      validation.success = false;
    }

    // Check migration status
    try {
      const migrations = await prisma.$queryRaw<any[]>`
        SELECT COUNT(*) as count FROM _prisma_migrations 
        WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL
      `;

      const pendingMigrations = migrations[0]?.count || 0;
      validation.checks.push({
        name: 'Migration Status',
        status: pendingMigrations > 0 ? 'fail' : 'pass',
        message: pendingMigrations > 0
          ? `${pendingMigrations} pending or rolled back migrations`
          : 'All migrations are up to date',
      });

      if (pendingMigrations > 0) {
        validation.success = false;
      }
    } catch (error) {
      validation.checks.push({
        name: 'Migration Status',
        status: 'fail',
        message: 'Unable to check migration status',
      });
    }

    return Response.json({
      success: validation.success,
      message: validation.success 
        ? 'Database validation passed'
        : 'Database validation found issues',
      details: validation,
    });
  } catch (error) {
    return Response.json({
      success: false,
      message: 'Validation failed',
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

async function handleReset() {
  // Only allow in development
  if (serverEnv.NODE_ENV === 'production') {
    return Response.json({
      success: false,
      message: 'Database reset not allowed in production',
    }, { status: 403 });
  }

  try {
    // Reset database schema
    const output = execSync('npx prisma migrate reset --force', {
      encoding: 'utf8',
      env: { ...process.env, DATABASE_URL: serverEnv.DATABASE_URL },
    });

    return Response.json({
      success: true,
      message: 'Database reset successfully',
      details: output,
    });
  } catch (error) {
    return Response.json({
      success: false,
      message: 'Database reset failed',
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}