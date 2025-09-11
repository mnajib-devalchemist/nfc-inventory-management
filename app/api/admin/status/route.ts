/**
 * Admin API - System Status Endpoint
 * 
 * Provides comprehensive system status information for the admin panel.
 */

import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/db';
import { env } from '@/lib/utils/env';

export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.email || session.user.email !== env.ADMIN_EMAIL) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if admin panel is enabled
    if (!env.ENABLE_ADMIN_PANEL) {
      return Response.json({ error: 'Admin panel disabled' }, { status: 403 });
    }

    // Get database status
    const databaseStatus = await getDatabaseStatus();
    
    // Get system information
    const systemStatus = {
      database: databaseStatus,
      environment: env.NODE_ENV,
      uptime: getUptime(),
      version: '1.0.0',
      timestamp: new Date().toISOString(),
    };

    return Response.json(systemStatus);
  } catch (error) {
    console.error('Admin status error:', error);
    return Response.json(
      { error: 'Failed to fetch system status' },
      { status: 500 }
    );
  }
}

async function getDatabaseStatus() {
  try {
    // Test database connection
    await prisma.$queryRaw`SELECT 1`;
    
    // Get record counts
    const userCount = await prisma.user.count();
    const householdCount = await prisma.household.count();
    const householdMemberCount = await prisma.householdMember.count();
    const sessionCount = await prisma.session.count();
    const accountCount = await prisma.account.count();
    
    const totalRecords = userCount + householdCount + householdMemberCount + sessionCount + accountCount;
    
    // Get migration status
    let migrationCount = 0;
    try {
      const migrations = await prisma.$queryRaw<any[]>`
        SELECT COUNT(*) as count FROM _prisma_migrations WHERE finished_at IS NOT NULL
      `;
      migrationCount = migrations[0]?.count || 0;
    } catch (error) {
      // Migrations table might not exist yet
    }

    return {
      connected: true,
      recordCount: totalRecords,
      migrations: migrationCount,
      lastBackup: null, // TODO: Implement backup tracking
      details: {
        users: userCount,
        households: householdCount,
        householdMembers: householdMemberCount,
        sessions: sessionCount,
        accounts: accountCount,
      },
    };
  } catch (error) {
    return {
      connected: false,
      recordCount: 0,
      migrations: 0,
      lastBackup: null,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

function getUptime(): string {
  const uptime = process.uptime();
  const hours = Math.floor(uptime / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  const seconds = Math.floor(uptime % 60);
  
  return `${hours}h ${minutes}m ${seconds}s`;
}